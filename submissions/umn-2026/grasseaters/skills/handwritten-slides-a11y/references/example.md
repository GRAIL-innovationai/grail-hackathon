# Worked slide

Handwritten slide, top to bottom:

- Title: Inclined plane
- Sentence: "Resolve weight into components."
- Equation centered on its own line: `mg sin θ` with `θ` possibly a `0`
- A small free-body sketch with `mg` straight down, `N` perpendicular to the surface, and `θ` between the surface and the horizontal
- A red arrow and a blue arrow, with the words "red = friction" written underneath

## deck.html fragment

```html
<section id="slide-2">
  <h2>Inclined plane</h2>
  <p>Resolve the weight into components.</p>
  <div class="math-scroll">
    <math xmlns="http://www.w3.org/1998/Math/MathML" display="block" alttext="m g sine theta">
      <mrow>
        <mi>m</mi>
        <mo>&#x2062;</mo>
        <mi>g</mi>
        <mo>&#x2062;</mo>
        <mi mathvariant="normal">sin</mi>
        <mo>&#x2061;</mo>
        <mi>&#x03B8;</mi>
      </mrow>
    </math>
  </div>
  <figure>
    <img src="figures/slide-2-fbd.png" alt="Free-body diagram of a block on an incline" />
    <figcaption>The weight mg points straight down. The normal force N is perpendicular to the surface. Theta is the angle between the surface and the horizontal.</figcaption>
  </figure>
  <p>The red arrow is friction. The blue arrow is the normal force.</p>
</section>
```

`&#x2061;` is function application, so "sin" applies to theta instead of multiplying by it.

The contents list gets another item whose text is exactly `Inclined plane`.

## review.md fragment

```markdown
Status: blocked

Please confirm the transcript, including the items below.

## Flagged

### Slide 2 — ambiguous symbol
- Reading used: θ in `mg sin θ`
- Alternative: the glyph may be a 0, which would make the expression `mg sin 0`
- Spoken gloss: m g sine theta

## Assumed

### Slide 2 — color
- The slide encodes friction and the normal force by color. The HTML states both in words.
```

Crop `figures/slide-2-fbd.png` from the page image. The caption carries the forces and the angle; the alt only names the figure, so the screen reader does not hear the same sentence twice.
