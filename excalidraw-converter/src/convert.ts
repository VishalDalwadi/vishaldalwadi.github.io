import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { Path2D } from "path2d";
import type {
  CanvasVariant,
  ConvertResult,
  LinkOverlay,
  RawExcalidrawElement,
  RawExcalidrawFile,
  TextOverlayElement,
} from "./types.js";
import {
  findCanvasFrames,
  findLinkFrames,
  findMetadataFrame,
  isFrameWithinCanvasBounds,
  isWithinCanvasBounds,
  parseMetadataFrame,
} from "./frames.js";
import { resolveFontFamily } from "./fontMap.js";
import { ExcalidrawConvertError } from "./errors.js";

let domReady = false;

/**
 * Installs a minimal jsdom-backed DOM shim into the Node global scope so
 * `@excalidraw/excalidraw`'s `exportToSvg` (which only constructs SVG DOM
 * nodes, never mounts React or touches a real browser window) can run
 * headless. Idempotent — safe to call before every conversion.
 */
function ensureDom(): void {
  if (domReady) return;
  // Our getContext() shim below deliberately calls jsdom's real
  // getContext("2d") first (falling back to a stub only when it returns
  // null), which makes jsdom log a "Not implemented: HTMLCanvasElement
  // .prototype.getContext" error to the console by default on every call.
  // That's expected/harmless here (we never touch the returned context for
  // actual pixels), so use a virtual console that doesn't forward jsdom's
  // internal diagnostic errors to the real console, to keep CLI/library
  // output free of misleading noise.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {
    // Swallow expected "not implemented" diagnostics (e.g. canvas 2D
    // context) triggered by feature-detection code in
    // @excalidraw/excalidraw's bundle that isn't exercised by exportToSvg.
  });
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    virtualConsole,
  });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window as unknown;
  g.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  g.SVGSVGElement = dom.window.SVGSVGElement;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.DOMParser = dom.window.DOMParser;
  g.Node = dom.window.Node;
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  g.devicePixelRatio = 1;
  // jsdom has no native Canvas 2D context, so it doesn't provide the Path2D
  // constructor either. roughjs uses Path2D directly (not just via a canvas
  // context) when generating freedraw/curved stroke geometry.
  g.Path2D = Path2D;

  // jsdom doesn't implement a real canvas rendering context (that requires
  // the optional native `canvas` package), so `HTMLCanvasElement#getContext`
  // returns null. `@excalidraw/excalidraw`'s bundle ships all of its UI
  // (including components never touched by the headless `exportToSvg` path,
  // like the image-export dialog) in one module graph, and one of those
  // modules does `"filter" in document.createElement("canvas").getContext("2d")`
  // as a top-level side effect at import time. With a null context that
  // throws `TypeError: Cannot use 'in' operator to search for 'filter' in
  // null` before exportToSvg ever runs. exportToSvg itself builds SVG via
  // roughjs's SVG generator, not canvas rasterization, so a minimal stub
  // context (never actually used for pixels) is sufficient to satisfy this
  // feature-detection check and let the module load.
  const canvasProto = dom.window.HTMLCanvasElement.prototype as unknown as {
    getContext: (contextId: string, ...args: unknown[]) => unknown;
  };
  const originalGetContext = canvasProto.getContext;
  canvasProto.getContext = function (this: unknown, contextId: string, ...args: unknown[]) {
    const ctx = originalGetContext.call(this, contextId, ...args);
    if (ctx) return ctx;
    if (contextId === "2d") {
      return new Proxy(
        {},
        {
          get: () => () => undefined,
        }
      );
    }
    return ctx;
  };

  domReady = true;
}

/** Escape text for safe embedding in HTML. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isDeletedOrFrame(el: RawExcalidrawElement): boolean {
  return Boolean(el.isDeleted) || el.type === "frame";
}

async function renderVariantSvg(
  contentElements: RawExcalidrawElement[],
  width: number,
  height: number,
  files: Record<string, unknown> | undefined
): Promise<string> {
  ensureDom();
  const { exportToSvg } = await import("@excalidraw/excalidraw");

  // Anchor element pinning the coordinate origin at (0,0) and the minimum
  // width at `width`, so exportToSvg's automatic tight-bbox normalization
  // doesn't shift content relative to the frame-relative coordinates we
  // compute independently for the HTML text overlay. It's fully transparent
  // and contributes nothing visually, only to the bounding box.
  const anchor: RawExcalidrawElement = {
    id: "__excalidraw_converter_anchor__",
    type: "rectangle",
    x: 0,
    y: 0,
    width,
    height: 1,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roundness: null,
    roughness: 0,
    opacity: 0,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 0,
    link: null,
    locked: true,
  };

  const elementsForExport = [anchor, ...contentElements];

  const svgElement = await exportToSvg({
    elements: elementsForExport as never,
    appState: {
      exportBackground: false,
      viewBackgroundColor: "transparent",
    } as never,
    files: (files as never) ?? null,
    exportPadding: 0,
  });

  svgElement.setAttribute("width", String(width));
  svgElement.setAttribute("height", String(height));
  svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);

  return svgElement.outerHTML;
}

function buildHtml(width: number, svg: string, links: LinkOverlay[], textElements: TextOverlayElement[]): string {
  const linksHtml = links
    .map(
      (link) =>
        `      <a href="${escapeHtml(link.target)}" style="position:absolute; left:${link.x}px; top:${link.y}px; width:${link.width}px; height:${link.height}px; display:block; z-index:1;"></a>`
    )
    .join("\n");

  const textHtml = textElements
    .map((t) => {
      // font-family values contain literal double quotes (e.g. `"Excalifont",
      // "Virgil", cursive`), which would otherwise prematurely close this
      // double-quoted style attribute and silently truncate everything after
      // it — escape the whole style value, not just the text content.
      // pointer-events:none so a link's own label text never blocks clicks
      // on the (lower-z-index) link hit-area beneath it.
      const style = `position:absolute; left:${t.x}px; top:${t.y}px; width:${t.width}px; font-size:${t.fontSize}px; font-family:${t.fontFamily}; color:${t.color}; text-align:${t.textAlign}; transform: rotate(${t.angle}rad); z-index:2; pointer-events:none;`;
      return `      <div style="${escapeHtml(style)}">${escapeHtml(t.text)}</div>`;
    })
    .join("\n");

  return `<div class="excalidraw-page" style="position:relative; width:${width}px;">
  <div class="excalidraw-bg" style="position:absolute; top:0; left:0;">${svg}</div>
  <div class="excalidraw-links-layer" style="position:relative;">
${linksHtml}
  </div>
  <div class="excalidraw-text-layer" style="position:relative;">
${textHtml}
  </div>
</div>`;
}

/**
 * Convert a single .excalidraw file into one CanvasVariant per canvas frame
 * found, plus the page-level metadata parsed from its "metadata" frame.
 */
export async function convertPage(filePath: string): Promise<ConvertResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new ExcalidrawConvertError(filePath, `could not read file: ${(err as Error).message}`);
  }

  let file: RawExcalidrawFile;
  try {
    file = JSON.parse(raw);
  } catch (err) {
    throw new ExcalidrawConvertError(filePath, `file is not valid JSON: ${(err as Error).message}`);
  }

  const elements = (file.elements ?? []).filter((el) => !el.isDeleted);

  const metadataFrame = findMetadataFrame(elements, filePath);
  const metadata = parseMetadataFrame(elements, metadataFrame, filePath);

  const metadataChildIds = new Set(
    elements.filter((el) => el.frameId === metadataFrame.id).map((el) => el.id)
  );

  const canvasFrames = findCanvasFrames(elements, filePath);
  const linkFrames = findLinkFrames(elements);

  // Exclude the metadata frame itself, its children, and all frame elements
  // (canvas/link/metadata frames are structural, never rendered as content).
  const renderableElements = elements.filter(
    (el) => el.id !== metadataFrame.id && !metadataChildIds.has(el.id) && !isDeletedOrFrame(el)
  );

  const variants: CanvasVariant[] = [];

  for (const { frame: canvasFrame, breakpoint, width } of canvasFrames) {
    const scoped = renderableElements.filter((el) => isWithinCanvasBounds(el, canvasFrame));

    const textSource = scoped.filter((el) => el.type === "text");
    const nonTextSource = scoped.filter((el) => el.type !== "text");

    const shiftedNonText = nonTextSource.map((el) => ({
      ...el,
      x: el.x - canvasFrame.x,
      y: el.y - canvasFrame.y,
    }));

    const textElements: TextOverlayElement[] = textSource.map((el) => ({
      id: el.id,
      text: el.text ?? "",
      x: el.x - canvasFrame.x,
      y: el.y - canvasFrame.y,
      width: el.width,
      height: el.height,
      fontSize: el.fontSize ?? 20,
      fontFamily: resolveFontFamily(el.fontFamily),
      color: el.strokeColor ?? "#000000",
      textAlign: el.textAlign ?? "left",
      angle: el.angle ?? 0,
    }));

    const scopedLinkFrames = linkFrames.filter((lf) => isFrameWithinCanvasBounds(lf.frame, canvasFrame));
    const links: LinkOverlay[] = scopedLinkFrames.map((lf) => ({
      id: lf.frame.id,
      target: lf.target,
      x: lf.frame.x - canvasFrame.x,
      y: lf.frame.y - canvasFrame.y,
      width: lf.frame.width,
      height: lf.frame.height,
    }));

    const contentBottom = scoped.reduce((max, el) => Math.max(max, el.y - canvasFrame.y + el.height), 0);
    const height = Math.max(0, contentBottom);

    const svg = await renderVariantSvg(shiftedNonText, width, height, file.files as never);
    const html = buildHtml(width, svg, links, textElements);

    variants.push({ breakpoint, width, height, svg, textElements, links, html });
  }

  variants.sort((a, b) => {
    if (a.breakpoint === null) return 1;
    if (b.breakpoint === null) return -1;
    return a.breakpoint - b.breakpoint;
  });

  return { metadata, variants };
}
