# excalidraw-rearrange

A CLI + library that takes an existing `.excalidraw` file (already following
the `canvas`/`metadata` frame conventions used by
[`excalidraw-converter`](../excalidraw-converter)) and produces a **new**
`canvas-{width}` frame alongside the original, with content regrouped and
stacked to roughly fit a narrower target width — a starting point for a
responsive/mobile variant that you then open in Excalidraw and hand-tweak.

This tool is explicitly a **starting-point generator, not a final-output
renderer**. It saves manual repositioning effort; it does not eliminate
human review. Output quality is "good enough to tweak from," not "publish
as-is."

## Install

Inside this monorepo, the package is wired up via npm workspaces — run
`npm install` at the repo root.

## CLI

```sh
excalidraw-rearrange <input.excalidraw> --width <px> [options]

Options:
  --out <path>                 Output file path (default: overwrite input, i.e. add frame in place)
  --proximity-threshold <px>   Override default proximity grouping threshold
  --min-font-size <px>         Font-size floor during scaling (default: 12)
  --group-gap <px>             Vertical gap between stacked groups (default: 40)
  --force                      Regenerate canvas-{width} frame if one already exists
```

Example:

```sh
npx excalidraw-rearrange pages/posts/my-post.excalidraw --width 400
```

Running this a second time with a different `--width` adds another new
frame alongside the existing ones — it never replaces an existing
`canvas-{width}` frame unless you pass `--force`.

## Library API

```ts
import { rearrange } from "excalidraw-rearrange";

const result = await rearrange({
  filePath: "pages/posts/my-post.excalidraw",
  targetWidth: 400,
  proximityThreshold: undefined, // optional override
  minFontSize: 12,
  groupGap: 40,
  force: false,
});

result.outputElements; // full new element array (original + new frame + new content)
result.report;         // { groupCount, fontFloorGroups, overflowingText, newCanvasHeight }
```

`rearrange()` reads the file and computes the new layout but does not write
to disk — the CLI (and the `rearrangeToFile()` helper) handle persistence.

## Input requirements

- A `canvas` frame — the "source" canvas at its original width. Required;
  throws if missing.
- A `metadata` frame — required to exist, but its contents are never read
  or modified, only carried through to the output untouched.

This tool assumes it is operating on output that already follows the
frame convention defined by `excalidraw-converter` (Project 1). It does not
guess at missing frames — it throws.

## The grouping/stacking algorithm

1. **Build a proximity/connectivity graph.** Arrow/line `startBinding` /
   `endBinding` and text `containerId` create strong edges (always grouped,
   regardless of distance). Remaining elements are proximity-linked if the
   edge-to-edge gap between their bounding boxes is below a threshold
   (default: `min(a.height, b.height) * 0.75`, overridable via
   `--proximity-threshold`). Connected components of this graph become the
   initial groups.
2. **Order groups** by reading order: primarily top-to-bottom (`minY`),
   secondarily left-to-right (`minX`) for groups whose Y ranges are close
   enough to be considered the same "row" (within one group-height of each
   other).
3. **Scale each group to fit the target width.** Groups already narrower
   than the target width are left unscaled. Wider groups are scaled down
   uniformly (position, size, font size, arrow points) by
   `targetWidth / groupWidth`, preserving internal spatial relationships.
   A font-size floor (default 12px, `--min-font-size`) clamps this: if the
   naive scale factor would take any text element below the floor, the
   group is instead scaled down only as far as the floor allows — which
   may leave the group's shapes wider than the target width. This is
   flagged in the CLI summary.
4. **Stack groups vertically**, each starting at
   `previousGroup.bottom + groupGap` (default 40px, `--group-gap`).
   Horizontally, each group is centered within the target width, **unless**
   it was not scaled down and was already left-aligned to the source
   canvas's left edge — in that case its left-alignment is preserved. This
   is a heuristic, not a guarantee: it is a reasonable starting point, not
   a perfect one.

### What it does NOT attempt

- No text reflow/rewrapping — a text element's authored `width` and
  wrapping is preserved as-is. If a text element is still wider than the
  target width after group scaling, it will overflow; this is flagged in
  the CLI summary.
- No re-ordering of elements *within* a group — only inter-group order
  (vertical stacking) changes. Intra-group layout is preserved (scaled,
  not rearranged).
- No image resizing beyond the group's uniform scale factor.
- No dedicated "detect a 3-column layout and collapse it" logic — this
  falls out naturally from the proximity/ordering algorithm: three
  far-enough-apart clusters become three separate groups, stacked
  vertically in left-to-right reading order.

## Multiple target widths

Running the tool twice with different `--width` values against the same
file (default in-place mode, or by passing the previous output as the next
input) adds another new frame each time — it does not replace existing
ones. If a `canvas-{width}` frame for the requested width already exists,
the tool refuses and requires `--force` to regenerate it (the old one is
deleted, a new one is added).

## Error handling

- Missing `canvas` frame → throws.
- Missing `metadata` frame → throws.
- `canvas-{width}` frame already exists for the requested width and
  `--force` is not passed → throws.
- `targetWidth <= 0` or not provided → throws (argument validation).

All thrown errors are instances of `RearrangeError` (exported from the
package) and include the source file path plus a specific description of
what's wrong.

## Non-goals

- No automatic multi-breakpoint generation — one width per invocation.
- No integration into any site build step — this is a standalone
  authoring-time tool, run manually before committing files.
- No visual diffing/preview — review happens by opening the output file in
  the Excalidraw app.

## Development

```sh
npm run build   # compile TypeScript to dist/
npm test        # run the Vitest suite
```

Test fixtures live under `test/fixtures/*.excalidraw` and are small,
hand-authored files exercising each part of the algorithm (proximity
grouping at various distances, arrow-bound elements, container-bound text,
reading order, scaling above/below target width, font-floor clamping,
multi-width idempotency, `--force` behavior).
