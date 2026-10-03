# Criteria for this transcript

Revised Section 508 (36 CFR 1194, Appendix A, E205.4) requires WCAG 2.0 Level A and AA for electronic content. This skill also applies WCAG 2.1 Level AA, because that is the bar set for this project. Section 508 does not by itself incorporate WCAG 2.1.

WCAG 2.1 adds little for a static transcript beyond reflow, text spacing, orientation, and non-text contrast. Later rows that do not apply to this HTML are listed so they are not silently dropped.

Copy the table into `review.md` and fill Result with `pass`, `fail`, `n/a`, or `manual`.

| Criterion | What passing means here | Result |
| --- | --- | --- |
| 1.1.1 Non-text Content (A) | Equations are MathML. Remaining images have a short alt and, when the image carries more, a figcaption that adds that information. | manual |
| 1.2.1–1.2.5 Time-based media (A/AA) | No audio or video in a slide transcript. If a slide is only a video still, say so and do not invent captions. | n/a |
| 1.3.1 Info and Relationships (A) | Headings, lists, tables with header cells, and figures match the slide's structure. | manual |
| 1.3.2 Meaningful Sequence (A) | DOM order is the reading order recorded in the review. | manual |
| 1.3.3 Sensory Characteristics (A) | Instructions do not rely on shape, size, or position alone. | manual |
| 1.4.1 Use of Color (A) | Color meaning is also stated in words. | manual |
| 1.4.3 Contrast (AA) | Template colors only: near-black text on white. | pass after checker |
| 1.4.4 Resize Text (AA) | Template does not lock font size in px or disable zoom. | pass after checker |
| 1.4.5 Images of Text (AA) | Handwriting and printed slide text are real text. A logo may stay an image. | manual |
| 2.1.1 Keyboard (A) | Links are native `a` elements. | pass after checker |
| 2.4.1 Bypass Blocks (A) | Skip link points at the slides. | pass after checker |
| 2.4.2 Page Titled (A) | `title` and `h1` are the deck title. | pass after checker |
| 2.4.3 Focus Order (A) | Focus follows DOM order, which is reading order. | manual |
| 2.4.4 Link Purpose (A) | Each contents link is the slide's heading text. | pass after checker |
| 2.4.6 Headings and Labels (AA) | Each slide heading describes that slide. | manual |
| 3.1.1 Language of Page (A) | `html lang` is set. | pass after checker |
| 3.1.2 Language of Parts (AA) | A passage in another language has `lang`. | manual |
| 4.1.1 Parsing (A) | Document is well-formed XML. | pass after checker |
| 4.1.2 Name, Role, Value (A) | Native HTML elements, no custom widgets. | pass after checker |
| 1.3.4 Orientation (AA, 2.1) | No orientation lock. | pass after checker |
| 1.3.5 Identify Input Purpose (AA, 2.1) | No input fields. | n/a |
| 1.4.10 Reflow (AA, 2.1) | Page reflows at 320px CSS. Long equations scroll inside `.math-scroll`, not the page. | pass after checker |
| 1.4.11 Non-text Contrast (AA, 2.1) | Focus outline uses the template. Diagrams that stay images are covered by their text alternative. | manual |
| 1.4.12 Text Spacing (AA, 2.1) | No fixed heights that clip text when spacing increases. | pass after checker |
| 1.4.13 Content on Hover or Focus (AA, 2.1) | No hover-only content. | n/a |
| 2.1.4 Character Key Shortcuts (A, 2.1) | No shortcuts. | n/a |
| 2.5.1–2.5.4 Pointer input (A, 2.1) | No custom pointer behavior. | n/a |
| 4.1.3 Status Messages (AA, 2.1) | No status messages. | n/a |
| Screen reader spot check | NVDA with MathCAT, or VoiceOver, on a text slide, an equation slide, and a diagram slide. | manual |

Mark a "pass after checker" row `pass` only when `check_output.py` exits 0. Mark a `manual` transcription row `pass` only after the user confirms that item. Leave the screen-reader row `manual` until the user reports that pass.

Do not write a WCAG conformance claim in `deck.html`. Claims are optional in WCAG, and this workflow has not satisfied the accessibility-supported check until someone listens with a screen reader.
