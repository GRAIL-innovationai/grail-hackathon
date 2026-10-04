#!/usr/bin/env python3
"""Rasterize a one-slide-per-page PDF into ordered PNGs and a text-layer sidecar.

The page image is the transcription source. Extracted text is a hint only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

INSTALL = (
    "Missing dependency. From the skill directory (the folder that contains SKILL.md):\n"
    "  python3 -m venv .venv\n"
    "  .venv/bin/pip install -r requirements.txt\n"
    "  .venv/bin/python scripts/normalize_pdf.py INPUT.pdf"
)


def rasterize(pdf_path: Path, out_dir: Path, dpi: int) -> dict:
    try:
        import pypdfium2 as pdfium
    except ImportError:
        sys.exit(INSTALL)

    if dpi < 72:
        sys.exit("dpi must be at least 72 so handwriting stays legible.")

    try:
        doc = pdfium.PdfDocument(str(pdf_path))
    except pdfium.PdfiumError as exc:
        sys.exit(f"Could not open {pdf_path.name}: {exc}")

    page_count = len(doc)
    if page_count == 0:
        doc.close()
        sys.exit(f"{pdf_path.name} has no pages.")

    pages_dir = out_dir / "pages"
    text_dir = out_dir / "text"
    pages_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    width = max(3, len(str(page_count)))
    scale = dpi / 72
    pages = []

    for index in range(page_count):
        number = index + 1
        stem = f"{number:0{width}d}"
        image_path = pages_dir / f"{stem}.png"
        text_path = text_dir / f"{stem}.txt"

        page = doc[index]
        bitmap = page.render(scale=scale)
        bitmap.to_pil().save(image_path, format="PNG")

        textpage = page.get_textpage()
        text = textpage.get_text_bounded() or ""
        textpage.close()
        bitmap.close()

        text_path.write_text(text, encoding="utf-8")
        pages.append(
            {
                "number": number,
                "image": str(image_path.relative_to(out_dir)),
                "text": str(text_path.relative_to(out_dir)),
                "text_layer_empty": text.strip() == "",
                "width_px": image_path.stat().st_size and _png_size(image_path)[0],
                "height_px": _png_size(image_path)[1],
            }
        )
        page.close()
        print(f"page {number}/{page_count} -> {image_path}")

    doc.close()
    manifest = {
        "source": str(pdf_path.resolve()),
        "dpi": dpi,
        "page_count": page_count,
        "pages": pages,
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest_path}")
    return manifest


def _png_size(path: Path) -> tuple[int, int]:
    from PIL import Image

    with Image.open(path) as image:
        return image.size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="PDF with one slide per page")
    parser.add_argument(
        "--out",
        type=Path,
        help="Output directory (default: work/<pdf stem>/)",
    )
    parser.add_argument("--dpi", type=int, default=300, help="Raster DPI (default: 300)")
    args = parser.parse_args()

    pdf_path = args.pdf.expanduser().resolve()
    if not pdf_path.is_file():
        sys.exit(f"File not found: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        sys.exit(f"Expected a .pdf file, got {pdf_path.name}")

    out_dir = args.out if args.out else Path("work") / pdf_path.stem
    rasterize(pdf_path, out_dir, args.dpi)


if __name__ == "__main__":
    main()
