#!/usr/bin/env bash
# Copy shared team env template; teammates paste OPENROUTER_API_KEY from the team doc.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  echo ".env already exists — not overwriting."
  exit 0
fi
cp "$ROOT/.env.example" "$ROOT/.env"
echo "Created $ROOT/.env from .env.example"
echo "Add OPENROUTER_API_KEY (team shared in hackathon channel — not in git; GitHub blocks pushing keys)."
