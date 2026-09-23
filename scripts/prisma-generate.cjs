#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { loadVocalEnv } = require("./lib/load-env.cjs");

loadVocalEnv();

function resolvePrismaSchema(env) {
  const explicit = (env.VOCAL_PRISMA_SCHEMA || "").trim();
  if (explicit) return explicit;
  const nodeEnv = env.NODE_ENV || "";
  if (nodeEnv === "production" || nodeEnv === "development") {
    return "prisma/schema.postgres.prisma";
  }
  if (nodeEnv === "test" || env.NODE_TEST_CONTEXT) {
    return "prisma/schema.prisma";
  }
  return "prisma/schema.postgres.prisma";
}

const schema = resolvePrismaSchema(process.env);
if (!existsSync(schema)) {
  console.error("Prisma schema missing:", schema);
  process.exit(1);
}
const result = spawnSync("npx", ["prisma", "generate", "--schema", schema], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
