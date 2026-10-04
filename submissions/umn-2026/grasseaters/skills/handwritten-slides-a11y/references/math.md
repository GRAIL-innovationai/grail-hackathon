# Math in the transcript

Use Presentation MathML from MathML Core. Browsers render that subset, and NVDA with MathCAT, JAWS, and VoiceOver navigate it. An image of an equation, a LaTeX string in the paragraph, or Unicode art does not give a screen reader a navigable expression.

Put each equation in its own `math` element with the MathML namespace, a `display` value, and an `alttext` fallback:

```html
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" alttext="x equals negative b plus or minus the square root of b squared minus 4 a c, all over 2 a">
  <mrow>
    <mi>x</mi>
    <mo>=</mo>
    <mfrac>
      <mrow>
        <mo>&#x2212;</mo>
        <mi>b</mi>
        <mo>&#x00B1;</mo>
        <msqrt>
          <mrow>
            <msup><mi>b</mi><mn>2</mn></msup>
            <mo>&#x2212;</mo>
            <mn>4</mn>
            <mo>&#x2062;</mo>
            <mi>a</mi>
            <mo>&#x2062;</mo>
            <mi>c</mi>
          </mrow>
        </msqrt>
      </mrow>
      <mrow>
        <mn>2</mn>
        <mo>&#x2062;</mo>
        <mi>a</mi>
      </mrow>
    </mfrac>
  </mrow>
</math>
```

Wrap display math in `<div class="math-scroll">` so a long line scrolls inside the box (WCAG 1.4.10). Inline math stays in the sentence with `display="inline"`. Sentence punctuation stays outside the `math` element.

## Rules

- Allowed elements: `math`, `mrow`, `mi`, `mn`, `mo`, `mtext`, `ms`, `mspace`, `mfrac`, `msqrt`, `mroot`, `msub`, `msup`, `msubsup`, `munder`, `mover`, `munderover`, `mmultiscripts`, `mprescripts`, `none`, `mtable`, `mtr`, `mtd`.
- Do not use `mfenced`, `mstyle`, `menclose`, `semantics`, or `annotation`. Fences are `<mo fence="true">` around an `mrow`. TeX for the reviewer goes in `review.md`, not inside the equation, so it is not spoken twice.
- Identifiers are `mi`, numbers are `mn`, operators are `mo`. Function names are one `mi` with `mathvariant="normal"` (`sin`, `log`), not three italic letters.
- Use `&#x2062;` (invisible times) between juxtaposed factors (`2`, `a`, `c`) so the speech is "2 a c" and not a single token.
- Use `&#x2212;` for minus, not a hyphen.
- A differential is `<mi mathvariant="normal">d</mi>`.
- Greek letters are Unicode inside `mi` (`α`), which MathCAT speaks as the letter name.
- Words inside an expression ("for", "if", units) are `mtext`.
- Matrices and aligned steps are `mtable` / `mtr` / `mtd`. One derivation is one `math` element, read top to bottom.
- `alttext` is a short spoken English gloss, not LaTeX. It is the fallback when MathML is not spoken. Do not also print that sentence beside the equation.
- If a screen reader later speaks the equation twice, remove `alttext` and recheck.

## Flag these

Record the alternative in `review.md` before the user confirms:

- `1`, `l`, and `I`; `0` and `O`; `n` and `u`; `z` and `2`
- subscript versus a character on the baseline
- minus, dash, fraction bar, and equals
- limits on integrals and sums
- a dot that could be multiplication, a decimal point, or an accent
- a squiggle that could be a radical, a division bar, or a strikethrough

## Small forms

Inline variable in a sentence:

```html
<p>The force is <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" alttext="F"><mi>F</mi></math>.</p>
```

Integral:

```html
<div class="math-scroll">
  <math xmlns="http://www.w3.org/1998/Math/MathML" display="block" alttext="the integral from 0 to 1 of x squared d x">
    <mrow>
      <msubsup>
        <mo>&#x222B;</mo>
        <mn>0</mn>
        <mn>1</mn>
      </msubsup>
      <msup><mi>x</mi><mn>2</mn></msup>
      <mo>&#x2062;</mo>
      <mi mathvariant="normal">d</mi>
      <mi>x</mi>
    </mrow>
  </math>
</div>
```
