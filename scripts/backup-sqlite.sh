#!/usr/bin/env bash
# Online-safe SQLite backup of the TPM database (uses the SQLite backup API).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${TPM_SQLITE_PATH:-$ROOT/data/tpm/tpm.db}"
OUT_DIR="${TPM_BACKUP_DIR:-$ROOT/data/tpm/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/tpm-${STAMP}.db"

if [[ ! -f "$DB" ]]; then
  echo "database not found: $DB" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$OUT'"
else
  # Fallback when sqlite3 CLI is missing: copy main + WAL/SHM if present.
  # Prefer installing sqlite3 for a consistent snapshot under load.
  echo "warning: sqlite3 not found; using file copy (stop writes for safest restore)" >&2
  cp -a "$DB" "$OUT"
  [[ -f "${DB}-wal" ]] && cp -a "${DB}-wal" "${OUT}-wal"
  [[ -f "${DB}-shm" ]] && cp -a "${DB}-shm" "${OUT}-shm"
fi

chmod 600 "$OUT" 2>/dev/null || true
echo "$OUT"
