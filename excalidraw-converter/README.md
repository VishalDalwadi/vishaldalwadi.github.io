# excalidraw-converter

Converts a single `.excalidraw` file (following a metadata/canvas frame
convention) into SVG + HTML output — one variant per canvas frame found. No
knowledge of blogs, routing, or multi-page sites: pure single-file
conversion. Consuming projects (like the site generator at the root of this
monorepo) own routing, templating, and multi-page concerns on top of this.

Runs headless in plain Node via `jsdom` — no browser, no Puppeteer/Playwright.

## Install

Inside this monorepo, the package is wired up via npm workspaces — run
`npm install` at the repo root.

## Frame conventions

A `.excalidraw` file is standard Excalidraw JSON. This library reads three
frame-name conventions on top of it:

### `metadata` (required, exactly one)

A frame named `metadata` containing one text element whose content is JSON:

```json
{
  "title": "My First Post",
  "slug": "my-first-post",
  "template": "base.excalidraw",
  "custom": { "type": "post", "date": "2026-07-01", "tags": ["rockets"] }
}
```

- `title` (string, required)
- `slug` (string, required) — a URL-safe identifier; what a consumer does
  with it (build a route, etc.) is up to them
- `template` (string, optional) — informational only, not used at build time
- `custom` (object, optional) — an opaque bag passed through untouched.
  This library never reads, validates, or interprets anything inside it —
  consuming projects define and validate their own schema for it.

The `metadata` frame and its contents are excluded from all SVG/HTML output.

### `canvas` / `canvas-{width}` (required, one or more)

- `canvas` — the default/base variant (`breakpoint: null`).
- `canvas-{width}` (e.g. `canvas-400`) — an additional variant at that pixel
  width (`breakpoint: {width}`). Matches the naming convention produced by
  the companion [`excalidraw-rearrange`](../excalidraw-rearrange) tool.

Each canvas frame is processed independently: only elements horizontally
within that frame's own x-range belong to that variant (no cross-variant
leakage), and coordinates are output relative to that frame's own origin
(`outputX = element.x - canvasFrame.x`). At least one canvas frame is
required.

### `link:{target}` (optional, any number)

A frame named `link:{target}` marks its contents as a clickable hit area.
`target` is an opaque string — this library extracts it verbatim (e.g.
`link:home` → `target: "home"`, `link:post/my-first-post` →
`target: "post/my-first-post"`) and never resolves it to an actual URL;
that's the consuming project's job (mirrors how `custom` is opaque). Two
link frames may share the same `target`. Elements inside a `link:*` frame
still render normally (as SVG or text overlay, scoped per-variant like
everything else) — the frame only additionally reports a `links` entry with
the frame's own bounding box, for the consumer to render as a hit area
overlay.

## API

```ts
import { convertPage, init } from "excalidraw-converter";
```

### `convertPage(filePath: string): Promise<ConvertResult>`

```ts
interface ConvertResult {
  metadata: {
    title: string;
    slug: string;
    template?: string;
    custom?: Record<string, unknown>;
  };
  variants: CanvasVariant[]; // sorted by breakpoint ascending, null/default last
}

interface CanvasVariant {
  breakpoint: number | null;
  width: number;
  height: number; // bounding-box height of this variant's actual content
  svg: string;     // background layer: non-text elements only
  textElements: TextOverlayElement[]; // for building an HTML text overlay
  links: LinkOverlay[];                // for building clickable hit areas
  html: string;     // a standalone, self-contained render of this variant
}
```

`variant.html` is a ready-to-use convenience render (SVG background +
absolutely-positioned text overlay + link hit-areas, each `<a>`'s `href` set
to the raw `target` string as a placeholder). It's handy for quick checks,
but a real site should usually build its own markup from `svg` /
`textElements` / `links` directly, since it needs to resolve `target`
strings into real routes — see this repo's root `src/template.ts` for an
example.

Throws (all subclasses of `ExcalidrawConvertError`, exported from the
package) with a message naming the source file and the specific problem —
never generic "invalid file" errors:

- `MissingMetadataFrameError` — no `metadata` frame found
- `InvalidMetadataError` — malformed JSON, or a required field missing
- `MissingCanvasFrameError` — no `canvas`/`canvas-{width}` frame found
- `DuplicateBreakpointError` — two canvas frames resolve to the same
  breakpoint (names both conflicting frame ids)

### `init(options: { outputPath: string; template?: string }): Promise<void>`

- No `template`: writes a fresh minimal file with a `canvas` frame
  (800×600) and a `metadata` frame containing `{ "title": "", "slug": "", "custom": {} }`.
- With `template` (path to an existing `.excalidraw` file): copies it, then
  injects a default `canvas` frame only if none exists, and a default
  `metadata` frame only if none exists — existing frames and all other
  content are left untouched.
- Refuses to overwrite an existing `outputPath` (throws `OutputExistsError`).

### `resolveFontFamily(fontFamily: number | undefined | null): string`

Maps Excalidraw's numeric `fontFamily` enum to a CSS `font-family` stack.
Covers the real values shipped by `@excalidraw/excalidraw@0.18.1` (`Virgil:1,
Helvetica:2, Cascadia:3, Excalifont:5, Nunito:6, "Lilita One":7, "Comic
Shanns":8, "Liberation Sans":9` — not the naive 1/2/3 guess a casual reading
of older docs might suggest). Only Excalifont's font file is bundled in
`assets/fonts/`; Helvetica/Cascadia/etc. fall back to system fonts. Never
throws — an unrecognized value falls back to the Excalifont stack, since
font resolution is a rendering concern, not a validation one.

## CLI

```sh
excalidraw-site init <output-file.excalidraw> [--template <path>]
```

Thin wrapper around `init()`. No `build` command in this package — building
a full multi-page site is a consuming project's job (see this repo's root
`src/cli.ts` for `blog build`/`blog dev`).

## Rendering notes

- Runs `@excalidraw/excalidraw`'s headless `exportToSvg` inside a minimal
  `jsdom` shim (see `ensureDom()` in `src/convert.ts`) — no browser. Getting
  this working headless required patching a few real environment gaps:
  jsdom's getter-only `navigator`, a missing global `devicePixelRatio`, a
  `null` 2D canvas context that some of the package's UI-only code paths
  feature-detect against (stubbed with a harmless proxy), and a missing
  global `Path2D` (needed by roughjs for freedraw/curved-stroke geometry —
  provided by the `path2d` package here).
- Ships as an esbuild-bundled, self-contained `dist/` (see `build.mjs`) so
  it runs under plain `node`, not just under a bundler.
  `@excalidraw/excalidraw`'s published build relies on bundler-only module
  resolution (an extensionless deep import into `roughjs/bin/rough`, and a
  JSON import of `open-color/open-color.json` without an import attribute)
  that plain Node ESM rejects at runtime otherwise.
- Any inline `style="..."` HTML this package generates escapes the full
  attribute value, not just the visible text content — `font-family` CSS
  values contain literal double quotes (e.g. `"Excalifont", "Virgil",
  cursive`), which would otherwise prematurely close a double-quoted style
  attribute and silently truncate every property after it.

## Testing

```sh
npm test
```

Vitest, with fixtures under `test/fixtures/*.excalidraw` covering: a minimal
single-canvas file, multi-variant (`canvas` + `canvas-400`) with no
cross-variant leakage, width-only variants (no default `canvas`), missing
canvas/metadata frames, malformed metadata JSON, duplicate breakpoints,
content extending below the frame's drawn height (scroll case), `link:*`
extraction (including duplicate targets), freedraw rendering (regression
coverage for the Path2D dependency), `init()` with/without a template, and
`init()` refusing to overwrite an existing file.

## Non-goals

No multi-page site generation, routing, or page listing. No dev server or
file watching. No image optimization beyond whatever `exportToSvg` does
natively. No CSS framework/theming — output is unstyled structural HTML/SVG
save for position/font/color values that come directly from the source
`.excalidraw` file. No responsive-switching logic (media queries, viewport
detection) — this library only extracts each canvas variant's data and its
breakpoint number; deciding when to show which is the consuming site's job.
