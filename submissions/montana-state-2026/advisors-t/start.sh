#!/usr/bin/env bash
# Mac/Linux version of START.bat
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install --disable-pip-version-check -q -r requirements.txt
if [ ! -f .env ]; then cp .env.example .env; echo "Paste your Anthropic API key in .env, save, and run ./start.sh again."; exit 0; fi
grep -q '^ANTHROPIC_API_KEY=sk-' .env || { echo "Add ANTHROPIC_API_KEY to .env first."; exit 1; }
( sleep 4; (command -v open >/dev/null && open http://127.0.0.1:8000) || xdg-open http://127.0.0.1:8000 ) >/dev/null 2>&1 &
python -m uvicorn main:app --host 127.0.0.1 --port 8000
