#!/bin/bash

# Setup Git Hooks
# This script installs git hooks for the project

HOOKS_DIR=".git/hooks"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up git hooks..."

# Make commit-msg hook executable
if [ -f "$HOOKS_DIR/commit-msg" ]; then
  chmod +x "$HOOKS_DIR/commit-msg"
  echo "✓ commit-msg hook installed and configured"
else
  echo "✗ commit-msg hook not found"
  exit 1
fi

echo ""
echo "Git hooks setup complete!"
echo ""
echo "Hooks installed:"
echo "  • commit-msg: Validates commit messages follow release-please conventions"
echo ""
echo "For more info on commit format, see: .github/copilot-instructions.md"
