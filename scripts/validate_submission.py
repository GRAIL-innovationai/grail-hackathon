#!/usr/bin/env python3
"""Check a GRAIL hackathon submission.

Usage:
  python3 scripts/validate_submission.py submissions/<event>/<team-slug>
  python3 scripts/validate_submission.py --changed-files PATHS [--organizer]

Folder mode checks one team folder. Changed-files mode (used by CI) reads the
paths a pull request changes, one per line, checks that they all sit inside a
single team folder, then checks that folder. --organizer allows changes outside
team folders but still checks every team folder touched.

Exit code: 0 valid, 1 invalid, 2 usage error.
"""

import argparse
import fnmatch
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
HEADING_RE = re.compile(r"^##\s+(.*?)[\s:#]*$")
REQUIRED_HEADINGS = ["Team", "Summary", "Demo", "How to run"]
MB = 1024 * 1024
MAX_FILE_BYTES = 10 * MB
MAX_TOTAL_BYTES = 50 * MB
FORBIDDEN_DIRS = {"node_modules", ".venv", "venv", "__pycache__", ".git"}
KEY_PATTERNS = ["*.pem", "*.key", "id_rsa*"]
MAX_LISTED_PATHS = 10


def validate_folder(folder, root=REPO_ROOT):
    """Return a list of problems with one team folder (empty if valid)."""
    submissions = (Path(root) / "submissions").resolve()
    folder = Path(folder)
    if not folder.is_dir():
        return [f"{folder} is not a folder. Pass your team folder, e.g. submissions/umn-2026/team-rocket"]
    folder = folder.resolve()
    try:
        parts = folder.relative_to(submissions).parts
    except ValueError:
        parts = ()
    if len(parts) != 2:
        return [f"{folder} must be a team folder directly inside an event: submissions/<event>/<team-slug>"]
    event, team = parts
    display = f"submissions/{event}/{team}"

    errors = []
    events = sorted(
        p.name for p in submissions.iterdir()
        if p.is_dir() and SLUG_RE.match(p.name) and (p / "README.md").is_file()
    )
    if event not in events:
        errors.append(f"Unknown event '{event}'. Use one of: {', '.join(events) or '(none yet)'}")
    if not SLUG_RE.match(team):
        errors.append(
            f"Team folder name '{team}' must use lowercase letters, digits and single hyphens, e.g. team-rocket"
        )
    errors += _check_readme(folder, display)
    errors += _check_files(folder, display)
    return errors


def _check_readme(folder, display):
    entries = os.listdir(folder)
    if "README.md" not in entries:
        for entry in entries:
            if entry.lower() == "readme.md":
                return [
                    f"Rename {display}/{entry} to README.md (git mv \"{entry}\" README.md): "
                    "the name must be exactly README.md."
                ]
        return [f"Missing {display}/README.md. Copy submissions/_template/README.md into your folder and fill it in."]
    text = (folder / "README.md").read_text(encoding="utf-8-sig", errors="replace")
    found = {m.group(1).lower() for m in map(HEADING_RE.match, text.splitlines()) if m}
    return [
        f"{display}/README.md is missing the '## {heading}' section."
        for heading in REQUIRED_HEADINGS
        if heading.lower() not in found
    ]


def _check_files(folder, display):
    errors = []
    total = 0
    for dirpath, dirnames, filenames in os.walk(folder):
        here = Path(dirpath)
        seen = {}
        for name in sorted(dirnames + filenames):
            key = name.lower()
            if key in seen:
                rel = f"{display}/{(here / seen[key]).relative_to(folder).as_posix()}"
                errors.append(
                    f"{rel} and {name} differ only in letter case, which breaks checkouts "
                    "on macOS and Windows. Rename or remove one."
                )
            else:
                seen[key] = name
        for name in sorted(dirnames):
            if name in FORBIDDEN_DIRS:
                rel = f"{display}/{(here / name).relative_to(folder).as_posix()}"
                errors.append(
                    f"Remove {rel}/: dependencies, virtualenvs, caches and nested git repos don't belong in a submission."
                )
        dirnames[:] = sorted(d for d in dirnames if d not in FORBIDDEN_DIRS)
        for name in sorted(filenames):
            path = here / name
            rel = f"{display}/{path.relative_to(folder).as_posix()}"
            problem = _forbidden_file_problem(rel, name)
            if problem:
                errors.append(problem)
            size = path.lstat().st_size
            total += size
            if size > MAX_FILE_BYTES:
                errors.append(
                    f"{rel} is {size / MB:.1f} MB (limit 10 MB). Host it elsewhere "
                    "(Google Drive, Hugging Face, a GitHub release) and link it from README.md."
                )
    if total > MAX_TOTAL_BYTES:
        errors.append(
            f"{display} is {total / MB:.1f} MB in total (limit 50 MB). "
            "Remove large files and link them from README.md instead."
        )
    return errors


def _forbidden_file_problem(rel, name):
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return f"Remove {rel}: it may contain secrets. Commit a .env.example with placeholder values instead."
    if any(fnmatch.fnmatch(name, pattern) for pattern in KEY_PATTERNS):
        return f"Remove {rel}: private keys must never be committed. If it is a real key, rotate it."
    if name == ".DS_Store":
        return f"Remove {rel} (macOS metadata)."
    if name == ".git":
        return f"Remove {rel}: it makes this folder a git submodule, so its files won't be committed."
    return None


def validate_changed(paths, root=REPO_ROOT, organizer=False):
    """Return a list of problems with a pull request's changed paths (empty if valid)."""
    teams = []
    outside = []
    for path in paths:
        parts = path.split("/")
        if len(parts) >= 4 and parts[0] == "submissions" and not parts[1].startswith("_"):
            if (parts[1], parts[2]) not in teams:
                teams.append((parts[1], parts[2]))
        else:
            outside.append(path)

    errors = []
    if not organizer:
        if not paths:
            errors.append("This pull request changes no files.")
        for path in outside[:MAX_LISTED_PATHS]:
            errors.append(
                f"{path} is outside a team folder. Submissions may only change files inside "
                "submissions/<event>/<team-slug>/."
            )
        if len(outside) > MAX_LISTED_PATHS:
            errors.append(f"...and {len(outside) - MAX_LISTED_PATHS} more files outside a team folder.")
        if len(teams) > 1:
            listed = ", ".join(f"submissions/{event}/{team}" for event, team in teams)
            errors.append(f"This pull request changes several team folders ({listed}). Submit one team per pull request.")
    for event, team in teams:
        folder = Path(root) / "submissions" / event / team
        if folder.is_dir():
            errors += validate_folder(folder, root)
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check a GRAIL hackathon submission.")
    parser.add_argument("folder", nargs="?", help="team folder, e.g. submissions/umn-2026/team-rocket")
    parser.add_argument("--changed-files", metavar="FILE", help="file listing changed paths, one per line (CI)")
    parser.add_argument("--organizer", action="store_true", help="allow changes outside team folders (CI)")
    parser.add_argument("--root", default=str(REPO_ROOT), help="repo root (default: the repo this script is in)")
    args = parser.parse_args(argv)
    if (args.folder is None) == (args.changed_files is None):
        parser.error("pass either a team folder or --changed-files")
    if args.organizer and args.changed_files is None:
        parser.error("--organizer only works with --changed-files")

    if args.changed_files:
        lines = Path(args.changed_files).read_text(encoding="utf-8").splitlines()
        errors = validate_changed([line for line in lines if line.strip()], args.root, args.organizer)
    else:
        errors = validate_folder(args.folder, args.root)

    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        print(f"\n{len(errors)} problem(s) found. Fix them and run this check again.")
        return 1
    print("OK: submission looks good.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
