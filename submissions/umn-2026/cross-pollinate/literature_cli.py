"""Key-free literature tools for ApexClaw or any Python workspace."""
import argparse
import json
from literature import search_literature, read_paper


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["search", "read"])
    parser.add_argument("query", help="Search text or the exact source_id to read")
    parser.add_argument("--database", choices=["crossref", "europepmc"], default="crossref")
    parser.add_argument("--limit", type=int, default=4)
    parser.add_argument("--evidence", default="evidence.jsonl")
    args = parser.parse_args()
    if args.action == "search":
        result = search_literature(args.query, args.database, args.limit, args.evidence)
    else:
        result = read_paper(args.query, args.evidence)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
