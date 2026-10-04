#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Cloudflare R2 Kenney Assets Sync & Edge Cache Validation Script
# Target CDN: https://cdn.sunshade.icu/assets/kenney/
# Target Bucket: sunshade-game-assets
# ─────────────────────────────────────────────────────────────────────────────

R2_BUCKET="${R2_BUCKET:-sunshade-game-assets}"
CDN_DOMAIN="${CDN_DOMAIN:-https://cdn.sunshade.icu}"
CDN_PREFIX="assets/kenney"
CACHE_CONTROL="public, max-age=31536000, immutable"
CORS_ORIGIN="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SOURCE_DIR="${SOURCE_DIR:-${REPO_ROOT}/../downloaded_assets/kenney.nl}"

DRY_RUN=false
VERIFY_ONLY=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verify-only)
      VERIFY_ONLY=true
      shift
      ;;
  esac
done

echo "================================================================================"
echo "⚡ Cloudflare R2 Sync: ${R2_BUCKET} -> ${CDN_DOMAIN}/${CDN_PREFIX}/"
echo "📂 Source Directory: ${SOURCE_DIR}"
echo "🔒 Headers: Cache-Control: ${CACHE_CONTROL} | Access-Control-Allow-Origin: ${CORS_ORIGIN}"
echo "================================================================================"

if [ "$VERIFY_ONLY" = true ]; then
  echo "🔍 Running verification check on CDN endpoints..."
  node "${SCRIPT_DIR}/sync-kenney-r2.mjs" --verify-only
  exit 0
fi

# Delegate sync orchestration and taxonomy validation to companion script
if command -v node >/dev/null 2>&1; then
  DRY_FLAG=""
  if [ "$DRY_RUN" = true ]; then
    DRY_FLAG="--dry-run"
  fi
  node "${SCRIPT_DIR}/sync-kenney-r2.mjs" $DRY_FLAG
else
  echo "❌ Node.js runtime required to run sync-kenney-r2.mjs"
  exit 1
fi

echo "✅ Cloudflare R2 synchronization and validation routine completed."
