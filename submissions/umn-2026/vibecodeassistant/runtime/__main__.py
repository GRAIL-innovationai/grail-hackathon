"""CLI: python -m runtime http://localhost:3000 --mode read_only --out runs/run.json"""
import argparse
import os
import sys
from pathlib import Path

from .inspector import MODES, inspect, preflight
from .models import to_json


def main() -> int:
    ap = argparse.ArgumentParser(prog="python -m runtime", description="Crawl a localhost app and report runtime findings.")
    ap.add_argument("url")
    ap.add_argument("--mode", choices=MODES, default="read_only")
    ap.add_argument("--max-pages", type=int, default=50)
    ap.add_argument("--max-depth", type=int, default=4)
    ap.add_argument("--out", help="write the JSON report here (screenshots go next to it)")
    ap.add_argument("--preflight-only", action="store_true")
    ap.add_argument("--storage-state", help="Playwright storageState JSON for an already-logged-in test session")
    ap.add_argument("--yes", action="store_true", help="skip the confirmation for modes that submit forms")
    args = ap.parse_args()

    try:
        pf = preflight(args.url)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if args.preflight_only:
        print(to_json(pf))
        return 0
    if not pf["reachable"]:
        print(f"error: {pf['target']} not reachable ({pf['error'] or pf['status']})", file=sys.stderr)
        return 2

    # Test credentials come from env so they never land in shell history.
    creds = None
    if os.environ.get("VIBEAUDIT_USERNAME"):
        creds = {"username": os.environ["VIBEAUDIT_USERNAME"], "password": os.environ.get("VIBEAUDIT_PASSWORD", ""),
                 "login_url": os.environ.get("VIBEAUDIT_LOGIN_URL")}

    if args.mode == "authenticated" and not (creds or args.storage_state):
        print("error: authenticated mode needs VIBEAUDIT_USERNAME/VIBEAUDIT_PASSWORD or --storage-state", file=sys.stderr)
        return 2

    if args.mode != "read_only" and not args.yes:
        hosts = ", ".join(f"{h['host']} ({h['kind']})" for h in pf["backend_hosts"]) or "none seen on landing page"
        print(f"mode {args.mode} submits forms with fake data. External backends: {hosts}", file=sys.stderr)
        if input("Writes may reach those backends. Type 'yes' to continue: ").strip() != "yes":
            return 1

    out_dir = str(Path(args.out).parent) if args.out else None
    report = inspect(args.url, mode=args.mode, credentials=creds, storage_state=args.storage_state,
                     max_pages=args.max_pages, max_depth=args.max_depth, out_dir=out_dir)
    text = to_json(report)
    if args.out:
        Path(args.out).write_text(text)
        counts = {}
        for f in report["findings"]:
            counts[f.severity] = counts.get(f.severity, 0) + 1
        print(f"{report['run']['pages_visited']} pages, {len(report['findings'])} findings {counts}, "
              f"{len(report['gaps'])} gaps -> {args.out}", file=sys.stderr)
    else:
        print(text)
    return 0


sys.exit(main())
