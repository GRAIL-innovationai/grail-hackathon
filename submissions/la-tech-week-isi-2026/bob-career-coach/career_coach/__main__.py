"""JSON CLI usable from a Node UI/backend without adding an HTTP service."""

import argparse
import json
from pathlib import Path
import sys

from .errors import CareerCoachError
from .resume import parse_resume
from .service import handle_request


MAX_REQUEST_BYTES = 20 * 1024 * 1024


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Agent C career-coach JSON adapter")
    commands = parser.add_subparsers(dest="command", required=True)
    request_parser = commands.add_parser("request", help="Read one JSON request from stdin or a file")
    request_parser.add_argument("--input", type=Path)
    parse_parser = commands.add_parser("parse", help="Extract a PDF or UTF-8 text resume")
    parse_parser.add_argument("resume", type=Path)
    commands.add_parser("demo", help="Run the explicitly temporary Agent C fixture")
    args = parser.parse_args(argv)
    try:
        if args.command == "parse":
            response = {"ok": True, "result": parse_resume(args.resume)}
        else:
            if args.command == "demo":
                fixture_dir = Path(__file__).resolve().parent.parent / "examples" / "agent_c"
                request = json.loads((fixture_dir / "demo_request.json").read_text(encoding="utf-8-sig"))
                request["resume_text"] = (fixture_dir / "sample_resume.txt").read_text(encoding="utf-8-sig")
            else:
                if args.input:
                    if args.input.stat().st_size > MAX_REQUEST_BYTES:
                        raise CareerCoachError("request_too_large", "JSON requests must be no larger than 20 MiB.")
                    data = args.input.read_bytes()
                else:
                    data = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
                if len(data) > MAX_REQUEST_BYTES:
                    raise CareerCoachError("request_too_large", "JSON requests must be no larger than 20 MiB.")
                request = json.loads(data.decode("utf-8-sig"))
            response = handle_request(request)
            if args.command == "demo":
                response["fixture_notice"] = request["fixture_notice"]
    except CareerCoachError as exc:
        response = {"ok": False, "error": exc.as_dict()}
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        response = {"ok": False, "error": {"code": "invalid_input", "message": str(exc)}}
    # Bytes avoid Windows console codepage failures for international resume names.
    sys.stdout.buffer.write((json.dumps(response, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return 0 if response["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
