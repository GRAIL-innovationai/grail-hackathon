#!/usr/bin/env python3
"""Local demo: serves the React page in ui/dist and lets its buttons start oracle.py runs.

  python3 serve.py   ->   http://localhost:8000/ui/dist/
"""
import os, subprocess, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
RUNS = {"improve": ["improve", "2"], "online": ["online"]}
proc = None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def do_GET(self):
        if any(part.startswith(".") for part in self.path.split("?")[0].split("/")):
            return self.send_error(404)  # never serve .env or .git
        super().do_GET()

    def do_POST(self):
        global proc
        cmd = RUNS.get(self.path.rsplit("/", 1)[-1])
        if not cmd:
            return self.send_error(404)
        if proc and proc.poll() is None:
            return self.send_error(409, "A run is already in progress")
        proc = subprocess.Popen([sys.executable, str(ROOT / "oracle.py"), *cmd], cwd=ROOT,
                                env={**os.environ, "PO_LIVE": "1"})  # live runs write to runs/live/
        self.send_response(202)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


print("Patch Oracle demo on http://localhost:8000/ui/dist/")
ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
