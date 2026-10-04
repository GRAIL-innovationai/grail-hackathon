#!/usr/bin/env python3
"""Check a slide transcript against the structural rules in this skill.

Exit 0 when there is no FAIL. WARN lines are printed and do not fail the run
unless --review finds the review gate is still blocked.
"""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

XHTML = "http://www.w3.org/1999/xhtml"
MATH = "http://www.w3.org/1998/Math/MathML"
XH = f"{{{XHTML}}}"
MH = f"{{{MATH}}}"

ALLOWED_MATH = {
    "math",
    "mrow",
    "mi",
    "mn",
    "mo",
    "mtext",
    "ms",
    "mspace",
    "mfrac",
    "msqrt",
    "mroot",
    "msub",
    "msup",
    "msubsup",
    "munder",
    "mover",
    "munderover",
    "mmultiscripts",
    "mprescripts",
    "none",
    "mtable",
    "mtr",
    "mtd",
}
TOKENS = {"mi", "mn", "mo", "mtext", "ms"}
ARITY = {
    "mfrac": 2,
    "msqrt": 1,
    "mroot": 2,
    "msub": 2,
    "msup": 2,
    "msubsup": 3,
    "munder": 2,
    "mover": 2,
    "munderover": 3,
}
LATEX_MARKERS = ("\\frac", "\\sum", "\\int", "\\sqrt", "$$")


class Report:
    def __init__(self) -> None:
        self.fails: list[str] = []
        self.warns: list[str] = []

    def fail(self, message: str) -> None:
        self.fails.append(message)

    def warn(self, message: str) -> None:
        self.warns.append(message)


def local(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def ns(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return ""


def text_of(element: ET.Element) -> str:
    return "".join(element.itertext()).strip()


def check(html_path: Path, review_path: Path | None) -> Report:
    report = Report()
    try:
        root = ET.parse(html_path).getroot()
    except ET.ParseError as exc:
        report.fail(f"Document is not well-formed XML: {exc}")
        return report

    if local(root.tag) != "html" or ns(root.tag) != XHTML:
        report.fail("Root element must be html in the XHTML namespace.")
        return report

    lang = root.attrib.get("lang", "").strip()
    if not lang:
        report.fail("html is missing lang.")
    elif not _lang_ok(lang):
        report.fail(f"html lang={lang!r} is not a language tag.")

    _check_viewport(root, report)
    title = _check_title(root, report)
    h1 = _check_outline(root, report, title)
    _check_skip_and_nav(root, report, h1)
    _check_images(html_path, root, report)
    _check_tables(root, report)
    _check_math(root, report)
    _check_links(root, report)
    _check_banned(root, report)
    if review_path is not None:
        _check_review(review_path, report)
    return report


def _lang_ok(value: str) -> bool:
    parts = value.split("-")
    if not parts[0].isalpha() or not 2 <= len(parts[0]) <= 3:
        return False
    return all(part.isalnum() and 2 <= len(part) <= 8 for part in parts[1:])


def _check_viewport(root: ET.Element, report: Report) -> None:
    for meta in root.iter(f"{XH}meta"):
        if meta.attrib.get("name", "").lower() != "viewport":
            continue
        content = meta.attrib.get("content", "").lower().replace(" ", "")
        if "user-scalable=no" in content or "maximum-scale=1" in content:
            report.fail("viewport disables zoom. Remove user-scalable=no and maximum-scale.")


def _check_title(root: ET.Element, report: Report) -> str:
    titles = list(root.iter(f"{XH}title"))
    if len(titles) != 1 or not text_of(titles[0]):
        report.fail("Document needs one non-empty title.")
        return ""
    return text_of(titles[0])


def _check_outline(root: ET.Element, report: Report, title: str) -> list[tuple[str, str]]:
    headings = []
    for element in root.iter():
        name = local(element.tag)
        if ns(element.tag) == XHTML and name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            headings.append((name, text_of(element), element))

    h1s = [item for item in headings if item[0] == "h1"]
    if len(h1s) != 1:
        report.fail(f"Document needs exactly one h1, found {len(h1s)}.")
    elif title and h1s[0][1] != title:
        report.fail(f"title {title!r} and h1 {h1s[0][1]!r} must match.")

    previous = 0
    for name, text, _element in headings:
        level = int(name[1])
        if not text:
            report.fail(f"Empty {name}.")
        if previous and level > previous + 1:
            report.fail(f"Heading jumps from h{previous} to {name} ({text!r}).")
        previous = level

    sections = [element for element in root.iter(f"{XH}section")]
    if not sections:
        report.fail("Document has no slide sections.")
    h2_texts = []
    for section in sections:
        section_id = section.attrib.get("id", "").strip()
        if not section_id:
            report.fail("A slide section is missing id.")
        first_heading = None
        for element in section.iter():
            if element is section:
                continue
            if ns(element.tag) == XHTML and local(element.tag) in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                first_heading = element
                break
        if first_heading is None or local(first_heading.tag) != "h2" or not text_of(first_heading):
            report.fail(f"Section {section_id or '(no id)'} must start with a non-empty h2.")
        else:
            h2_text = text_of(first_heading)
            h2_texts.append((section_id, h2_text))
            if h2_text.lower().startswith("slide ") and h2_text[6:].isdigit():
                report.warn(f"{section_id} heading {h2_text!r} is a placeholder. Use a descriptive title and flag it.")

    seen: dict[str, str] = {}
    for section_id, h2_text in h2_texts:
        key = h2_text.casefold()
        if key in seen:
            report.fail(f"Duplicate slide heading {h2_text!r} on {seen[key]} and {section_id}.")
        seen[key] = section_id
    return h2_texts


def _check_skip_and_nav(root: ET.Element, report: Report, slides: list[tuple[str, str]]) -> None:
    body = root.find(f"{XH}body")
    if body is None:
        report.fail("Document has no body.")
        return
    first = next((child for child in list(body) if local(child.tag) != "skip"), None)
    # The skip link is the first element child.
    if not list(body) or local(list(body)[0].tag) != "a" or list(body)[0].attrib.get("href") != "#slides":
        report.fail('The first element in body must be <a href="#slides">Skip to slides</a>.')
    slides_target = root.find(f".//{XH}div[@id='slides']")
    if slides_target is None:
        report.fail('Missing <div id="slides"> around the slide sections.')

    nav_links = []
    for nav in root.iter(f"{XH}nav"):
        for anchor in nav.iter(f"{XH}a"):
            nav_links.append((anchor.attrib.get("href", ""), text_of(anchor)))
    if not nav_links:
        report.fail("Missing a contents nav of slide links.")
        return

    expected = [(f"#{section_id}", h2_text) for section_id, h2_text in slides]
    if nav_links != expected:
        report.fail(
            "Contents links must match the slide headings in order. "
            f"Found {nav_links}, expected {expected}."
        )


def _check_images(html_path: Path, root: ET.Element, report: Report) -> None:
    for image in root.iter(f"{XH}img"):
        if "alt" not in image.attrib:
            report.fail("An img is missing alt.")
            continue
        alt = image.attrib.get("alt", "")
        decorative = image.attrib.get("data-decorative") == "true"
        if decorative and alt != "":
            report.fail("A decorative image must have alt=\"\".")
        if not decorative and alt.strip() == "":
            report.fail('A content image has empty alt. Describe it, or mark it data-decorative="true".')
        if any(marker in alt for marker in LATEX_MARKERS) or alt.strip().startswith("$"):
            report.fail(f"Image alt looks like LaTeX ({alt[:40]!r}). Put the equation in MathML.")
        if not decorative and len(alt) > 120:
            report.fail(f"alt is {len(alt)} characters. Shorten it and put the rest in figcaption.")

        src = image.attrib.get("src", "").strip()
        if not src:
            report.fail("An img is missing src.")
        elif "://" not in src:
            resolved = (html_path.parent / src).resolve()
            if not resolved.is_file():
                report.fail(f"Image not found: {src}")

        parent = _parent_map(root).get(image)
        if decorative:
            continue
        if parent is None or local(parent.tag) != "figure":
            report.fail("A content image must be inside figure, with a figcaption that adds information.")
            continue
        captions = [text_of(child) for child in list(parent) if local(child.tag) == "figcaption"]
        if len(captions) != 1 or not captions[0]:
            report.fail("A figure needs one non-empty figcaption.")
        elif captions[0] == alt.strip():
            report.fail("figcaption repeats the alt. The caption must add the information the alt does not carry.")


def _check_tables(root: ET.Element, report: Report) -> None:
    for table in root.iter(f"{XH}table"):
        if not any(local(element.tag) == "th" for element in table.iter()):
            report.fail("A table has no th header cells.")
        captions = [element for element in list(table) if local(element.tag) == "caption"]
        if len(captions) != 1 or not text_of(captions[0]):
            report.fail("A table needs one non-empty caption.")


def _check_math(root: ET.Element, report: Report) -> None:
    maths = [element for element in root.iter() if ns(element.tag) == MATH and local(element.tag) == "math"]
    if not maths:
        report.warn("No math elements. Fine when the deck has no equations; record that in the review.")
    for math in maths:
        if ns(math.tag) != MATH:
            report.fail("math must use the MathML namespace.")
        display = math.attrib.get("display", "")
        if display not in {"inline", "block"}:
            report.fail('Each math element needs display="inline" or display="block".')
        alttext = math.attrib.get("alttext", "").strip()
        if not alttext:
            report.fail("Each math element needs a spoken alttext fallback.")
        elif any(marker in alttext for marker in LATEX_MARKERS):
            report.fail("alttext must be spoken English, not LaTeX.")
        if display == "block":
            parent = _parent_map(root).get(math)
            if parent is None or "math-scroll" not in parent.attrib.get("class", "").split():
                report.fail('Display math must be wrapped in <div class="math-scroll">.')
        _walk_math(math, report)


def _walk_math(math: ET.Element, report: Report) -> None:
    for element in math.iter():
        if ns(element.tag) != MATH:
            report.fail(f"Non-MathML element <{local(element.tag)}> inside an equation.")
            continue
        name = local(element.tag)
        if name not in ALLOWED_MATH:
            report.fail(f"<{name}> is not in the MathML Core subset. See references/math.md.")
            continue
        children = list(element)
        if name in TOKENS:
            if children:
                report.fail(f"<{name}> must contain text, not elements.")
            elif not text_of(element):
                report.fail(f"Empty <{name}>.")
        if name in ARITY and len(children) != ARITY[name]:
            report.fail(f"<{name}> must have {ARITY[name]} children, found {len(children)}.")
        if name == "mtr" and not any(local(child.tag) == "mtd" for child in children):
            report.fail("<mtr> needs at least one <mtd>.")
        if name in {"math", "mrow"} and not children:
            report.fail(f"<{name}> is empty.")


def _check_links(root: ET.Element, report: Report) -> None:
    ids = set()
    for element in root.iter():
        element_id = element.attrib.get("id")
        if element_id:
            if element_id in ids:
                report.fail(f"Duplicate id {element_id!r}.")
            ids.add(element_id)
    for anchor in root.iter(f"{XH}a"):
        if not text_of(anchor) and not anchor.attrib.get("aria-label", "").strip():
            report.fail("A link has no text.")
        href = anchor.attrib.get("href", "")
        if href.startswith("#") and href[1:] not in ids:
            report.fail(f"Link target {href} does not match an id.")


def _check_banned(root: ET.Element, report: Report) -> None:
    for element in root.iter():
        name = local(element.tag)
        if name in {"script", "iframe", "object", "embed", "canvas"}:
            report.fail(f"<{name}> is not part of a slide transcript.")
        if name == "svg":
            report.warn("SVG found. Equations belong in MathML. A diagram SVG still needs a text equivalent.")
        if ns(element.tag) == XHTML and element.attrib.get("style"):
            report.warn(f"Inline style on <{name}> can break contrast or text spacing. Keep the template stylesheet.")


def _check_review(review_path: Path, report: Report) -> None:
    if not review_path.is_file():
        report.fail(f"Review file not found: {review_path}")
        return
    first = review_path.read_text(encoding="utf-8").splitlines()
    status = first[0].strip() if first else ""
    if status != "Status: confirmed":
        report.fail(
            f"{review_path.name} starts with {status!r}. "
            "The gate stays blocked until the user confirms the transcript."
        )


def _parent_map(root: ET.Element) -> dict[ET.Element, ET.Element]:
    return {child: parent for parent in root.iter() for child in list(parent)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path, help="Path to deck.html")
    parser.add_argument("--review", type=Path, help="review.md that must start with Status: confirmed")
    args = parser.parse_args()

    html_path = args.html.expanduser().resolve()
    if not html_path.is_file():
        sys.exit(f"File not found: {html_path}")

    review_path = args.review.expanduser().resolve() if args.review else None
    report = check(html_path, review_path)
    for message in report.fails:
        print(f"FAIL {message}")
    for message in report.warns:
        print(f"WARN {message}")
    if report.fails:
        print(f"{len(report.fails)} failure(s), {len(report.warns)} warning(s).")
        sys.exit(1)
    print(f"OK {len(report.warns)} warning(s).")


if __name__ == "__main__":
    main()
