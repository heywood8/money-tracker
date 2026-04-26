#!/usr/bin/env bash
# Captures all 26 Penny app screens in light + dark themes using Maestro.
# Prerequisites: emulator running, app installed and open.
# Output: local/screenshots/*.png
# Run: bash scripts/screenshot.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p local/screenshots

maestro test .maestro/local-screenshots.yaml
