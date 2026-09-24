#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { loadVocalEnv } = require("./lib/load-env.cjs");

loadVocalEnv();

if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
  console.error("db:migrate не запускается в тестовом контуре.");
  process.exit(1);
}

const root = resolve(__dirname, "..");
const check = spawnSync(
  "npx",
  ["tsx", "-e", "import { resolveAppDatabaseUrl, resolveDirectDatabaseUrl } from './src/lib/db-target.ts'; resolveAppDatabaseUrl(); resolveDirectDatabaseUrl();"],
  { cwd: root, stdio: "inherit", shell: true, env: process.env },
);
if ((check.status ?? 1) !== 0) {
  process.exit(check.status ?? 1);
}

const deploy = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(deploy.status ?? 1);
