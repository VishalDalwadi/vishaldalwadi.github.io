import type { BoundingBox, ExcalidrawElement, ExcalidrawFrameElement } from "./types.js";

export class RearrangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RearrangeError";
  }
}

/** Matches "canvas" (default) or "canvas-{width}" frame names. */
const CANVAS_NAME_RE = /^canvas(?:-(\d+))?$/;

export function isFrame(el: ExcalidrawElement): el is ExcalidrawFrameElement {
  return el.type === "frame";
}

/**
 * Finds the source "canvas" frame (the default/original variant, not a
 * canvas-{width} variant). Throws if not found — this tool assumes it is
 * operating on output that already follows the Project 1 frame convention.
 */
export function findCanvasFrame(
  elements: ExcalidrawElement[],
  filePath: string
): ExcalidrawFrameElement {
  const frames = elements.filter(isFrame);
  const canvas = frames.find((f) => f.name === "canvas");
  if (!canvas) {
    throw new RearrangeError(
      `${filePath}: no "canvas" frame found. This tool requires an input file that already follows the excalidraw-converter frame convention (a frame named exactly "canvas").`
    );
  }
  return canvas;
}

/**
 * Finds the "metadata" frame. This tool never reads/modifies its contents,
 * only verifies it exists and carries it through untouched.
 */
export function findMetadataFrame(
  elements: ExcalidrawElement[],
  filePath: string
): ExcalidrawFrameElement {
  const frames = elements.filter(isFrame);
  const metadata = frames.find((f) => f.name === "metadata");
  if (!metadata) {
    throw new RearrangeError(
      `${filePath}: no "metadata" frame found. This tool requires an input file that already follows the excalidraw-converter frame convention (a frame named "metadata").`
    );
  }
  return metadata;
}

/** Finds all existing canvas-{width} frames, keyed by their numeric width. */
export function findCanvasWidthFrames(
  elements: ExcalidrawElement[]
): Map<number, ExcalidrawFrameElement> {
  const result = new Map<number, ExcalidrawFrameElement>();
  for (const el of elements.filter(isFrame)) {
    const match = el.name ? CANVAS_NAME_RE.exec(el.name) : null;
    if (match && match[1] !== undefined) {
      result.set(Number(match[1]), el);
    }
  }
  return result;
}

/** Returns all elements that are children of the given frame (by frameId). */
export function childrenOf(
  elements: ExcalidrawElement[],
  frame: ExcalidrawFrameElement
): ExcalidrawElement[] {
  return elements.filter((el) => el.frameId === frame.id);
}

/**
 * Content elements = everything except the metadata frame, its children,
 * and frame elements themselves (canvas frame boundary elements). This is
 * the working set the grouping/stacking algorithm operates on.
 */
export function getContentElements(
  elements: ExcalidrawElement[],
  metadataFrame: ExcalidrawFrameElement,
  canvasFrame: ExcalidrawFrameElement
): ExcalidrawElement[] {
  return elements.filter((el) => {
    if (el.isDeleted) return false;
    if (isFrame(el)) return false;
    if (el.id === metadataFrame.id) return false;
    if (el.frameId === metadataFrame.id) return false;
    return el.frameId === canvasFrame.id || isWithinFrameBounds(el, canvasFrame);
  });
}

function isWithinFrameBounds(el: ExcalidrawElement, frame: ExcalidrawFrameElement): boolean {
  return el.x >= frame.x && el.x + el.width <= frame.x + frame.width;
}

export function computeBoundingBox(elements: ExcalidrawElement[]): BoundingBox {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

let idCounter = 0;

/** Generates a new unique element id, distinct from any existing ids. */
export function generateId(prefix = "el"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Creates a new frame element named "canvas-{width}", positioned below the
 * original canvas frame with a margin, per the spec's default placement.
 */
export function createCanvasWidthFrame(
  originalCanvas: ExcalidrawFrameElement,
  targetWidth: number,
  height: number
): ExcalidrawFrameElement {
  return {
    id: generateId("frame"),
    type: "frame",
    name: `canvas-${targetWidth}`,
    x: originalCanvas.x,
    y: originalCanvas.y + originalCanvas.height + 200,
    width: targetWidth,
    height,
    angle: 0,
    isDeleted: false,
  } as ExcalidrawFrameElement;
}
