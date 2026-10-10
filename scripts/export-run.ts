// K1: one markdown file for one thought: the dialogue (voice answers: raw Whisper text and the normalized text), accepted facts,
// script versions with "what changed", and the tokens of the model calls. READ-ONLY, LOCAL DATABASE ONLY.
//
// Run (local test Postgres, see docs/LOCAL_LIVE_RUN.md):
//   TEST_DATABASE_URL=<local url> npx tsx scripts/export-run.ts --thought=<reelId> [--out=run.md]
// The database is taken from TEST_DATABASE_URL only (localhost / 127.0.0.1, never Supabase); DATABASE_URL is not read.
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { normalizeTranscript } from "../src/lib/author-speech";
import { assertTestDatabaseUrl } from "../src/lib/db-target";

type Db = Pick<PrismaClient, "reel" | "dialogueThread" | "dialogueMessage" | "thoughtState" | "scriptVersion" | "scriptDraft" | "aiCall">;

const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const fence = (text: string) => text.split("\n").map((line) => `> ${line}`).join("\n");
const iso = (date: Date) => date.toISOString().replace("T", " ").slice(0, 19);

export async function renderRunMarkdown(db: Db, reelId: string): Promise<string> {
  const reel = await db.reel.findUnique({ where: { id: reelId }, select: { id: true, title: true, createdAt: true } });
  if (!reel) throw new Error(`thought ${reelId} not found`);
  const thread = await db.dialogueThread.findUnique({ where: { reelId } });
  const messages = thread ? await db.dialogueMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } }) : [];
  const calls = await db.aiCall.findMany({ where: { reelId }, orderBy: { createdAt: "asc" } });
  const callById = new Map(calls.map((call) => [call.id, call]));
  const state = await db.thoughtState.findUnique({ where: { reelId } });
  const versions = await db.scriptVersion.findMany({ where: { reelId }, orderBy: { createdAt: "asc" } });
  const draft = await db.scriptDraft.findUnique({ where: { reelId } });

  const out: string[] = [`# Экспорт мысли «${reel.title}»`, "", `- id: \`${reel.id}\``, `- создана: ${iso(reel.createdAt)} UTC`, `- сообщений в диалоге: ${messages.length}`, ""];

  out.push("## Диалог", "");
  const indexOf = new Map<string, number>();
  let n = 0;
  for (const message of messages) {
    if (message.role === "assistant" && message.status === "processing") continue;
    n += 1;
    indexOf.set(message.id, n);
    const payload = parse<{ voiceDurationLabel?: string; aiCallId?: string; discardedUpdates?: string[] }>(message.payloadJson, {});
    if (message.role === "user") {
      const voice = Boolean(payload.voiceDurationLabel);
      out.push(`### ${n}. Автор${voice ? ` (голос, ${payload.voiceDurationLabel})` : ""} · ${iso(message.createdAt)}`, "");
      if (voice) {
        out.push("Сырой текст Whisper:", "", fence(message.body), "", "Нормализованный текст (границы предложений, как их видит сервер):", "", fence(normalizeTranscript(message.body)), "");
      } else {
        out.push(fence(message.body), "");
      }
    } else {
      const call = payload.aiCallId ? callById.get(payload.aiCallId) : undefined;
      const tokens = call ? `${call.promptTokens ?? 0} + ${call.completionTokens ?? 0} токенов` : "токены не сохранены";
      out.push(`### ${n}. Vocal (${message.kind}${message.status === "done" ? "" : `, ${message.status}`}) · ${iso(message.createdAt)} · ${tokens}`, "", fence(message.body), "");
      const marks = payload.discardedUpdates ?? [];
      if (marks.length) out.push(`Пометки сервера: ${marks.map((mark) => `\`${mark}\``).join(", ")}`, "");
    }
  }

  out.push("## Принятые факты", "");
  const facts = parse<{ id?: string; text: string; sourceId?: string }[]>(state?.factsJson, []);
  if (facts.length === 0) out.push("_Нет._", "");
  facts.forEach((fact, i) => {
    const at = fact.sourceId ? indexOf.get(fact.sourceId) : undefined;
    out.push(`${i + 1}. ${fact.text}${at ? ` _(из сообщения ${at})_` : ""}`);
  });
  if (facts.length) out.push("");

  out.push("## Версии сценария", "");
  if (versions.length === 0 && !draft) out.push("_Сценариев нет._", "");
  for (const version of versions) {
    out.push(`### ${version.kind} · ${iso(version.createdAt)}${version.model ? ` · ${version.model}` : ""}${version.promptVersion ? ` · ${version.promptVersion}` : ""}`, "", `id: \`${version.id}\``, "", fence(version.body || "(пусто)"), "");
    const call = calls.find((item) => item.kind === "script" && item.status === "done" && item.resultJson?.includes(version.id));
    const changes = parse<{ versionId?: string; changes?: unknown }>(call?.resultJson, {});
    if (changes.versionId === version.id && Array.isArray(changes.changes) && changes.changes.length) {
      out.push("Что изменено (как записано моделью, до фильтра показа):", ...changes.changes.map((item) => `- ${String(item)}`), "");
    }
  }
  if (draft) out.push(`### Черновик · обновлён ${iso(draft.updatedAt)}`, "", fence(draft.body || "(пусто)"), "");

  out.push("## Токены", "", "| № | вид | статус | prompt | completion | время |", "| --- | --- | --- | --- | --- | --- |");
  let prompt = 0;
  let completion = 0;
  calls.forEach((call, i) => {
    prompt += call.promptTokens ?? 0;
    completion += call.completionTokens ?? 0;
    out.push(`| ${i + 1} | ${call.kind} | ${call.status} | ${call.promptTokens ?? "—"} | ${call.completionTokens ?? "—"} | ${iso(call.createdAt)} |`);
  });
  out.push("", `Итого: ${prompt} + ${completion} = ${prompt + completion} токенов (вызовов: ${calls.length}). Распознавание голоса (kind \`stt\`) хранит в prompt секунды звука, а не токены.`, "");
  return out.join("\n");
}

async function main() {
  const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const thought = arg("thought");
  const outPath = arg("out");
  if (!thought) throw new Error("usage: tsx scripts/export-run.ts --thought=<reelId> [--out=run.md]");
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) throw new Error("TEST_DATABASE_URL (local Postgres) is required; DATABASE_URL is never used");
  const prisma = new PrismaClient({ datasources: { db: { url: assertTestDatabaseUrl(url) } } });
  try {
    const markdown = await renderRunMarkdown(prisma, thought);
    if (outPath) writeFileSync(outPath, markdown);
    else process.stdout.write(markdown);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("export-run failed:", error instanceof Error ? error.message : "error");
    process.exit(1);
  });
}
