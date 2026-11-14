#!/usr/bin/env bash
# Restore TPM SQLite from a backup created by scripts/backup-sqlite.sh
# Stops nothing for you — stop the tpm process/container first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${TPM_SQLITE_PATH:-$ROOT/data/tpm/tpm.db}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <backup.db>" >&2
  exit 1
fi

SRC="$1"
if [[ ! -f "$SRC" ]]; then
  echo "backup not found: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DB")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -f "$DB" ]]; then
  cp -a "$DB" "${DB}.pre-restore-${STAMP}"
  rm -f "${DB}-wal" "${DB}-shm"
fi

cp -a "$SRC" "$DB"
chmod 600 "$DB" 2>/dev/null || true
echo "restored $SRC → $DB"
echo "start tpm again (make run / docker compose up -d tpm)"
