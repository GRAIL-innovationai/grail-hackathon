---
name: handwritten-slides-a11y
description: >-
  Converts a PDF of handwritten slides (one slide per page), including math,
  into screen-reader HTML with Presentation MathML, and checks it against
  Revised Section 508 (WCAG 2.0 Level A and AA) and WCAG 2.1 Level AA.
  Use whenever the user supplies a slide PDF, scanned lecture notes, a
  handwritten deck, or handwritten equations and wants accessible text, a
  screen reader transcript, Section 508, WCAG, alt text, or MathML, even
  if they never say "skill".
---

This file is an [Agent Skill](https://agentskills.io). Any agent that can read a `SKILL.md` can follow it. Paths below are relative to the directory that contains this file.

# Handwritten slides to screen-reader HTML

Turn one PDF into two files:

- `out/<stem>/deck.html` — the document a screen reader uses
- `out/<stem>/review.md` — the human gate. It starts `Status: blocked`

The page image is the authority. A PDF text layer is only a hint. When they disagree, follow the image and record the disagreement in the review.

Do not say the deck meets Section 508 or WCAG. The checker only proves structure. Conformance still needs the review gate and a screen-reader pass.

## Steps

Copy this list and keep it current:

```
- [ ] Rasterize the PDF
- [ ] Read every page image
- [ ] Write deck.html and review.md (Status: blocked)
- [ ] Run the checker and fix failures
- [ ] Stop for review
- [ ] After the user confirms: Status: confirmed, edit, recheck
```

### 1. Rasterize

From the skill directory:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/normalize_pdf.py INPUT.pdf
```

That writes `work/<stem>/pages/NNN.png`, a text-layer sidecar, and `manifest.json`. Read the manifest, then read every PNG. Do not skip a page. If a page is blank, omit it from the HTML and note the omission in the review.

Stop and ask the user if a page is not one slide, or if the PDF is a photo spread, a notes page beside a slide, or a cropped whiteboard with no slide boundary.

### 2. Transcribe in reading order

For each slide, read top to bottom. Finish a left column before the right column, unless the handwriting clearly proceeds row by row, and record that choice in the review.

Rebuild meaning with HTML, not a picture of the slide:

- Slide title → `h2`. If there is no title, write a short one from the content and flag it.
- Two identical titles get a spoken distinction ("Forces, continued").
- Body text → paragraphs. Bullets and numbering → `ul` / `ol`. Keep list nesting.
- Tables → `table` with `caption` and `th`.
- Words stay words. Equations become Presentation MathML. Rules: [math.md](references/math.md).
- A drawing, plot, or circuit that is not an equation stays an image: short `alt`, and the information the alt does not carry goes in `figcaption`. Do not repeat the alt in the caption.
- Decorative rules and boxes get no image. If a box is only grouping, use a heading or a paragraph.
- Color is restated in words ("the dashed curve", "the upper force").
- Crossed-out writing is omitted. Note the omission in the review when the correction is unclear.
- Another language on part of a slide gets `lang` on that element. Set `html lang` from the deck. Default `en` only when the deck is English.

The HTML shape, stylesheet, and heading rules are in [template.html](references/template.html). Copy it and replace the sample slide. Leave the stylesheet as it is so contrast, resize, and reflow stay intact.

A worked slide is in [example.md](references/example.md). The pass tests are in [criteria.md](references/criteria.md).

### 3. Write the review

`review.md` begins with one of these lines and nothing else on that line:

```
Status: blocked
```

```
Status: confirmed
```

While blocked, include:

- A confirmation request, even when nothing looks uncertain.
- Every flag: slide number, what was hard to read, the reading you used, and the plausible alternative.
- Reading-order assumptions, missing titles, color used as meaning, omitted strikethroughs, blank pages, and text-layer disagreements.
- The criteria table from [criteria.md](references/criteria.md), filled in. Structural rows can be `pass` only after the checker exits 0. Transcription rows stay `manual` until the user confirms. The screen-reader row stays `manual` until the user reports an AT pass.

Flag a spot when another reading would change the meaning. Typical cases: `1` / `l` / `I`, `0` / `O`, `n` / `u`, minus / dash / equals, subscript versus baseline, ambiguous limits, and diagrams you cannot fully describe.

### 4. Check

```bash
.venv/bin/python scripts/check_output.py out/<stem>/deck.html
```

Fix every `FAIL` and run it again. `WARN` lines need a review note or a fix.

### 5. Stop

Show the user the flagged items and the path to `deck.html`. Ask them to confirm or correct. Leave `Status: blocked`. Do not describe the file as conformant, ready to publish, or finished.

### 6. After the user confirms

Apply their corrections. Set the first line to `Status: confirmed`. Move resolved flags under a Confirmed heading and keep what they decided. Set transcription criteria to `pass` only for items they confirmed. Then:

```bash
.venv/bin/python scripts/check_output.py out/<stem>/deck.html --review out/<stem>/review.md
```

Tell the user the structural checks passed, and that a screen-reader pass is still required before anyone claims conformance: NVDA with MathCAT, or VoiceOver, on at least one text slide, one equation slide, and one diagram slide. If an equation is spoken twice, remove its `alttext` and recheck.

## Output paths

| File | Role |
| --- | --- |
| `work/<stem>/` | Page images. Gitignored. |
| `out/<stem>/deck.html` | Accessible document |
| `out/<stem>/review.md` | Review gate |
| `out/<stem>/figures/` | Diagrams that remain images, referenced with relative `src` |
