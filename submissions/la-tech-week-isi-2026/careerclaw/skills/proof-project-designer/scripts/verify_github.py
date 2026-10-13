#!/usr/bin/env python3
"""
Factual snapshot of a public GitHub repo for rubric verification.
Reports facts only; the agent judges them against the rubric.

Usage:
    python verify_github.py owner/repo [--keywords airflow,dag,postgres] [--token TOKEN]

Set GITHUB_TOKEN env var (or --token) to avoid the 60 req/hour anonymous limit.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter

API = "https://api.github.com"


def get(path, token):
    req = urllib.request.Request(API + path, headers={"Accept": "application/vnd.github+json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 403 and e.headers.get("x-ratelimit-remaining") == "0":
            return {"_error": "GitHub rate limit hit; set GITHUB_TOKEN or pass --token"}
        return {"_error": f"HTTP {e.code} on {path}"}


def get_raw(owner, repo, branch, path):
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.read().decode(errors="replace")
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("repo", help="owner/repo or full GitHub URL")
    ap.add_argument("--keywords", default="", help="comma-separated rubric keywords")
    ap.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"))
    a = ap.parse_args()

    m = re.search(r"([\w.-]+)/([\w.-]+?)(?:\.git)?/?$", a.repo.replace("https://github.com/", ""))
    if not m:
        sys.exit("Could not parse owner/repo")
    owner, repo = m.groups()

    meta = get(f"/repos/{owner}/{repo}", a.token)
    if "_error" in meta:
        print(json.dumps({"error": meta["_error"], "note": "If not a rate limit, the repo may be private or missing."}, indent=2))
        return
    branch = meta.get("default_branch", "main")

    commits = get(f"/repos/{owner}/{repo}/commits?per_page=100", a.token)
    commits = commits if isinstance(commits, list) else []
    dates = sorted(c["commit"]["author"]["date"] for c in commits if c.get("commit"))
    days = Counter(d[:10] for d in dates)
    authors = Counter(c["commit"]["author"]["name"] for c in commits if c.get("commit"))

    tree = get(f"/repos/{owner}/{repo}/git/trees/{branch}?recursive=1", a.token)
    files = [t["path"] for t in tree.get("tree", []) if t.get("type") == "blob"] if isinstance(tree, dict) else []

    readme = get_raw(owner, repo, branch, "README.md") or ""

    kw_hits = {}
    for kw in [k.strip().lower() for k in a.keywords.split(",") if k.strip()]:
        kw_hits[kw] = {
            "in_readme": kw in readme.lower(),
            "matching_paths": [f for f in files if kw in f.lower()][:10],
        }

    out = {
        "repo": f"{owner}/{repo}",
        "url": meta.get("html_url"),
        "description": meta.get("description"),
        "homepage": meta.get("homepage"),
        "is_fork": meta.get("fork"),
        "created_at": meta.get("created_at"),
        "pushed_at": meta.get("pushed_at"),
        "languages": get(f"/repos/{owner}/{repo}/languages", a.token),
        "commits_sampled": len(commits),
        "commit_span": {"first": dates[0] if dates else None, "last": dates[-1] if dates else None},
        "active_days": len(days),
        "max_commits_single_day": max(days.values()) if days else 0,
        "authors": dict(authors),
        "file_count": len(files),
        "notable_files": [f for f in files if re.search(
            r"(readme|dockerfile|requirements|package\.json|pyproject|test|\.github/workflows|dag|schema|benchmark|results)",
            f, re.I)][:40],
        "readme": {"present": bool(readme), "chars": len(readme),
                   "has_results_section": bool(re.search(r"#+\s*(results|benchmark|metrics|evaluation)", readme, re.I)),
                   "urls": re.findall(r"https?://[^\s)\]]+", readme)[:10]},
        "keyword_hits": kw_hits,
        "notes": [],
    }
    if meta.get("fork"):
        out["notes"].append("Repo is a fork: check which commits are the student's.")
    if len(commits) >= 100:
        out["notes"].append("Commit sample capped at 100; counts are lower bounds.")
    if days and len(days) <= 2 and len(commits) > 15:
        out["notes"].append("Most commits fall on 1-2 days; worth asking about the build timeline.")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
