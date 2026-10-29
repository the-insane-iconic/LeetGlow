#!/usr/bin/env bash
set -e

# Package only essential extension files for Chrome Web Store distribution
OUTPUT="leetglow.zip"
rm -f "$OUTPUT"

echo "Packaging LeetGlow for Chrome Web Store..."

zip -r -q "$OUTPUT" \
  manifest.json \
  icons/ \
  src/ \
  themes/ \
  fonts/ \
  textures/ \
  sounds/ \
  audio/ \
  -x "*.DS_Store" "*__MACOSX*" "*.git*"

SIZE=$(du -h "$OUTPUT" | awk '{print $1}')
echo "✓ Successfully created $OUTPUT ($SIZE)"
