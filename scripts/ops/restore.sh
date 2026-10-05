#!/usr/bin/env bash
# Restore a backup made by backup.sh into an EMPTY database and an EMPTY storage root.
# Usage: scripts/ops/restore.sh <backup-dir> <target-database-url> <target-storage-root>
# It refuses to touch a database that already has tables in public or a non-empty storage/ directory.
# Env:   PGBIN (optional directory with psql and pg_restore)
set -euo pipefail

BACKUP="${1:?backup dir}"
TARGET_URL="${2:?target database url}"
TARGET_ROOT="${3:?target storage root}"
PSQL="${PGBIN:+$PGBIN/}psql"
PGRESTORE="${PGBIN:+$PGBIN/}pg_restore"

(cd "$BACKUP" && sha256sum --check --quiet SHA256SUMS)

existing="$("$PSQL" "$TARGET_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
if [ "$existing" != "0" ]; then
  echo "refusing: target database already has $existing tables in public" >&2
  exit 2
fi
if [ -d "$TARGET_ROOT/storage" ] && [ -n "$(ls -A "$TARGET_ROOT/storage" 2>/dev/null)" ]; then
  echo "refusing: $TARGET_ROOT/storage is not empty" >&2
  exit 2
fi

mkdir -p "$TARGET_ROOT"
tar -C "$TARGET_ROOT" -xzf "$BACKUP/storage.tar.gz"
# The empty target already has the public schema; restore everything except its CREATE.
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
"$PGRESTORE" -l "$BACKUP/db.dump" | grep -v ' SCHEMA - public ' > "$LIST"
"$PGRESTORE" --no-owner --no-privileges --exit-on-error --use-list="$LIST" --dbname="$TARGET_URL" "$BACKUP/db.dump"
echo "restored into $TARGET_ROOT and the target database"
