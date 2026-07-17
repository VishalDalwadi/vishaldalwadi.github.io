// Bundles src/index.ts and src/cli.ts into fully self-contained ESM output
// under dist/, inlining @excalidraw/excalidraw, roughjs, open-color, etc.
//
// Plain `tsc` output isn't enough here: @excalidraw/excalidraw's published
// "production" build relies on bundler-only module resolution (an
// extensionless deep import into `roughjs/bin/rough`, and a JSON import of
// `open-color/open-color.json` without an import attribute) that plain
// Node ESM `import` rejects at runtime. esbuild resolves and inlines all of
// that at build time, so the emitted dist/*.js files run standalone under
// plain `node` with no bundler-specific resolution behavior required.
//
// Type declarations are emitted separately via `tsc --emitDeclarationOnly`
// (see the "build" script in package.json), since esbuild doesn't generate
// .d.ts files.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts", "src/cli.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: true,
  loader: { ".json": "json" },
  // jsdom resolves some of its own internals (e.g. the XHR sync worker) via
  // `require.resolve()` calls relative to its own package directory at
  // runtime. Bundling it breaks that resolution, since the code ends up
  // living inside dist/ instead of node_modules/jsdom/. jsdom itself is a
  // normally-published, plain-Node-resolvable package (unlike
  // @excalidraw/excalidraw's bundler-only deep imports), so there's no
  // reason to inline it anyway — leave it as a real runtime dependency.
  external: ["jsdom"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
