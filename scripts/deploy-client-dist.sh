#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/packages/client/dist"
DEST_DIR="/var/www/zoner3d.net/public_html/files/space-combat"
DO_BUILD=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Deploy Space Combat client dist files to web root.

Usage:
  scripts/deploy-client-dist.sh [--build] [--dry-run] [--dest <path>]

Options:
  --build       Build client before copying.
  --dry-run     Show what would change without writing files.
  --dest <path> Override destination directory.
  -h, --help    Show this help.
EOF
}

while (($# > 0)); do
  case "$1" in
    --build)
      DO_BUILD=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --dest)
      if (($# < 2)); then
        echo "error: --dest requires a value" >&2
        exit 1
      fi
      DEST_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ((DO_BUILD == 1)); then
  echo "▶ Building client..."
  (cd "${ROOT_DIR}" && pnpm --filter @space-combat/client build)
fi

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "error: dist directory not found at ${DIST_DIR}" >&2
  echo "run with --build or build manually first." >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

RSYNC_ARGS=(
  -av
  --delete
  "${DIST_DIR}/"
  "${DEST_DIR}/"
)

if ((DRY_RUN == 1)); then
  RSYNC_ARGS=(
    -av
    --delete
    --dry-run
    "${DIST_DIR}/"
    "${DEST_DIR}/"
  )
fi

echo "▶ Syncing ${DIST_DIR} -> ${DEST_DIR}"
rsync "${RSYNC_ARGS[@]}"

echo "✅ Deploy complete."
