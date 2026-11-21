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

# Resolve default source directory: prioritize repo-level downloaded_assets, then ./staging/kenney-packs
DEFAULT_SRC="${REPO_ROOT}/../downloaded_assets/kenney.nl"
if [ ! -d "$DEFAULT_SRC" ] && [ -d "${REPO_ROOT}/staging/kenney-packs" ]; then
  DEFAULT_SRC="${REPO_ROOT}/staging/kenney-packs"
fi

SOURCE_DIR="${SOURCE_DIR:-$DEFAULT_SRC}"
DRY_RUN=false
VERIFY_ONLY=false
USE_RCLONE=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      ;;
    --verify-only)
      VERIFY_ONLY=true
      ;;
    --rclone)
      USE_RCLONE=true
      ;;
    *)
      if [[ "$arg" != -* ]]; then
        SOURCE_DIR="$arg"
      fi
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
  if command -v node >/dev/null 2>&1; then
    node "${SCRIPT_DIR}/sync-kenney-r2.mjs" --verify-only
    exit 0
  else
    echo "❌ Node.js runtime required to run verify-only mode."
    exit 1
  fi
fi

if [ "$USE_RCLONE" = true ] || ! command -v node >/dev/null 2>&1; then
  if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Directory $SOURCE_DIR does not exist."
    exit 1
  fi

  echo "Uploading Kenney asset bundles to Cloudflare R2..."
  RCLONE_FLAGS=()
  if [ "$DRY_RUN" = true ]; then
    RCLONE_FLAGS+=(--dry-run)
    echo "ℹ️ Running in --dry-run mode (no files will be transferred)."
  fi

  # Upload each pack directory, stripping any leading 'kenney_' prefix to match CDN resolver taxonomy
  find "$SOURCE_DIR" -mindepth 1 -maxdepth 1 -type d | while read -r pack_dir; do
    pack_name="$(basename "$pack_dir")"
    clean_slug="${pack_name#kenney_}"
    dest="r2:${R2_BUCKET}/${CDN_PREFIX}/${clean_slug}"
    echo "Syncing pack '${pack_name}' -> '${dest}'"
    rclone copy "$pack_dir" "$dest" \
      --header-upload "Cache-Control: ${CACHE_CONTROL}" \
      --header-upload "Access-Control-Allow-Origin: ${CORS_ORIGIN}" \
      --progress "${RCLONE_FLAGS[@]}"
  done

  echo "Sync complete. Endpoint live at ${CDN_DOMAIN}/${CDN_PREFIX}/"
else
  # Delegate to companion script for taxonomy validation and edge caching
  DRY_FLAG=""
  if [ "$DRY_RUN" = true ]; then
    DRY_FLAG="--dry-run"
  fi
  SOURCE_DIR="$SOURCE_DIR" node "${SCRIPT_DIR}/sync-kenney-r2.mjs" $DRY_FLAG
fi

echo "✅ Cloudflare R2 synchronization and validation routine completed."
