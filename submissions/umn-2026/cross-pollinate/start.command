#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  PYTHON_BIN="$(command -v python3)"
  BUNDLED_PYTHON="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
  if [[ -x "$BUNDLED_PYTHON" ]]; then PYTHON_BIN="$BUNDLED_PYTHON"; fi
  "$PYTHON_BIN" -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi
open http://127.0.0.1:7860
exec .venv/bin/python app.py
