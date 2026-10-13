#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 1 ] || { echo 'Usage: bash scripts/install_drclaw_skills.sh /path/to/dr-claw'; exit 2; }
DR="$(cd "$1" && pwd)"; [ -d "$DR/skills" ] || { echo 'Dr. Claw skills/ missing'; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for dir in "$ROOT"/skills/*; do
  [ -d "$dir" ] || continue
  dest="$DR/skills/career-$(basename "$dir")"
  mkdir -p "$dest"
  cp -R "$dir"/. "$dest"/
  echo "$dest"
done
echo 'Restart Dr. Claw and verify skill linking/discovery with the chosen agent runtime.'
