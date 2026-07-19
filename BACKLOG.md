# Backlog

Follow-up ideas and known gaps, not yet scheduled. Not a commitment or a
roadmap — just a place to park things so they aren't lost.

## Layout

### Hand-drawn site chrome (wordmark + back-link) instead of coded nav

The wordmark and "back to notebook" link now live in a plain HTML/CSS
`<header class="site-nav">` (`src/template.ts` / `static/site.css`), pinned
to the viewport's actual edges — see the 2026-07-18 conversation. That was
the pragmatic call: hand-drawing them would mean extending
`excalidraw-converter`'s frame convention with a new "chrome" frame type
that isn't scoped to any single canvas variant's fixed-pixel bounds, and is
instead anchored to the viewport edge rather than the canvas's own edge —
real engineering across the converter and build pipeline for what's
currently just two small elements. Revisit if/when site chrome grows beyond
"wordmark + one back-link" enough to justify it, or if keeping *everything*
hand-drawn (no coded exceptions) becomes a firmer requirement.

### Let doodles bleed into the page margins (viewport centering)

Right now `.page { display:flex; justify-content:center }` centers every
page's fixed-width canvas as a hard-edged block — on any viewport wider than
the canvas's own width (712px as of the 2026-07-18 conversation) this leaves
large, totally empty margins on both sides.

Idea: let some hand-drawn elements intentionally cross the canvas frame's
own edge and render out into that margin area, so the page doesn't read as
"content in a box floating in blankness" — more like drawings actually
inhabiting the page. Needs some design thinking before implementation:

- Elements that extend past the canvas frame's x-range are currently
  excluded entirely (per-variant horizontal-bounds partition in
  `excalidraw-converter`) — that rule would need to allow a wider render
  region for the base "page" layer while keeping the multi-variant partition
  rule intact for responsive variants.
- Margin content probably shouldn't reflow/scale with viewport width the
  same way the main canvas does — likely wants its own fixed-position
  treatment, or an intentionally-narrower "safe" canvas width with looser
  margin bounds around it.
- Should decide whether margin doodles are per-page (drawn once per canvas)
  or a shared site-wide decoration layer.

## Content pipeline

### Bundle Cascadia Code (and other non-Excalifont fonts) properly

`excalidraw-converter`'s `assets/fonts/` only ships Excalifont today;
Helvetica/Cascadia/Nunito/etc. fall back to system fonts. Fine while every
real page uses fontFamily 5, but worth fixing if a post ever uses the code
font family.

### `excalidraw-rearrange` places new frames in the source canvas's x-range, leaking elements across variants

Found running the tool against real content for the first time (home page +
the free-spin post placeholder, 2026-07-19 conversation) — mobile content
was clipping/overflowing on narrow viewports even after generating a
`canvas-375` variant for both pages.

Root cause: `excalidraw-converter`'s per-variant partition
(`isWithinCanvasBounds` in `excalidraw-converter/src/frames.ts`) scopes
elements to a variant purely by x-coordinate range (element center falls
within `[canvasFrame.x, canvasFrame.x + canvasFrame.width]`) — it does not
check y-range or frame membership. `excalidraw-rearrange` places its
generated `canvas-{width}` frame at `originalCanvas.x` (see
`excalidraw-rearrange/src/frames.ts:139`), i.e. directly below the source
canvas but at the *same* x-origin. Since both frames start at x=0, any
desktop element whose horizontal center happens to fall within the
narrower target width (very likely for anything centered or left-aligned)
gets silently pulled into the mobile variant too, rendered at a large
negative `top` offset (the y-delta between the two frames) — invisible
until it overflows or overlaps something.

Worked around manually for the two existing pages by shifting the
generated `canvas-375` frame (and its children) to a separate, clearly
non-overlapping x-range (x=2000) after running the tool. That's a
per-file, per-run manual step — worth fixing properly, either:

- have `excalidraw-rearrange` place new frames in a non-overlapping
  x-range by default (e.g. `originalCanvas.x + originalCanvas.width + gap`
  instead of `originalCanvas.x`), or
- make `excalidraw-converter`'s partition frame-membership-aware instead
  of (or in addition to) x-range-based, so co-located frames on different
  y-rows don't need artificial horizontal separation at all.

Also worth adding a regression test in `excalidraw-rearrange` and/or
`excalidraw-converter` covering this exact case (two frames sharing an
x-origin, stacked vertically) now that it's a real observed failure, not
just a hypothetical.

### Draft support

No auth/drafts distinction currently — every file in `pages/` is published
on build. Convention could be a `custom.draft: true` field excluded from
listing/build, per the original FULL-SPEC.md non-goals note.

### Lazy-load inactive responsive variants

All canvas variants are currently present in the DOM at once (simple,
static-HTML-only, works with JS disabled), with CSS media queries just
toggling `display`. Fine for now; shipping every variant's SVG regardless of
which one is active is a real page-weight cost once posts have multiple
breakpoints. Flagged as a possible follow-up in FULL-SPEC.md too.

### Comments, search, RSS, pagination

Explicitly out of scope for v1 per FULL-SPEC.md. Revisit if the blog grows
enough posts for any of these to matter.
