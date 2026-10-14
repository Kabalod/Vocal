import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const env = process.env as Record<string, string | undefined>;

test("L1 report: per user, per kind, STT apart, the day's total against the provider limit; no prompt text", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  const saved = { limit: env.VOCAL_PROVIDER_DAILY_TOKEN_LIMIT, user: env.VOCAL_DAILY_TOKEN_LIMIT };
  env.VOCAL_PROVIDER_DAILY_TOKEN_LIMIT = "1000";
  env.VOCAL_DAILY_TOKEN_LIMIT = "400";
  t.after(async () => {
    for (const [k, v] of [["VOCAL_PROVIDER_DAILY_TOKEN_LIMIT", saved.limit], ["VOCAL_DAILY_TOKEN_LIMIT", saved.user]] as const) { if (v === undefined) delete env[k]; else env[k] = v; }
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const yesterday = new Date(now.getTime() - 20 * 3600_000);
  const call = (ownerUserId: string, kind: string, status: string, p: number | null, c: number | null, createdAt = now) =>
    prisma.aiCall.create({ data: { kind, model: "m", status, promptText: "SECRET PROMPT", inputSnapshotJson: "{}", responseText: "SECRET ANSWER", promptTokens: p, completionTokens: c, ownerUserId, createdAt } });
  await call("u1", "dialogue", "done", 100, 50);
  await call("u1", "script", "done", 200, 100);
  await call("u1", "stt", "done", 30, 0);
  await call("u2", "dialogue", "error", 40, 10);
  await call("u2", "dialogue", "queued", null, null);
  await call("u2", "stt", "done", 45, null);
  await call("u1", "dialogue", "done", 500, 100, yesterday); // another calendar day, inside the rolling 24h of "now"

  const { loadDailyReport, renderDailyReportMarkdown } = await import("../src/lib/ai/daily-report");
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const report = await loadDailyReport({ day, now: new Date(now.getTime() + 3600_000) });
  assert.equal(report.chatTokensDay, 150 + 300 + 50);
  assert.equal(report.providerUsedPercentDay, 50);
  assert.equal(report.chatTokensLast24h, 500 + 600, "rolling window includes the previous evening");
  assert.equal(report.sttSecondsDay, 75, "STT seconds are apart from tokens");
  assert.equal(report.sttCallsDay, 2);
  assert.equal(report.callsDay, 6);
  assert.equal(report.errorsDay, 1);
  assert.equal(report.callsWithoutTokens, 1);
  const u1 = report.byUser.find((u) => u.ownerUserId === "u1")!;
  assert.deepEqual([u1.chatTokens, u1.sttSeconds, u1.tokenLimitUsedPercent], [450, 30, 112.5]);
  const u2 = report.byUser.find((u) => u.ownerUserId === "u2")!;
  assert.deepEqual([u2.chatTokens, u2.sttSeconds, u2.errors], [50, 45, 1]);
  const dialogue = report.byKind.find((k) => k.kind === "dialogue")!;
  assert.deepEqual([dialogue.calls, dialogue.totalTokens], [3, 200]);
  assert.equal(report.byKind.find((k) => k.kind === "stt")!.totalTokens, 0, "STT never adds to tokens");

  // peak per minute: u1 dialogue 150 + u1 script 300 + u2 dialogue 50 (+ one queued row) are all at `now`; yesterday's call is 20 h earlier
  assert.equal(report.peak.tokensPerMinute.value, 500);
  assert.equal(report.peak.requestsPerMinute.value, 4, "chat calls only (no STT)");
  assert.equal(report.limits.providerTokensPerMinute, 8000);
  assert.equal(report.peak.tokensPerMinuteUsedPercent, 6.3);

  const md = renderDailyReportMarkdown(report);
  assert.match(md, /Пик токенов за 60 с/);
  assert.match(md, /500 из 1 000 \(50%\)/);
  assert.doesNotMatch(md, /SECRET/);
  assert.doesNotMatch(JSON.stringify(report), /SECRET/);
});

test("L1 report: the script writes a .md and a .json file for the day", async (t) => {
  const { prisma, url } = await withPostgresTestDb(t);
  t.after(async () => { await prisma.$disconnect(); await resetPrismaClient(); });
  await prisma.aiCall.create({ data: { kind: "dialogue", model: "m", status: "done", promptText: "", inputSnapshotJson: "{}", promptTokens: 10, completionTokens: 5, ownerUserId: "u1" } });
  const dir = mkdtempSync(path.join(os.tmpdir(), "vocal-report-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = execFileSync("node_modules/.bin/tsx", ["scripts/ai-daily-report.ts", "--out-dir", dir], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", TEST_DATABASE_URL: url, DATABASE_URL: url },
    encoding: "utf8",
  });
  const [mdPath, jsonPath] = out.trim().split("\n");
  assert.ok(mdPath.startsWith(dir) && mdPath.endsWith(".md") && jsonPath.endsWith(".json"));
  assert.match(readFileSync(mdPath, "utf8"), /Расход модели за \d{4}-\d{2}-\d{2}/);
  assert.equal(JSON.parse(readFileSync(jsonPath, "utf8")).chatTokensDay, 15);
});

test("L1 report: peak per minute uses a sliding 60 s window and ignores STT", async () => {
  const { peakPerMinute } = await import("../src/lib/ai/daily-report");
  const at = (s: number) => new Date(Date.UTC(2026, 9, 15, 10, 0, s));
  const row = (s: number, p: number, kind = "dialogue", status = "done") => ({ kind, status, ownerUserId: "u", promptTokens: p, completionTokens: 0, createdAt: at(s) });
  const peak = peakPerMinute([row(0, 100), row(30, 200), row(59, 300), row(61, 50), row(62, 9999, "stt"), row(125, 400), row(130, 700, "dialogue", "rate_limited")]);
  assert.equal(peak.tokens.value, 600, "0–59 s window: 100+200+300; the rate_limited row has no tokens");
  assert.equal(peak.requests.value, 3, "at most three chat calls in any 60 s (the row at 0 leaves the window when 61 arrives; STT is not counted)");
  assert.equal(peak.requests.at, "2026-10-15T10:00:00.000Z");
});
