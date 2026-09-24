#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const tests = [
  "tests/session-owner.test.ts",
  "tests/db-target.test.ts",
  "tests/auth-isolation.test.ts",
  "tests/private-storage.test.ts",
  "tests/supabase-profiles-rls.test.ts",
  "tests/criteria-write.test.ts",
];

const generate = spawnSync("npx", ["prisma", "generate"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
if ((generate.status ?? 1) !== 0) {
  process.exit(generate.status ?? 1);
}

const run = spawnSync("npx", ["tsx", "--test", ...tests], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: "test",
  },
});
process.exit(run.status ?? 1);
