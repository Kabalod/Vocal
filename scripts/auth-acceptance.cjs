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

function generate(schema) {
  const result = spawnSync("npx", ["prisma", "generate", "--schema", schema], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, VOCAL_PRISMA_SCHEMA: schema },
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`prisma generate failed for ${schema}`);
  }
}

let testStatus = 1;
try {
  generate("prisma/schema.prisma");
  const run = spawnSync("npx", ["tsx", "--test", ...tests], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "test",
      VOCAL_PRISMA_SCHEMA: "prisma/schema.prisma",
    },
  });
  testStatus = run.status ?? 1;
} finally {
  try {
    generate("prisma/schema.postgres.prisma");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    testStatus = 1;
  }
}

process.exit(testStatus);
