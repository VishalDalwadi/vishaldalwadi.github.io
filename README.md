# vishaldalwadi.github.io

paperplanes.cloud — a blog authored entirely in Excalidraw. See `FULL-SPEC.md`
for the full architecture (three npm-workspace projects: `excalidraw-converter`,
`excalidraw-rearrange`, and this site generator).

## Writing a post

```
npm run new-post -- my-post-slug.excalidraw
```

This scaffolds `pages/posts/my-post-slug.excalidraw` from `pages/templates/base.excalidraw`.
Open it in the [Excalidraw app](https://excalidraw.com), draw the post, fill
in the `metadata` frame's JSON (title/slug/custom.date/custom.tags), save the
export back over that file, then:

```
npm run dev     # preview locally with live-reload
npm run build   # build the static site to dist/
```

## Frame conventions

- `metadata` — a frame containing one text element with JSON:
  `{ "title", "slug", "custom": { "type": "home" | "post" | "page", "date", "tags", "description" } }`.
- `canvas` / `canvas-{width}` — one or more frames defining the page's
  rendered content and responsive variants.
- `link:{target}` — wraps content that should be clickable. `target` is one
  of `home`, `post/<slug>`, a bare `<slug>` (for `page`-type pages), or a
  full `https://` URL.
