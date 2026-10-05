#!/usr/bin/env bash
# Vocal backup: media tarball + logical Postgres dump (public schema) + checksums.
# Usage: scripts/ops/backup.sh [dest-root]    (default ./backups)
# Env:   DIRECT_URL (required, direct connection, not the pooler)
#        VOCAL_STORAGE_ROOT (default: current directory; media is under <root>/storage)
#        PGBIN (optional directory with pg_dump)
# Order matters: media first, then the database. Every row in the dump then has its file in the
# tarball; a file uploaded in between is only an unreferenced extra (the orphan sweeper removes it).
set -euo pipefail

: "${DIRECT_URL:?DIRECT_URL is required}"
PGDUMP="${PGBIN:+$PGBIN/}pg_dump"
ROOT="${VOCAL_STORAGE_ROOT:-$PWD}"
DEST_ROOT="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST_ROOT/$STAMP"

mkdir -p "$OUT"
if [ -d "$ROOT/storage" ]; then
  tar -C "$ROOT" -czf "$OUT/storage.tar.gz" storage
else
  tar -czf "$OUT/storage.tar.gz" --files-from /dev/null
fi
"$PGDUMP" --format=custom --schema=public --no-owner --no-privileges --file="$OUT/db.dump" "$DIRECT_URL"

PSQL="${PGBIN:+$PGBIN/}psql"
for t in Reel Take Job TranscriptRevision AiCall DialogueMessage ScriptVersion CreatorProfile; do
  printf '%s=%s\n' "$t" "$("$PSQL" "$DIRECT_URL" -Atc "select count(*) from \"$t\"")"
done > "$OUT/counts.txt"

(cd "$OUT" && sha256sum storage.tar.gz db.dump counts.txt > SHA256SUMS)
printf '{"createdAt":"%s","media":"storage.tar.gz","database":"db.dump","schema":"public"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/manifest.json"
echo "backup written to $OUT"
