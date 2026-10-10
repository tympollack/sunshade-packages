#!/usr/bin/env bash
set -e

BUCKET="r2:sunshade-game-assets/assets/kenney"
SRC_DIR="${1:-./staging/kenney-packs}"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: Directory $SRC_DIR does not exist."
  exit 1
fi

echo "Uploading Kenney asset bundles to Cloudflare R2..."
rclone copy "$SRC_DIR" "$BUCKET" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Access-Control-Allow-Origin: *" \
  --progress

echo "Sync complete. Endpoint live at https://cdn.sunshade.icu/assets/kenney/"
