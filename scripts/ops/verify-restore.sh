#!/usr/bin/env bash
# Checks a restored copy: table row counts against the backup (when given) and that every
# referenced media file exists on disk. Exits non-zero on ANY problem, including query errors.
# Usage: scripts/ops/verify-restore.sh <target-database-url> <target-storage-root> [backup-dir]
# Env:   PGBIN (optional directory with psql)
set -euo pipefail

TARGET_URL="${1:?target database url}"
TARGET_ROOT="${2:?target storage root}"
BACKUP="${3:-}"
PSQL="${PGBIN:+$PGBIN/}psql"

q() { "$PSQL" "$TARGET_URL" -v ON_ERROR_STOP=1 -Atc "$1"; }

counts=""
for t in Reel Take Job TranscriptRevision AiCall DialogueMessage ScriptVersion CreatorProfile; do
  counts+="$t=$(q "select count(*) from \"$t\"")"$'\n'
done
printf '%s' "$counts"

if [ -n "$BACKUP" ]; then
  if ! diff <(printf '%s' "$counts") "$BACKUP/counts.txt" > /dev/null; then
    echo "verify failed: row counts differ from $BACKUP/counts.txt" >&2
    diff <(printf '%s' "$counts") "$BACKUP/counts.txt" >&2 || true
    exit 1
  fi
  echo "row counts match the backup"
fi

files="$(q 'select "storedPath" from "Take" where "storedPath" is not null union select "videoPath" from "Job" where "videoPath" <> '"'"'pending'"'"'')"
missing=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    vocal-private:*) continue ;;
  esac
  # Paths were stored as absolute paths of the old server; compare by the part under storage/.
  rel="storage/${file##*/storage/}"
  if [ ! -f "$TARGET_ROOT/$rel" ]; then
    echo "MISSING $rel" >&2
    missing=$((missing + 1))
  fi
done <<< "$files"

if [ "$missing" -ne 0 ]; then
  echo "verify failed: $missing referenced files are missing" >&2
  exit 1
fi
echo "verify ok"
