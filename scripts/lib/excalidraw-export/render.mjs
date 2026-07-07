// Runs the real @excalidraw/excalidraw exporter in headless Chromium (via
// Playwright) to render scenes to SVG. This gets pixel-accurate fidelity
// with the actual Excalidraw app — authentic rough.js hand-drawn strokes,
// real font metrics/text wrapping, curved/elbow arrows, opacity — none of
// which a hand-rolled serializer can reliably replicate.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));

async function bundleEntry() {
  const result = await build({
    entryPoints: [path.join(here, 'entry.mjs')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return result.outputFiles[0].text;
}

/**
 * Creates a renderer backed by one headless page, reused across every scene
 * in a build run. Call `close()` once all scenes are rendered.
 */
export async function createRenderer() {
  const bundle = await bundleEntry();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.__ready === true);

  /**
   * `canvasFrame` (a frame named "canvas" in the scene) fixes the render's
   * bounds — its size is the SVG's viewBox, independent of what else exists,
   * so edits elsewhere never change the apparent scale of existing content.
   *
   * `runs` is the scene's content elements split into maximal consecutive
   * runs by which link frame (if any) owns each element, preserving the
   * scene's original document z-order — see entry.mjs for why this matters.
   * Each run is either `{ kind: 'main', elements }` or
   * `{ kind: 'link', frame, elements, href, ariaLabel, hitAreaEmitted }`.
   */
  async function render({ canvasFrame, runs }) {
    return page.evaluate((arg) => window.__renderScene(arg), { canvasFrame, runs });
  }

  return { render, close: () => browser.close() };
}
