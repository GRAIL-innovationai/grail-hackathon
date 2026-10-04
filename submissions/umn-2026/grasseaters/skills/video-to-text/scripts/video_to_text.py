#!/usr/bin/env python3
"""Extract video text with the pinned upstream CLI, or render a saved MCP result."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys


def render(doc, out):
    if not isinstance(doc, dict):
        raise ValueError("Analysis must be a JSON object")
    for key in ("transcript", "ocrResults", "warnings"):
        if not isinstance(doc.get(key, []), list):
            raise ValueError(f"{key} must be an array")
    speech = doc.get("transcript", [])
    ocr = doc.get("ocrResults", [])
    for entry in speech + ocr:
        if not isinstance(entry, dict) or not isinstance(entry.get("text"), str):
            raise ValueError("Transcript/OCR entries must have a text string")
    speech = [e for e in speech if e["text"].strip()]
    def line(e):
        speaker = f" {e['speaker']}:" if e.get("speaker") else ""
        return f"[{e.get('time', 'unknown')}]{speaker} {e['text']}"
    transcript = "\n".join(line(e) for e in speech)
    onscreen = "\n".join(f"{line(e)} (OCR confidence: {e.get('confidence', 'unknown')})" for e in ocr)
    warnings = [str(w) for w in doc.get("warnings", [])]
    if not speech:
        warnings.append("No speech transcript extracted. Check audio/captions and transcription backend; do not infer silence from absence alone.")
    review = "Status: blocked\n\n# Video extraction review\n\n"
    review += "Check speech accuracy, speaker labels, timestamps, OCR and missing visual content against the original video. Sampled frames do not cover every slide or event. Accessibility conformance is unverified.\n\n"
    review += "## Extraction warnings\n\n" + ("\n".join("- " + w for w in warnings) or "- No upstream warnings; human review still required.") + "\n"
    out.mkdir(parents=True, exist_ok=True)
    (out / "analysis.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "transcript.txt").write_text(transcript + ("\n" if transcript else ""), encoding="utf-8")
    (out / "onscreen.txt").write_text(onscreen + ("\n" if onscreen else ""), encoding="utf-8")
    (out / "review.md").write_text(review, encoding="utf-8")
    return 0 if speech else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?")
    parser.add_argument("--analysis-json", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--language")
    parser.add_argument("--ocr-language", default="eng")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if bool(args.source) == bool(args.analysis_json):
        parser.error("Supply exactly one source or --analysis-json")
    out = args.out.expanduser().resolve()
    if out.exists() and any(out.iterdir()) and not args.overwrite:
        parser.error("Output directory is not empty; choose another or pass --overwrite")
    if args.analysis_json:
        doc = json.loads(args.analysis_json.expanduser().read_text(encoding="utf-8"))
    else:
        if not shutil.which("npx"):
            parser.error("npm/npx is required; install Node.js with npm")
        source = args.source
        if "://" not in source:
            path = Path(source).expanduser().resolve()
            if not path.is_file():
                parser.error(f"Video file does not exist: {path}")
            source = str(path)
        cmd = ["npx", "--yes", "--package=node@22", "--package=mcp-video-analyzer@0.10.1", "--", "mcp-video-analyzer", "analyze", source,
               "--detail", "standard", "--max-width", "0", "--ocr-language", args.ocr_language, "--out", str(out / "frames")]
        if args.language:
            cmd += ["--language", args.language]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, text=True, check=True)
        doc = json.loads(result.stdout)
    code = render(doc, out)
    print(f"Saved text and review to {out}")
    return code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Video extraction failed: {exc}", file=sys.stderr)
        sys.exit(1)
