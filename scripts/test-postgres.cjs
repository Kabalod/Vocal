#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const container = "vocal-test-postgres";
const image = "postgres:16-alpine";
const user = "postgres";
const password = "vocal_test";
const database = "vocal_test";
const hostPort = "55432";
const testUrl = `postgresql://${user}:${password}@127.0.0.1:${hostPort}/${database}`;

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
  "tests/thought-completion.test.ts",
  "tests/r1-contracts.test.ts",
  "tests/r2-idempotency.test.ts",
  "tests/r3-recovery.test.ts",
  "tests/r5-media.test.ts",
  "tests/r6-context.test.ts",
  "tests/r7-export.test.ts",
  "tests/profile-dialogue.test.ts",
  "tests/p10-p12-profile.test.ts",
  "tests/p17-e2e-matrix.test.ts",
  "tests/personal-mvp.test.ts",
  "tests/mvp-release.test.ts",
];

const tests = process.argv.includes("--auth") ? authTests : dbTests;

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    ...opts,
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
  throw new Error("vocal-test-postgres did not become ready");
}

async function main() {
  let status = 1;
  run("docker", ["rm", "-f", container], { stdio: "pipe" });
  const started = run("docker", [
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
  if ((started.status ?? 1) !== 0) {
    throw new Error("Failed to start postgres:16-alpine. Docker Desktop must be running.");
  }
  try {
    await waitForReady();
    const env = {
      ...process.env,
      NODE_ENV: "test",
      TEST_DATABASE_URL: testUrl,
      DATABASE_URL: testUrl,
      DIRECT_URL: testUrl,
    };
    const generate = run("npx", ["prisma", "generate"], { env });
    if ((generate.status ?? 1) !== 0) throw new Error("prisma generate failed");
    const migrate = run("npx", ["prisma", "migrate", "deploy"], { env });
    if ((migrate.status ?? 1) !== 0) throw new Error("prisma migrate deploy failed on test postgres");
    const testRun = run("npx", ["tsx", "--test", "--test-concurrency=1", ...tests], { env });
    status = testRun.status ?? 1;
  } finally {
    run("docker", ["rm", "-f", container], { stdio: "pipe" });
  }
  process.exit(status);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  run("docker", ["rm", "-f", container], { stdio: "pipe" });
  process.exit(1);
});
