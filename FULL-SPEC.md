# vishaldalwadi.github.io — Full Project Spec

This is a single monorepo containing three projects, built in the order
listed below (each depends conceptually or literally on the ones before it):

1. **`excalidraw-converter/`** — npm package. Converts a single `.excalidraw`
   file (following a metadata/canvas frame convention) into SVG + HTML
   output, one variant per canvas frame found. No knowledge of blogs,
   routing, or multi-page sites — pure single-file conversion.
2. **`excalidraw-rearrange/`** — npm package + CLI. Authoring-time tool that
   takes an existing `.excalidraw` file and generates an additional
   `canvas-{width}` frame with content regrouped/stacked for a narrower
   target width, as a starting point for manual responsive tweaking in the
   Excalidraw app. No runtime dependency on the other two packages.
3. **Site content** (repo root) — the actual blog, `vishaldalwadi.github.io`.
   Depends on `excalidraw-converter` via npm workspace linking. Walks a
   `pages/` folder of `.excalidraw` files, converts each, applies routing
   rules, generates responsive CSS switching between canvas variants, and
   builds a static site to `dist/` (served by GitHub Pages).

All three share one repo, wired together with **npm workspaces** — see the
root-level layout below before diving into each project's spec.

---

## Repo layout (applies to all three projects below)

```
vishaldalwadi.github.io/          (repo root = npm workspace root = site content project)
├── package.json                   (workspace root manifest + site build scripts/deps combined)
├── site.config.json
├── pages/
│   ├── home.excalidraw
│   ├── posts/
│   └── templates/
│       └── base.excalidraw
├── static/
│   └── site.css
├── src/                            (site content's own source — build.ts, dev.ts, routing.ts, template.ts, cli.ts)
├── dist/                            (gitignored, build output — this is what GitHub Pages serves)
├── excalidraw-converter/             (Project 1 — npm workspace package)
├── excalidraw-rearrange/             (Project 2 — npm workspace package)
└── README.md
```

Root `package.json`:
```json
{
  "name": "vishaldalwadi.github.io",
  "private": true,
  "workspaces": [
    "excalidraw-converter",
    "excalidraw-rearrange"
  ],
  "dependencies": {
    "excalidraw-converter": "*"
  },
  "scripts": {
    "build": "...",
    "dev": "..."
  }
}
```

- `"excalidraw-converter": "*"` resolves via npm workspace symlinking (not a
  registry fetch) — one `npm install` at repo root wires up everything,
  including picking up local converter changes immediately with no
  reinstall/republish step.
- The site content does **not** depend on `excalidraw-rearrange` at
  build/run time — that tool is invoked manually by the author against
  files in `pages/` before committing them; it has no role in the build
  pipeline itself.
- Neither `excalidraw-converter` nor `excalidraw-rearrange` should declare
  `private: true` in their own `package.json` — both are normal publishable
  npm packages that also happen to be workspace-linked here for local
  development.
- All site-content CLI commands (`init`, `build`, `dev`) run from repo root.

---

## Project 1: excalidraw-converter (npm package)

### Purpose
An npm library + CLI that converts `.excalidraw` JSON files into static blog pages
(SVG background + real HTML text overlay), plus a CLI to scaffold new pages from
scratch or from a template.

This is Project 1 of 3. Both Project 2 (`excalidraw-rearrange`) and
Project 3 (the site content) depend on this package — Project 3 via npm
workspace linking, Project 2 only conceptually (same file format, no code
dependency).

---

### Core dependency

- `@excalidraw/excalidraw@0.18.1` (NOT `@excalidraw/utils`) — this is the React
  component package, but it exports headless functions we need directly:
  - `exportToSvg(data)` — returns an `SVGSVGElement`-like structure we can
    serialize to a string. Runs in Node with a `jsdom` (or similar) DOM shim,
    since it only constructs SVG DOM nodes and does not need to mount React or
    touch a real browser window.
  - Package requires `react` and `react-dom` as peer deps even for headless use
    — install them as regular deps in this package.
- `jsdom` — provides `window`/`document`/SVG globals so `exportToSvg` runs in
  plain Node (no browser, no Puppeteer).
- Verify the exact import path and function signature against the installed
  `0.18.1` package's type definitions
  (`node_modules/@excalidraw/excalidraw/dist/types/excalidraw/index.d.ts`)
  before writing the converter — do not assume the old `utils` API shape.

---

### Input: `.excalidraw` file conventions

A `.excalidraw` file is standard Excalidraw JSON: `{ type, version, elements[], appState, files }`.

This library defines two **required frame conventions** on top of that:

#### 1. `metadata` frame
- A frame element (`type: "frame"`) with `name: "metadata"`.
- Contains exactly one text element (child of that frame, i.e.
  `element.frameId === metadataFrame.id`) whose `text` content is a JSON object:
  ```json
  {
    "title": "My First Post",
    "slug": "my-first-post",
    "template": "base.excalidraw",
    "custom": {
      "date": "2026-07-01",
      "tags": ["nodejs", "excalidraw"],
      "type": "post"
    }
  }
  ```
- Fields (library-level, generic — meaningful to any consumer, not just a blog):
  - `title` (string, required)
  - `slug` (string, required — a URL-safe identifier for this page; what a
    consumer does with it, e.g. build a route, is up to them)
  - `template` (string, optional — filename of the template this page was
    based on; informational only, not used by the converter at build time)
  - `custom` (object, optional — a free-form bag for whatever the consuming
    project needs: `date`, `tags`, `type`, or anything else. The library
    does not read, validate, or interpret anything inside `custom` — it
    parses it as JSON and passes it through untouched in `ConvertResult`.
    Consumers (like a blog site generator) define their own schema for this
    object and validate it themselves.)
- The `metadata` frame and everything inside it (the frame itself + its text
  element) is **excluded from SVG/HTML rendering** — it's editor-only scratch
  space and must never appear in output.
- If no `metadata` frame is found, or the JSON inside fails to parse, or a
  required field is missing → converter throws a descriptive error naming the
  file and the missing/invalid field. Do not silently default.

#### 2. `canvas` frame(s) — one or more
- A file may contain **one or more** frame elements whose name identifies
  them as a canvas variant:
  - `name: "canvas"` — the default/primary variant (no explicit breakpoint,
    treated as the fallback/base width).
  - `name: "canvas-{width}"` (e.g. `canvas-400`, `canvas-1200`) — an
    additional variant at that pixel width. This naming convention matches
    the output of the companion `excalidraw-rearrange` tool, so files it
    produces are directly consumable here with no extra step.
- At least one canvas frame (`canvas` or `canvas-{width}`) is required. If
  none is found → throw a descriptive error.
- Each canvas frame is processed **independently** as its own variant,
  using the same rules as before (per-frame, not shared):
  - Its `width` (frame width, or the parsed number from its name for
    `canvas-{width}` frames — if both disagree, e.g. frame's actual drawn
    width doesn't match the number in its name, prefer the frame's actual
    width and log a warning) defines that variant's fixed render width.
  - Its `height` in the editor is ignored for output — real output height
    is the bounding box of that variant's content.
  - Only elements horizontally within that specific frame's `x` range
    belong to that variant. The same underlying element (e.g. a text box)
    may legitimately appear near multiple canvas frames if the author
    duplicated it per-variant (as `excalidraw-rearrange` does) — each
    variant only picks up elements within its own bounds, so there's no
    cross-variant leakage.
  - Coordinate transform is relative to that variant's own frame origin:
    `outputX = element.x - thisCanvasFrame.x`.
- A **breakpoint value** is derived per variant for consumers to use when
  choosing between them:
  - `canvas` (no number) → `breakpoint: null`, meaning "default/fallback,
    use when no more specific variant matches."
  - `canvas-{width}` → `breakpoint: {width}`, meaning "the smallest
    viewport this variant is intended for" (see Project 3 for how
    breakpoints are consumed — this library only extracts and exposes the
    number, it does not decide switching logic).

#### Element partition for rendering (per canvas variant)
For each canvas frame found, given all elements minus the `metadata` frame
and its children:
- **Text elements** (`type: "text"`) that are within *that* canvas frame's
  horizontal bounds → rendered as HTML (see Output section).
- **Every other element type** (rectangle, ellipse, diamond, line, arrow,
  freedraw, image) that is within *that* canvas frame's horizontal bounds →
  rendered into that variant's own SVG background, using `exportToSvg` with
  those elements only (text elements excluded from the SVG element set so
  they aren't double-rendered).
- Elements bound to text (e.g. a rectangle with a label) — the label text
  should still be extracted as an HTML overlay element positioned at its own
  coordinates; the container shape renders in SVG as normal. Note any
  limitation here in the README if perfect fidelity isn't achievable.

---

### Output

`convertPage(filePath: string): Promise<ConvertResult>`

```ts
interface CanvasVariant {
  breakpoint: number | null;  // null = default "canvas" frame, otherwise the width from "canvas-{width}"
  width: number;    // this variant's canvas frame width, fixed
  height: number;   // computed bounding-box height of this variant's content
  svg: string;       // serialized SVG string, viewBox="0 0 width height", background layer only, this variant's elements
  textElements: Array<{
    id: string;
    text: string;        // raw text content
    x: number;            // relative to this variant's canvas frame origin
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;   // resolved to a CSS font-family string, see below
    color: string;
    textAlign: "left" | "center" | "right";
    angle: number;         // rotation in radians, passed through as-is
  }>;
  html: string;      // full standalone render for THIS variant: wrapper div + svg background + absolutely-positioned text overlay
}

interface ConvertResult {
  metadata: {
    title: string;
    slug: string;
    template?: string;
    custom?: Record<string, unknown>;  // passed through as-is, untouched
  };
  variants: CanvasVariant[];  // one entry per canvas frame found, sorted by breakpoint ascending (null/default last, treated as the fallback)
}
```

- `variants`: always at least one entry. If the file only has a single
  `canvas` frame (the common case for a simple, non-responsive page), this
  is just a one-element array — existing simple use cases aren't burdened
  by the multi-variant shape, they just read `variants[0]`.
- Each variant's `svg`/`textElements`/`html` are fully self-contained and
  independent, computed exactly as described in the single-canvas spec
  before, just scoped to that one frame.
- `html` per variant: same structure as before —
  ```html
  <div class="excalidraw-page" style="position:relative; width:{width}px;">
    <div class="excalidraw-bg" style="position:absolute; top:0; left:0;">{svg}</div>
    <div class="excalidraw-text-layer" style="position:relative;">
      <div style="position:absolute; left:{x}px; top:{y}px; width:{width}px; font-size:{fontSize}px; font-family:{fontFamily}; color:{color}; text-align:{textAlign}; transform: rotate({angle}rad);">{escaped text}</div>
      ...
    </div>
  </div>
  ```
  - Escape text content for HTML safety (no raw injection).
  - Font family mapping: Excalidraw's `fontFamily` is a numeric enum
    (1 = Virgil/hand-drawn, 2 = Helvetica/normal, 3 = Cascadia/code). Map to
    actual CSS font stacks; ship the matching web fonts (Excalifont / Virgil,
    or closest open-license equivalent, Helvetica fallback, Cascadia Code) as
    static assets, and document how the site project should load them (e.g.
    `@font-face` in a shared stylesheet). Confirm exact enum values against
    the installed package's constants rather than assuming.
- This library does **not** generate any CSS media queries, `<picture>`-style
  switching markup, or JS for choosing between variants — it only produces
  the data for each variant. Deciding which variant to show at which
  viewport size is the consuming project's responsibility (see Project 3,
  "Responsive variant switching").

---

### Package API surface

```
excalidraw-site-converter
├── convertPage(filePath: string): Promise<ConvertResult>
├── init(options: { outputPath: string, template?: string }): Promise<void>
```

#### `init()`
- No `template`: write a brand-new minimal `.excalidraw` JSON file to
  `outputPath` containing exactly two frames:
  - `canvas` frame (the default/base variant, no breakpoint), sane default
    width (800), placeholder height (600) — just an editing starting point.
    `init()` only ever creates this single default variant; additional
    `canvas-{width}` variants are added later, either by hand (duplicating
    the frame in Excalidraw and renaming it) or via the companion
    `excalidraw-rearrange` tool, which is purpose-built for generating them.
  - `metadata` frame with one text element inside containing a JSON stub:
    ```json
    { "title": "", "slug": "", "custom": {} }
    ```
  Frames should be positioned so they don't overlap (e.g. metadata frame
  above/beside the canvas frame) so opening the file in Excalidraw is
  immediately usable.
- With `template` (path to an existing `.excalidraw` file): copy that file's
  full contents to `outputPath`, then:
  - If it already has at least one canvas frame (`canvas` or any
    `canvas-{width}`), leave all of them untouched — do not add a redundant
    default `canvas` frame on top of an existing variant.
  - If it has none, inject a fresh default `canvas` frame (per above).
  - If it already has a frame named `metadata`, leave it untouched;
    otherwise inject a fresh default one.
  - Positioned to avoid overlapping existing elements (e.g. place at
    the bounding-box edge of all existing content, with margin).
  - Never modify/remove any existing element from the template.

---

### CLI (bin entry, e.g. `excalidraw-site`)

```
excalidraw-site init <output-file.excalidraw> [--template <path>]
```
Thin wrapper around `init()`. Validate `output-file` doesn't already exist
(refuse to overwrite; error out with a clear message telling the user to pick
a new name or delete the existing file first).

No `build` command in this package — building a full site (routing, listing
pages, templating, dev server) is Project 3's responsibility. This package
only converts a single file at a time via `convertPage`, plus scaffolds new
files via `init`. Keep the boundary strict: this library knows nothing about
"blogs," "routes," or multi-page sites — only about single-file conversion.

---

### Error handling requirements
- No canvas frame found (neither `canvas` nor any `canvas-{width}`), missing
  `metadata` frame, malformed JSON in the metadata text element, missing
  required metadata fields → all throw `Error` subclasses with a message
  that includes the source file path and a specific description of what's
  wrong (not generic "invalid file").
- Two canvas frames resolving to the same breakpoint (e.g. two frames both
  named `canvas-400`, or malformed duplicate names) → throw, naming both
  conflicting frame ids.
- `init` refusing to overwrite an existing output file is also a thrown
  error, not a silent no-op.

### Testing requirements
- Unit tests (Vitest or Jest, pick one and be consistent) covering:
  - A valid minimal file with a single `canvas` frame → correct metadata,
    `variants` array of length 1, correct svg/textElements.
  - A file with `canvas` + `canvas-400` → `variants` array of length 2,
    sorted with `canvas-400` (breakpoint: 400) before the default `canvas`
    (breakpoint: null), each variant's elements correctly scoped to its own
    frame with no cross-variant leakage.
  - A file with only `canvas-{width}` frames (no default `canvas`) → still
    valid, produces variants with no `null` breakpoint entry.
  - No canvas frame at all → throws.
  - Duplicate breakpoint (two frames naming the same width) → throws.
  - Missing metadata frame → throws.
  - Malformed metadata JSON → throws.
  - Elements outside a given canvas frame's horizontal bounds are excluded
    from that variant.
  - Content extending below a canvas frame's original height still produces
    a taller `height` in that variant's result (scroll case).
  - `init()` with no template → produces file with one default `canvas` and
    one `metadata` frame.
  - `init()` with template missing all canvas frames → adds one default
    `canvas`, preserves existing metadata and all other elements untouched.
  - `init()` with template that already has a `canvas-{width}` frame (but no
    default `canvas`) → does NOT add a redundant default frame.
  - `init()` refuses to overwrite existing file.
- Fixture `.excalidraw` files should be committed under `test/fixtures/`.

### Non-goals (explicitly out of scope for this package)
- No multi-page site generation, routing, or listing pages.
- No dev server / file watching.
- No image optimization beyond whatever `exportToSvg` does natively for
  embedded Excalidraw images.
- No CSS framework/theming decisions — output is unstyled structural HTML/SVG;
  the consuming site owns all visual styling beyond position/font/color
  values that come directly from the Excalidraw file itself.
- No responsive switching logic (media queries, viewport detection, JS for
  picking a variant) — this library only extracts each canvas variant's data
  and its breakpoint number; deciding when to show which is the consuming
  site's job (see Project 3).

### Deliverable structure
```
excalidraw-converter/
├── package.json          (name, bin entry, main/exports, deps incl. @excalidraw/excalidraw@0.18.1, jsdom, react, react-dom)
├── src/
│   ├── index.ts           (exports convertPage, init)
│   ├── convert.ts         (core conversion logic)
│   ├── init.ts             (scaffold logic)
│   ├── frames.ts           (frame-finding, bounds-checking helpers)
│   ├── fontMap.ts          (Excalidraw fontFamily enum -> CSS font-family)
│   └── cli.ts               (bin entry point, arg parsing)
├── assets/fonts/           (bundled font files for Excalifont/Virgil, Cascadia Code)
├── test/
│   ├── fixtures/*.excalidraw
│   └── *.test.ts
└── README.md               (API docs, metadata schema, frame convention docs)
```
Use TypeScript throughout, compiled to `dist/` for publishing. Node >=18.

---

## Project 2: excalidraw-rearrange (npm package + CLI)

### Purpose
A CLI + library that takes an existing `.excalidraw` file (one already
containing the `canvas`/`metadata` frame conventions from
`excalidraw-site-converter`, Project 1) and produces a **new** `.excalidraw`
file: a second `canvas` frame at a different target width, with content
regrouped and stacked to roughly fit that width — a starting point for a
responsive/mobile variant that the author then opens in Excalidraw and
hand-tweaks.

This is Project 2 of 3. It depends conceptually on the frame conventions
defined in Project 1 but does **not** depend on Project 1's code —
it operates directly on raw Excalidraw JSON (same input format), independent
package.

This tool is explicitly a **starting-point generator, not a final-output
renderer**. Its job is to save manual repositioning effort, not to
eliminate human review. Output quality should be "good enough to tweak from,"
not "publish as-is."

---

### Core dependency
- No dependency on `@excalidraw/excalidraw` needed — this tool only reads/
  writes/repositions raw JSON element data, it does not render or export
  anything. Pure data transformation.
- Plain TypeScript/Node, no DOM shim required.

---

### Input

A `.excalidraw` file containing:
- An existing `canvas` frame (the "source" canvas, at its original width —
  e.g. 800px) — required. If missing, throw a descriptive error (same
  convention as Project 1: this tool assumes it's operating on output that
  already followed that convention).
- A `metadata` frame — required to exist, but this tool doesn't read or
  modify it (untouched, carried through to output as-is).
- All other elements, positioned within/around the source canvas frame.

### Output

A **new** `.excalidraw` file (same format, valid to open directly in
Excalidraw) containing:
- The original `metadata` frame, untouched.
- The original `canvas` frame and its original elements, untouched
  (the source layout is preserved — this tool never mutates the input
  layout, it only adds a new one alongside it).
- A **new** frame, named `canvas-{width}` (e.g. `canvas-400`), positioned
  below or beside the original canvas frame (non-overlapping, with margin —
  e.g. `originalCanvas.y + originalCanvas.height + 200`), at the
  `--width` specified.
- New copies of all content elements (not the metadata frame's contents),
  repositioned to fit within `canvas-{width}`'s horizontal bounds, following
  the grouping/stacking algorithm below. These are **new elements with new
  ids** (never mutate/move the originals) — the file ends up containing both
  the desktop layout and the new mobile layout side by side in the same
  canvas, exactly as you'd see two frames side by side in Excalidraw.
- Text elements are copied with their original `text`, `fontSize`,
  `fontFamily`, `color`, etc. — only `x`/`y` (and possibly `width` for
  wrapping, see below) change. Shape elements (rectangles, arrows, etc.)
  are copied with their original size/style — only position changes, size
  is not altered except where the group-scaling step (below) applies.

**Multiple target widths**: running the tool twice with different `--width`
values against the same output file (via `--in-place` or by passing the
previous output as the next input) should **add another new frame**
alongside the existing ones, not replace. Detect existing `canvas-{width}`
frames by name; if a frame for the requested width already exists, refuse
and require `--force` to regenerate it (delete old one, add new).

---

### The grouping/stacking algorithm

This is the core logic. Goal: preserve meaning (spatial relationships like
"this arrow points at this box," "this label sits next to this shape") while
producing a narrower, taller layout.

#### Step 1 — Build a proximity/connectivity graph
For all content elements (excluding the metadata frame and its children):
- **Explicit connections**: Excalidraw arrow/line elements have
  `startBinding`/`endBinding` referencing element ids they're attached to.
  Any two elements connected by a bound arrow/line → strong edge (always
  same group).
- **Container/label binding**: text elements with `containerId` pointing at
  a shape → strong edge (always same group, text stays with its container).
- **Proximity**: for remaining unconnected elements, compute bounding-box
  gap (nearest edge-to-edge distance, not center-to-center) between every
  pair. Two elements are proximity-linked if their gap is below a threshold
  — default threshold: `min(elementA.height, elementB.height) * 0.75`
  (i.e. roughly "less than three-quarters of a line's height apart" scales
  with local content size rather than a fixed pixel number). Make this
  threshold a `--proximity-threshold` CLI option with the computed default
  as fallback.
- Build a graph with elements as nodes, strong edges from binding/
  containment, weak edges from proximity. Run connected-components (using
  both strong and weak edges) to get initial groups.

#### Step 2 — Order groups
- Compute each group's bounding box (min/max x/y across all elements in it).
- Sort groups by **reading order**: primarily by `minY` (top to bottom),
  secondarily by `minX` (left to right) for groups with overlapping/close Y
  ranges (tie-break threshold: e.g. within one group-height of each other
  counts as "same row," sort those left-to-right).
- This produces the vertical stacking order for the new layout.

#### Step 3 — Scale each group to fit target width
- For each group, compute its bounding-box width in the source layout.
- If `groupWidth <= targetWidth`: no scaling needed, keep group's internal
  layout (relative positions of elements within the group) exactly as-is.
- If `groupWidth > targetWidth`: uniformly scale the group down (all
  elements' `x`, `y`, `width`, `height`, `fontSize`, and arrow points
  scaled by the same factor `targetWidth / groupWidth`) so it fits. This
  keeps internal spatial relationships (arrow-to-box, label-to-shape)
  intact within the group — only the group's own external position in the
  page changes, its internal geometry is preserved proportionally.
  - Apply a minimum font-size floor (default 12px, `--min-font-size` CLI
    option) — if scaling would take any text element below this floor,
    scale that group only down to the floor size instead (may mean the
    group's shapes end up narrower than `targetWidth`, centered instead of
    stretched — better than unreadable text). Flag this case in the CLI's
    summary output ("Group 3 hit the font-size floor, may overflow slightly
    narrower than target width — review manually").

#### Step 4 — Stack groups vertically
- Place groups in the order from Step 2, each starting at
  `previousGroup.bottom + verticalGap` (default gap: 40px, `--group-gap`
  CLI option).
- Horizontally: center each group within `targetWidth` (i.e.
  `groupX = (targetWidth - scaledGroupWidth) / 2`), unless the group was
  not scaled down (already fits) and its original horizontal alignment
  within the source canvas seems intentional (e.g. it was already
  left-aligned to the source canvas edge) — in that case preserve
  left-alignment instead of forcing centering. (This is a judgment call;
  document it as a heuristic, not a hard guarantee, in the README — the
  point is a reasonable starting point, not a perfect one.)

#### What this algorithm does NOT attempt
- No text reflow/rewrapping within a text element — text element `width`
  and wrapping stays as authored. If a text element is itself wider than
  `targetWidth` even after group scaling, it will overflow — flag this in
  the CLI summary ("Text element 'xyz' still exceeds target width after
  scaling, consider shortening or manually rewrapping").
- No re-ordering of elements *within* a group — only inter-group order
  changes (vertical stacking). Intra-group layout is preserved (scaled, not
  rearranged), since that's exactly the spatial relationship we're trying
  not to break.
- No image resizing beyond the same uniform group-scale factor.
- No attempt to detect "this is a 3-column layout, collapse to 1 column" as
  a special case beyond what naturally falls out of the proximity/ordering
  algorithm above — if 3 side-by-side boxes are far enough apart they'll be
  3 separate groups stacked vertically in reading order (left-to-right per
  row), which achieves the same practical result without needing dedicated
  column-detection logic.

---

### CLI

```
excalidraw-rearrange <input.excalidraw> --width <px> [options]

Options:
  --out <path>                 Output file path (default: overwrite input, i.e. add frame in place)
  --proximity-threshold <px>   Override default proximity grouping threshold
  --min-font-size <px>         Font-size floor during scaling (default: 12)
  --group-gap <px>             Vertical gap between stacked groups (default: 40)
  --force                      Regenerate canvas-{width} frame if one already exists
```

- Default behavior (no `--out`): modifies the input file in place, adding
  the new frame alongside existing content (per the "multiple target widths"
  behavior above).
- Always prints a **summary report** to stdout after running:
  - Number of groups detected.
  - Any groups that hit the font-size floor (with element ids/text preview).
  - Any text elements still overflowing target width after scaling.
  - Final computed height of the new canvas (bounding box of all placed
    groups).
  - Reminder: "Open the output file in Excalidraw to review and adjust —
    this is a starting point, not a final layout."

### Library API

```ts
rearrange(input: {
  filePath: string;
  targetWidth: number;
  proximityThreshold?: number;
  minFontSize?: number;
  groupGap?: number;
  force?: boolean;
}): Promise<{
  outputElements: ExcalidrawElement[];  // full new element array (original + new frame + new content)
  report: {
    groupCount: number;
    fontFloorGroups: Array<{ groupId: string; elementIds: string[] }>;
    overflowingText: Array<{ elementId: string; textPreview: string }>;
    newCanvasHeight: number;
  };
}>
```
CLI is a thin wrapper that calls this and writes the file / prints the report.

---

### Error handling
- Missing `canvas` frame in input → throw, same convention as Project 1.
- Missing `metadata` frame → throw (this tool assumes well-formed
  Project-1-convention input; it is not meant to run on arbitrary Excalidraw
  files).
- `canvas-{width}` frame already exists and `--force` not passed → throw
  with a message telling the user to pass `--force` or pick a different
  width.
- `targetWidth <= 0` or not provided → throw (argument validation).

### Testing requirements
- Unit tests for each algorithm step in isolation:
  - Proximity graph: two close elements → grouped; two far elements → not
    grouped; adjust threshold and confirm behavior changes.
  - Arrow-bound elements → always grouped regardless of distance.
  - Container-bound text → always grouped with its container.
  - Reading-order sort: groups at different Y → sorted top-to-bottom; groups
    at same Y, different X → sorted left-to-right.
  - Scaling: group narrower than target → unscaled; group wider → scaled by
    correct factor; scaling that would breach font floor → clamped, flagged
    in report.
  - Stacking: groups placed with correct gap, correct cumulative Y.
- Integration test: full fixture file with a known 3-column desktop layout
  (three unconnected clusters, one with a bound arrow, one with a
  container-bound label) run through `rearrange()` at a narrow target width
  → assert output has 3 groups stacked in the right order, original desktop
  frame untouched, new frame elements have new unique ids.
- Idempotency test: running `rearrange()` twice at two different widths on
  the same file → both new frames coexist, neither overwrites the other or
  touches the original.
- `--force` test: running twice at the *same* width → fails without
  `--force`, succeeds and replaces with `--force`.

### Non-goals
- No automatic multi-breakpoint generation ("generate mobile, tablet, and
  desktop in one command") — one width per invocation, run it as many times
  as you want breakpoints. A convenience wrapper script for multiple widths
  could be a follow-up, not v1.
- No integration into the blog site's build step in this spec — this is a
  standalone authoring-time tool. If later you want the blog to pick between
  `canvas` and `canvas-{width}` frames at build time based on viewport,
  that's a separate follow-up involving Project 1 and Project 3,
  not this one.
- No visual diffing/preview — review happens by opening the output file in
  the actual Excalidraw app.

### Deliverable structure
```
excalidraw-rearrange/
├── package.json
├── src/
│   ├── index.ts         (exports rearrange())
│   ├── graph.ts          (proximity + binding graph construction, connected components)
│   ├── ordering.ts        (reading-order group sort)
│   ├── scaling.ts          (group scale-to-fit + font floor clamping)
│   ├── stacking.ts          (vertical stacking + horizontal placement)
│   ├── frames.ts              (find canvas/metadata frames, create new canvas-{width} frame)
│   └── cli.ts                  (bin entry point, arg parsing, report printing)
├── test/
│   ├── fixtures/*.excalidraw
│   └── *.test.ts
└── README.md               (algorithm explanation, CLI usage, worked example with before/after screenshots)
```
TypeScript, Node >=18. No React/DOM dependency needed since this tool never
renders anything, only transforms JSON.

---

## Project 3: Site Content (repo root — vishaldalwadi.github.io)

### Purpose
A static site generator built on top of the `excalidraw-converter` npm
package (Project 1 — see "Project 1" above, folder
`excalidraw-converter/`, a sibling npm workspace package in this same
monorepo — see "Repo layout" at the top of this document for exact wiring). Author blog posts
entirely by drawing in Excalidraw; this project turns a folder of
`.excalidraw` files into a deployable static blog.

This project does **not** reimplement any conversion logic — it only calls
`convertPage()` and `init()` from the converter package and handles
everything above single-file conversion: routing, listing, templating, dev
server, static output.

---

### This project's `custom` metadata schema

The converter library's metadata only guarantees `title`, `slug`, and an
opaque `custom` object (see "Project 1" above). This project
defines and owns the shape of `custom` for every page it builds:

```json
{
  "type": "home" | "post" | "page",
  "date": "2026-07-01",   // required when type === "post", ISO date string
  "tags": ["nodejs", "excalidraw"]  // optional, only meaningful for type === "post"
}
```

This project is responsible for validating `custom` itself at build time
(the converter library does not know or care about `type`/`date`/`tags`):
- `custom.type` is required and must be one of `"home" | "post" | "page"`.
  Missing or invalid `type` → build fails with a clear error naming the file.
- `custom.date` is required when `custom.type === "post"`, and must parse as
  a valid date. Missing/invalid → build fails with a clear error.
- `custom.tags`, if present, must be a string array.

All references to "metadata.type" or "metadata.date" below refer to
`metadata.custom.type` / `metadata.custom.date` in the actual `ConvertResult`
— shortened in this doc for readability.

---

### Content model

```
site/
├── pages/
│   ├── home.excalidraw        (custom.type === "home")
│   ├── about.excalidraw       (custom.type === "page")
│   ├── posts/
│   │   ├── my-first-post.excalidraw   (custom.type === "post")
│   │   └── another-post.excalidraw
│   └── templates/
│       └── base.excalidraw     (starter template, passed via --template)
├── static/                     (site-wide CSS, fonts copied from converter's assets/fonts, favicon, etc.)
├── site.config.json             (site title, base URL, nav links, etc.)
└── dist/                        (generated output, gitignored)
```

- Every `.excalidraw` file under `pages/` (recursively, excluding
  `pages/templates/`) is a candidate page. Files in `pages/templates/` are
  never built directly — they only exist to be passed as `--template` to
  `init`.
- Exactly one file must have `custom.type === "home"` → becomes `/index.html`.
  - Zero home pages → build fails with a clear error.
  - More than one → build fails with a clear error listing the conflicting files.
- Files with `custom.type === "post"` → become `/blog/{slug}/index.html`.
  - Duplicate slugs across posts → build fails with a clear error listing
    the conflicting files.
- Files with `custom.type === "page"` → become `/{slug}/index.html`
  (e.g. an "about" page at `/about/`).
- A generated `/blog/index.html` listing page is always built automatically
  from all `type: post` pages, sorted by `date` descending. Listing page is
  templated by this project (not drawn in Excalidraw) — see Templating below.

---

### CLI commands

```
blog init <name>.excalidraw [--template <path>] [--dir posts|.]
```
Thin wrapper calling the converter package's `init()`, defaulting the output
path into `pages/posts/<name>.excalidraw` (or `pages/` root if `--dir .` is
passed, for non-post pages like `about`). Refuses to overwrite, same as the
underlying library.

```
blog build
```
- Walk `pages/`, call `convertPage()` on every `.excalidraw` file found.
- Validate the home/slug rules above; fail fast with clear aggregated errors
  (report *all* validation problems found, not just the first one, where
  feasible — e.g. collect all duplicate slugs before throwing).
- Render each page through the HTML template (see below) and write to
  `dist/` per the routing rules.
- Generate `/blog/index.html` listing page.
- Copy `static/` into `dist/static/`.
- Copy converter package's bundled fonts into `dist/static/fonts/` (or
  reference them directly — decide based on how the converter package
  exposes its `assets/fonts` directory; if it's not exported cleanly, note
  this as a follow-up rather than reaching into the package's internal
  `node_modules` path).
- Print a build summary: number of pages built, output path, any warnings.

```
blog dev
```
- Same as `build`, but:
  - Serves `dist/` on a local port (default 3000, configurable via
    `site.config.json` or `--port` flag).
  - Watches `pages/**/*.excalidraw` and `static/**` for changes, rebuilds
    incrementally (just the changed file's page is fine — full rebuild is
    acceptable too if incremental is complex, but note the tradeoff), and
    live-reloads the browser (simple approach: inject a small polling or
    WebSocket live-reload script in dev-mode HTML output only, never in
    `build` output).

---

### Templating

Each page type gets wrapped in a shared HTML shell (title tag, meta tags,
shared nav/footer, stylesheet links, font `@font-face` declarations). This
shell is authored as a normal HTML/template file in this project (e.g. using
a minimal templating approach — plain template literals in Node are fine,
no need for a heavy templating engine given the scope).

- Shell needs: `<title>`, `<meta name="description">` (from post title, or
  a site-level default), OpenGraph tags (`og:title`, `og:type`), canonical
  URL (from `site.config.json` base URL + route), link to `static/site.css`,
  `@font-face` blocks for the three Excalidraw font families.
- Post/page body: inject **all** of the converter's `variants` (see
  "Responsive variant switching" below) into the shell's main content area,
  not just a single `html` string. The converter output already handles
  positioning within each variant; this project should not need to
  re-position anything, only wrap and switch between variants.
- Home page: same mechanism, `custom.type === "home"` just controls the route.
- Blog listing page (`/blog/index.html`): NOT an Excalidraw file — a plain
  templated HTML page generated from post metadata (title, date, tags,
  route) rendered as a normal styled list/grid. This is the one page in the
  whole site not drawn by hand, since it's inherently dynamic/generated
  content. Keep its styling minimal and legible (system font stack is fine
  here, it doesn't need to match the hand-drawn aesthetic).

---

### Responsive variant switching

A page's `.excalidraw` source may contain multiple canvas frames — a
default `canvas` and zero or more `canvas-{width}` variants, typically
produced by hand-tweaking the output of the companion `excalidraw-rearrange`
tool (Project 2). The converter library exposes all of these as
`ConvertResult.variants` (sorted by breakpoint ascending, default/`null`
last) but deliberately does no switching logic itself — that's this
project's job.

#### Switching mechanism
- For each page, render **all** variants into the output HTML, each wrapped
  in its own container `div` with a `data-breakpoint` attribute (the
  variant's `breakpoint` value, or `"default"` for the null/default variant).
- Use plain CSS `min-width` media queries to show exactly one variant at a
  time, no JS required for the switching itself:
  - Sort variants by breakpoint descending for query construction.
  - The **default** (`breakpoint: null`) variant is the base/fallback:
    visible unless a media query below overrides it — i.e. it's the
    "smallest screen" rendering when no other variant is specified. If a
    `canvas-{width}` variant exists, the default variant is understood to
    be the widest/base-case layout, so its `min-width` cutoff is the
    largest breakpoint declared (i.e. the default variant is shown for
    `min-width: {largest breakpoint}px` and up, taking the place a
    `canvas-{largest}` would occupy — since it typically **is** the
    original desktop layout that all `canvas-{width}` variants were
    generated from).
  - Concretely, given breakpoints `[400, 800]` + default: generate CSS like
    ```css
    .excalidraw-variant { display: none; }
    .excalidraw-variant[data-breakpoint="400"] { display: block; }
    @media (min-width: 401px) {
      .excalidraw-variant[data-breakpoint="400"] { display: none; }
      .excalidraw-variant[data-breakpoint="800"] { display: block; }
    }
    @media (min-width: 801px) {
      .excalidraw-variant[data-breakpoint="800"] { display: none; }
      .excalidraw-variant[data-breakpoint="default"] { display: block; }
    }
    ```
    i.e. smallest breakpoint is the default visible state (mobile-first),
    each successive `min-width` query swaps to the next-larger variant, and
    the true default/fallback variant takes over past the largest declared
    breakpoint.
  - If a page has **only** a default `canvas` variant (the common,
    non-responsive case) — skip all of this, render it directly with no
    wrapper/media query overhead. Multi-variant markup should only be
    generated for pages that actually have more than one variant.
- All variants are present in the DOM (not lazy-loaded/swapped via JS) —
  this keeps the mechanism simple, static-HTML-only, and functional with
  JS disabled. The tradeoff (shipping multiple SVGs in the page weight) is
  acceptable for this use case; note it in the README as a known cost, and
  flag "lazy-load inactive variants via JS" as a possible follow-up
  optimization, not required for v1.
- Generate this CSS per-page (scoped to that page's specific breakpoints,
  since different pages may have different sets of variants) and inline it
  in a `<style>` block in the page's `<head>`, rather than trying to
  centralize breakpoints in the site-wide stylesheet — pages are
  independent and shouldn't be forced onto a shared breakpoint scheme.

#### What this project does NOT do
- No JS-based viewport detection or dynamic re-fetching — pure CSS media
  query switching, computed at build time from whatever breakpoints exist
  in that page's source file.
- No automatic generation of intermediate breakpoints — if a page only has
  `canvas` and `canvas-1200`, there is no variant shown between, say, 500px
  and 1199px other than whichever one the media query rules land on; authors
  control granularity entirely by how many `canvas-{width}` frames they
  create (via Project 3's tool or by hand).

`site.config.json` schema:
```json
{
  "title": "My Excalidraw Blog",
  "baseUrl": "https://example.com",
  "description": "A blog written entirely in Excalidraw.",
  "nav": [
    { "label": "Home", "href": "/" },
    { "label": "Blog", "href": "/blog/" },
    { "label": "About", "href": "/about/" }
  ]
}
```

---

### Non-goals / explicitly out of scope for v1
- No CMS/admin UI — authoring happens by editing `.excalidraw` files
  directly in the Excalidraw app (excalidraw.com or self-hosted) and saving
  the exported JSON into `pages/`.
- No comments, search, RSS feed, or pagination for v1 (note as clear
  follow-up ideas in README, don't build them now).
- No image optimization/CDN — static files served as-is.
- No auth/drafts distinction — every file in `pages/` is published on build.
  (If draft support is wanted later, convention could be a `custom.draft: true`
  field excluded from listing/build — flag as a follow-up, don't implement yet.)

---

### Testing requirements
- Test the routing/validation logic (home-page uniqueness, slug uniqueness,
  type→route mapping) with fixture `.excalidraw` files, independent of the
  real converter output where possible (mock `convertPage`).
- Test `blog build` end-to-end against a small fixture `pages/` directory,
  asserting the expected file tree exists under `dist/`.
- Test responsive variant switching:
  - A page with only a default `canvas` variant → output has no
    `data-breakpoint` wrapper markup, no generated media-query `<style>`
    block for that page.
  - A page with `canvas` + `canvas-400` → output contains both variants'
    markup, each wrapped with the correct `data-breakpoint`, and a
    generated `<style>` block with the correct `min-width` cutoff.
  - A page with three variants (e.g. `canvas-400`, `canvas-800`, default) →
    correct ascending media-query chain, correct variant visible at each
    tier.
- Dev server live-reload can be manually verified, doesn't need automated
  coverage.

### Deliverable structure (this project's own files, all at repo root as shown above)
```
site.config.json
pages/
  home.excalidraw
  posts/
  templates/
    base.excalidraw
static/
  site.css
src/
  build.ts
  dev.ts
  routing.ts        (home/slug validation, type->route mapping)
  template.ts        (HTML shell + variant-switching markup/CSS generation + blog listing page renderer)
  cli.ts
dist/                  (gitignored)
README.md               (how to write a post: draw in Excalidraw, add metadata frame, save into pages/posts/, run build)
```
Use TypeScript, Node >=18. Keep the dependency on the converter package as
the *only* place SVG/text-extraction logic lives — if this project finds
itself needing to touch raw Excalidraw element data directly, that's a sign
something belongs in the converter package instead.
