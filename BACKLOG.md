# Backlog

Follow-up ideas and known gaps, not yet scheduled. Not a commitment or a
roadmap — just a place to park things so they aren't lost.

## Layout

### Let doodles bleed into the page margins (viewport centering)

Right now `.page { display:flex; justify-content:center }` around
`.page-wrap { max-width:900px }` centers every page's fixed-width canvas as
a hard-edged block — on any viewport wider than ~940px this leaves large,
totally empty margins on both sides (see the 2026-07-18 conversation: on
`pages/home.excalidraw` specifically, the drawn content only fills ~400px of
the declared 900px canvas width, compounding the effect).

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

### Exercise `excalidraw-rearrange` against real content

Built and tested to spec, but no page in `pages/` actually has a
`canvas-{width}` variant yet, so the responsive-switching path in
`src/template.ts` (`renderVariants` with >1 variant) has only been
exercised by synthetic tests, never a real multi-breakpoint post. Worth
running the tool against a real post once one exists, to shake out anything
the unit tests don't cover.

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
