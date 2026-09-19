#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");

function resolvePrismaSchema(env) {
  const explicit = (env.VOCAL_PRISMA_SCHEMA || "").trim();
  if (explicit) return explicit;
  const url = (env.DATABASE_URL || "").trim();
  if (/^postgres(ql)?:/i.test(url)) return "prisma/schema.postgres.prisma";
  return "prisma/schema.prisma";
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
