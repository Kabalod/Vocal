#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { setTimeout: delay } = require("node:timers/promises");

const image = "postgres:16-alpine";
const user = "postgres";
const password = "vocal_test";
const database = "vocal_test";
const container = `vocal-test-pg-${process.pid}-${randomBytes(3).toString("hex")}`;

const authTests = [
  "tests/session-owner.test.ts",
  "tests/db-target.test.ts",
  "tests/auth-isolation.test.ts",
  "tests/private-storage.test.ts",
  "tests/supabase-profiles-rls.test.ts",
  "tests/criteria-write.test.ts",
];

/** Live-model tests. Never part of any runner: they call the paid provider (see tests/runner-coverage.test.ts). */
const liveModelTests = ["tests/c00-classify-live.test.ts", "tests/c00-live-model.test.ts"];

const i07Tests = ["tests/i07-gateway.test.ts", "tests/runner-coverage.test.ts"];

const s3Tests = ["tests/s3-entry-cleanup.test.ts"];

const s2Tests = ["tests/s2-data-deletion.test.ts"];

const s4Tests = ["tests/s4-restart.test.ts", "tests/s4-ops.test.ts"];

const rTests = ["tests/r1-base-script.test.ts", "tests/k0-gap-kinds.test.ts", "tests/r2-take-diagnosis.test.ts", "tests/r3-off-topic.test.ts", "tests/r3-author-text-guard.test.ts", "tests/r4-assembly.test.ts", "tests/r5-offtopic-redirect.test.ts", "tests/r5-take-proposal.test.ts", "tests/style-fillers.test.ts", "tests/author-speech.test.ts", "tests/quota.test.ts", "tests/question-guard-flow.test.ts", "tests/question-guard.test.ts", "tests/speech-hygiene.test.ts", "tests/substantive.test.ts", "tests/json-budget.test.ts", "tests/turn-policy.test.ts", "tests/turn-guards.test.ts", "tests/r5-question-repeat.test.ts", "tests/bad-model-answers.test.ts", "tests/recorded-stand.test.ts"];

const dbTests = [
  ...authTests,
  ...i07Tests,
  ...s3Tests,
  ...s2Tests,
  ...s4Tests,
  ...rTests,
  "tests/v04-01-union.test.ts",
  "tests/v04-02-envelope.test.ts",
  "tests/v04-03-slice.test.ts",
  "tests/v05-generate-keys.test.ts",
  "tests/c00-classify-skip-model.test.ts",
  "tests/p01-6-2-final.test.ts",
  "tests/landing.test.ts",
  "tests/reels-workspace.test.ts",
  "tests/reels-takes.test.ts",
  "tests/pipeline-recovery.test.ts",
  "tests/creator-profile.test.ts",
  "tests/reviews-questions.test.ts",
  "tests/scripts.test.ts",
  "tests/thoughts-list.test.ts",
  "tests/p01-1-archive-contracts.test.ts",
  "tests/p01-5-archive-preview.test.ts",
  "tests/p01-6-1-archive-core.test.ts",
  "tests/thought-text-create.test.ts",
  "tests/thought-media-create.test.ts",
  "tests/thought-script-draft.test.ts",
  "tests/thought-dialogue.test.ts",
  "tests/v01-working-take.test.ts",
  "tests/v02-thought-state.test.ts",
  "tests/v03-agent-actions.test.ts",
  "tests/c00-envelope.test.ts",
  "tests/c00-router.test.ts",
  "tests/c00-apply.test.ts",
  "tests/c00-eval.test.ts",
  "tests/c00-classify-signal.test.ts",
  "tests/c00-classify-dialogue.test.ts",
  "tests/thought-completion.test.ts",
  "tests/r1-contracts.test.ts",
  "tests/r2-idempotency.test.ts",
  "tests/r3-recovery.test.ts",
  "tests/r5-media.test.ts",
  "tests/r6-context.test.ts",
  "tests/r7-export.test.ts",
  "tests/profile-dialogue.test.ts",
  "tests/v04-02-commit.test.ts",
  "tests/v04-03-commit.test.ts",
  "tests/v04-04-heal.test.ts",
  "tests/v04-05-concurrency.test.ts",
  "tests/v04-06-confirm.test.ts",
  "tests/v04-06-legacy-reject.test.ts",
  "tests/v04-save-profile.test.ts",
  "tests/v04-display-session.test.ts",
  "tests/v04-commit-session.test.ts",
  "tests/v05-scenario-tab.test.ts",
  "tests/v05-review-fixes.test.ts",
  "tests/v05-correction-source-scope.test.ts",
  "tests/v06-loop.test.ts",
  "tests/v07-craft.test.ts",
  "tests/v07-cycle.test.ts",
  "tests/media-path.test.ts",
  "tests/p10-p12-profile.test.ts",
  "tests/p17-e2e-matrix.test.ts",
  "tests/personal-mvp.test.ts",
  "tests/mvp-release.test.ts",
];

const reelsTests = [
  "tests/reels-workspace.test.ts",
  "tests/reels-takes.test.ts",
  "tests/pipeline-recovery.test.ts",
  "tests/creator-profile.test.ts",
  "tests/reviews-questions.test.ts",
  "tests/scripts.test.ts",
  "tests/text-diff.test.ts",
  "tests/personal-mvp.test.ts",
  "tests/shell-nav.test.ts",
  "tests/shell-layout.test.ts",
  "tests/shell-sheet.test.ts",
  "tests/vocal-ui-kit.test.ts",
  "tests/reel-filters.test.ts",
  "tests/thoughts-list.test.ts",
  "tests/p01-1-archive-contracts.test.ts",
  "tests/p01-2-archive-list-state.test.ts",
  "tests/p01-3-desktop-archive.test.ts",
  "tests/p01-4-mobile-archive.test.ts",
  "tests/p01-5-archive-preview.test.ts",
  "tests/p01-6-0-visual-assets.test.ts",
  "tests/p01-6-1-archive-core.test.ts",
  "tests/p01-6-2-desktop-static.test.ts",
  "tests/thought-preview.test.ts",
  "tests/thought-text-create.test.ts",
  "tests/new-thought-ui.test.ts",
  "tests/thought-media-create.test.ts",
  "tests/thought-media-cleanup.test.ts",
  "tests/reel-studio.test.ts",
  "tests/script-timeline.test.ts",
  "tests/thought-dialogue.test.ts",
  "tests/v01-working-take.test.ts",
  "tests/v02-thought-state.test.ts",
  "tests/v03-agent-actions.test.ts",
  "tests/thought-script-draft.test.ts",
  "tests/script-draft-save.test.ts",
  "tests/recording-view.test.ts",
  "tests/thought-completion.test.ts",
  "tests/r1-contracts.test.ts",
  "tests/r2-idempotency.test.ts",
  "tests/r3-recovery.test.ts",
  "tests/r4-voice.test.ts",
  "tests/r5-media.test.ts",
  "tests/r6-context.test.ts",
  "tests/r7-export.test.ts",
  "tests/r8-a11y.test.ts",
  "tests/r8-privacy.test.ts",
  "tests/profile-dialogue.test.ts",
  "tests/v04-02-commit.test.ts",
  "tests/v04-03-commit.test.ts",
  "tests/v04-04-heal.test.ts",
  "tests/v04-05-concurrency.test.ts",
  "tests/v04-06-confirm.test.ts",
  "tests/v04-06-legacy-reject.test.ts",
  "tests/v04-save-profile.test.ts",
  "tests/v04-display-session.test.ts",
  "tests/v04-commit-session.test.ts",
  "tests/v05-scenario-tab.test.ts",
  "tests/v05-review-fixes.test.ts",
  "tests/v05-correction-source-scope.test.ts",
  "tests/v06-loop.test.ts",
  "tests/v07-craft.test.ts",
  "tests/v07-cycle.test.ts",
  "tests/p10-p12-profile.test.ts",
  "tests/legacy-routes.test.ts",
  "tests/mvp-release.test.ts",
  "tests/p17-e2e-matrix.test.ts",
  "tests/p17-visual.test.ts",
  "tests/auth-isolation.test.ts",
  "tests/supabase-profiles-rls.test.ts",
  "tests/private-storage.test.ts",
  "tests/criteria-write.test.ts",
];

function selectedTests() {
  const extra = process.argv.filter((arg) => arg.endsWith(".test.ts"));
  if (extra.length) return extra;
  if (process.argv.includes("--v01")) return ["tests/v01-working-take.test.ts"];
  if (process.argv.includes("--v02")) return ["tests/v02-thought-state.test.ts"];
  if (process.argv.includes("--v03")) return ["tests/v03-agent-actions.test.ts"];
  if (process.argv.includes("--v05")) {
    return [
      "tests/v05-scenario-tab.test.ts",
      "tests/v05-review-fixes.test.ts",
      "tests/v05-correction-source-scope.test.ts",
      "tests/scripts.test.ts",
      "tests/thought-script-draft.test.ts",
      "tests/thought-text-create.test.ts",
      "tests/thought-media-create.test.ts",
    ];
  }
  if (process.argv.includes("--v06")) {
    return ["tests/v06-loop.test.ts", "tests/thought-completion.test.ts", "tests/v03-agent-actions.test.ts"];
  }
  if (process.argv.includes("--i07")) {
    return [
      ...i07Tests,
      "tests/profile-dialogue.test.ts",
      "tests/v04-05-concurrency.test.ts",
      "tests/r4-voice.test.ts",
      "tests/pipeline-recovery.test.ts",
      "tests/thought-dialogue.test.ts",
    ];
  }
  if (process.argv.includes("--v07")) {
    return ["tests/v07-craft.test.ts", "tests/v07-cycle.test.ts"];
  }
  if (process.argv.includes("--media")) {
    return [
      "tests/media-path.test.ts",
      "tests/pipeline-recovery.test.ts",
      "tests/thought-media-create.test.ts",
      "tests/v06-loop.test.ts",
    ];
  }
  if (process.argv.includes("--auth")) return authTests;
  if (process.argv.includes("--reels")) return reelsTests;
  return dbTests;
}

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    ...opts,
  });
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitForReady() {
  for (let i = 0; i < 40; i += 1) {
    const ready = spawnSync(
      "docker",
      ["exec", container, "pg_isready", "-U", user, "-d", database],
      { shell: true, stdio: "pipe" },
    );
    if ((ready.status ?? 1) === 0) return;
    await delay(500);
  }
  throw new Error(`${container} did not become ready`);
}

function repoRoot() {
  return path.join(__dirname, "..");
}

function schemaHash(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function canonicalSchemaFingerprint(source) {
  const text = String(source).replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "\n");
  const blocks = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const header = current[0].replace(/\s+/g, " ").trim();
    const rest = current
      .slice(1)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .sort();
    blocks.push([header, ...rest].join("\n"));
    current = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^(generator|datasource|model|enum|view)\b/.test(line)) {
      flush();
      current = [line];
      continue;
    }
    if (current.length) current.push(line);
  }
  flush();
  blocks.sort();
  return createHash("sha256").update(blocks.join("\n\n")).digest("hex");
}

function generatedClientMatchesSchema() {
  const schema = path.join(repoRoot(), "prisma", "schema.prisma");
  const generated = path.join(repoRoot(), "node_modules", ".prisma", "client", "schema.prisma");
  if (!fs.existsSync(schema) || !fs.existsSync(generated)) return false;
  if (schemaHash(schema) === schemaHash(generated)) return true;
  return (
    canonicalSchemaFingerprint(fs.readFileSync(schema, "utf8")) ===
    canonicalSchemaFingerprint(fs.readFileSync(generated, "utf8"))
  );
}

function runPrismaGenerate(env) {
  if (env.VOCAL_SKIP_PRISMA_GENERATE === "1") {
    if (!generatedClientMatchesSchema()) {
      throw new Error(
        "VOCAL_SKIP_PRISMA_GENERATE=1, но сгенерированный клиент не совпадает с prisma/schema.prisma",
      );
    }
    const byteMatch =
      schemaHash(path.join(repoRoot(), "prisma", "schema.prisma")) ===
      schemaHash(path.join(repoRoot(), "node_modules", ".prisma", "client", "schema.prisma"));
    console.error(
      `vocal-test-time prisma_generate_skipped=${byteMatch ? "byte_hash" : "canonical_fingerprint"}`,
    );
    return;
  }
  const generate = run("npx", ["prisma", "generate"], { env });
  if ((generate.status ?? 1) !== 0) {
    throw new Error(
      "prisma generate failed. Не пропускайте EPERM автоматически. Если клиент уже актуален, задайте VOCAL_SKIP_PRISMA_GENERATE=1 явно.",
    );
  }
}

function removeOwnContainer() {
  run("docker", ["rm", "-f", container], { stdio: "pipe" });
}

async function main() {
  let status = 1;
  let started = false;
  const hostPort = await allocatePort();
  const testUrl = `postgresql://${user}:${password}@127.0.0.1:${hostPort}/${database}`;
  const dockerAt = Date.now();
  const launched = run("docker", [
    "run",
    "-d",
    "--name",
    container,
    "-e",
    `POSTGRES_USER=${user}`,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    `POSTGRES_DB=${database}`,
    "-p",
    `${hostPort}:5432`,
    image,
  ]);
  if ((launched.status ?? 1) !== 0) {
    throw new Error("Failed to start postgres:16-alpine. Docker Desktop must be running.");
  }
  started = true;
  try {
    await waitForReady();
    console.error(`vocal-test-time docker_ready_ms=${Date.now() - dockerAt}`);
    const executeCountFile = path.join(os.tmpdir(), `vocal-prisma-exec-${process.pid}.txt`);
    fs.writeFileSync(executeCountFile, "0");
    const env = {
      ...process.env,
      NODE_ENV: "test",
      TEST_DATABASE_URL: testUrl,
      DATABASE_URL: testUrl,
      DIRECT_URL: testUrl,
      VOCAL_PRISMA_EXECUTE_COUNT: "0",
      VOCAL_PRISMA_EXECUTE_FILE: executeCountFile,
    };
    const generateAt = Date.now();
    runPrismaGenerate(env);
    console.error(`vocal-test-time prisma_generate_ms=${Date.now() - generateAt}`);
    const migrateAt = Date.now();
    const migrate = run("npx", ["prisma", "migrate", "deploy"], { env });
    if ((migrate.status ?? 1) !== 0) throw new Error("prisma migrate deploy failed on test postgres");
    console.error(`vocal-test-time migrate_deploy_ms=${Date.now() - migrateAt}`);
    const testsAt = Date.now();
    const testRun = run("npx", ["tsx", "--test", "--test-concurrency=1", ...selectedTests()], { env });
    console.error(`vocal-test-time tests_ms=${Date.now() - testsAt}`);
    console.error(`vocal-test-time prisma_db_execute_count=${fs.readFileSync(executeCountFile, "utf8").trim()}`);
    try {
      fs.unlinkSync(executeCountFile);
    } catch {
      /* ignore */
    }
    status = testRun.status ?? 1;
  } finally {
    if (started) removeOwnContainer();
  }
  process.exit(status);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  removeOwnContainer();
  process.exit(1);
});
