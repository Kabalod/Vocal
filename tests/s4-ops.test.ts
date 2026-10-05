import assert from "node:assert/strict";
import { accessSync, constants, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("S4 container: single instance, media volume, signals reach the app, healthcheck", () => {
  const docker = read("Dockerfile");
  assert.match(docker, /NEXT_MANUAL_SIG_HANDLE=true/, "Next must not exit on SIGTERM before jobs finish");
  assert.match(docker, /VOCAL_STORAGE_ROOT=\/data/);
  assert.match(docker, /VOLUME \["\/data"\]/);
  assert.match(docker, /HEALTHCHECK[\s\S]*\/api\/health/);
  assert.match(docker, /CMD \["node_modules\/\.bin\/next", "start"\]/, "no npm wrapper: it swallows SIGTERM");
  assert.match(docker, /^USER node$/m);
  const compose = read("docker-compose.yml");
  assert.match(compose, /stop_grace_period:\s*60s/);
  assert.match(compose, /vocal-media:\/data/);
  assert.equal(/replicas:\s*[2-9]/.test(compose), false);
  const ignore = read(".dockerignore");
  for (const entry of [".env", "storage", "node_modules"]) assert.ok(ignore.split("\n").includes(entry), entry);
  const stop = read("src/instrumentation-node.ts");
  assert.match(stop, /shutdownPipeline/);
  assert.match(stop, /SIGTERM/);
  assert.match(stop, /recoverUnfinishedJobs/);
});

test("S4 CI runs typecheck, lint, build and the postgres suite without a live model", () => {
  const ci = read(".github/workflows/ci.yml");
  for (const step of ["npm run typecheck", "npm run lint", "npm run build", "npm run test:postgres"]) {
    assert.ok(ci.includes(step), step);
  }
  assert.equal(/GROQ_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(ci), false, "no secrets in CI");
});

test("S4 ops scripts exist, are executable and guard against overwriting data", () => {
  for (const name of ["backup", "restore", "verify-restore"]) {
    const file = path.join(root, `scripts/ops/${name}.sh`);
    accessSync(file, constants.X_OK);
    assert.match(readFileSync(file, "utf8"), /set -euo pipefail/);
  }
  const restore = read("scripts/ops/restore.sh");
  assert.match(restore, /refusing: target database already has/);
  assert.match(restore, /refusing: .* is not empty/);
  assert.match(restore, /sha256sum --check/);
  assert.match(read("scripts/ops/backup.sh"), /tar[\s\S]*pg_dump|PGDUMP/);
  assert.equal(read("package.json").includes("scripts/backup.ts"), false);
});

test("S4 docs: runbook covers the required topics and the stale README sections are gone", () => {
  const ops = read("docs/OPERATIONS.md");
  for (const topic of ["Сборка и запуск", "Остановка и перезапуск", "Обновление и откат", "Бэкап и восстановление", "SMTP", "NEXT_MANUAL_SIG_HANDLE", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.ok(ops.includes(topic), topic);
  }
  const readme = read("README.md");
  for (const stale of ["prisma/dev.db", "db:migrate:existing", "scripts/backup.ts", "db:backfill-reels"]) {
    assert.equal(readme.includes(stale), false, stale);
  }
  for (const template of ["confirm-signup", "reset-password"]) {
    const html = read(`docs/ops/email/${template}.html`);
    assert.match(html, /\{\{ \.ConfirmationURL \}\}/);
    assert.match(html, /[А-Яа-я]{5}/);
  }
  assert.equal(read("AGENTS.md").includes("migrations 8–9"), false);
});

test("S4 health reports the media volume", () => {
  const health = read("src/app/api/health/route.ts");
  assert.match(health, /storage/);
  assert.match(health, /R_OK \| constants\.W_OK/);
});
