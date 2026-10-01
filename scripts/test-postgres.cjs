#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
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

const dbTests = [
  ...authTests,
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
  "tests/p10-p12-profile.test.ts",
  "tests/p17-e2e-matrix.test.ts",
  "tests/personal-mvp.test.ts",
  "tests/mvp-release.test.ts",
];

const reelsTests = [
  "tests/reels-workspace.test.ts",
  "tests/reels-editor-session.test.ts",
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
    const generate = run("npx", ["prisma", "generate"], { env });
    if ((generate.status ?? 1) !== 0) throw new Error("prisma generate failed");
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
