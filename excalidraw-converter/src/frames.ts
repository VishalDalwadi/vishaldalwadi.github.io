import type { RawExcalidrawElement } from "./types.js";
import {
  DuplicateBreakpointError,
  InvalidMetadataError,
  MissingCanvasFrameError,
  MissingMetadataFrameError,
} from "./errors.js";

export interface CanvasFrameInfo {
  frame: RawExcalidrawElement;
  breakpoint: number | null;
  width: number;
}

export interface LinkFrameInfo {
  frame: RawExcalidrawElement;
  target: string;
}

const CANVAS_DEFAULT_RE = /^canvas$/;
const CANVAS_WIDTH_RE = /^canvas-(\d+)$/;
const LINK_RE = /^link:(.+)$/;

function nonDeletedFrames(elements: RawExcalidrawElement[]): RawExcalidrawElement[] {
  return elements.filter((el) => el.type === "frame" && !el.isDeleted);
}

/** Find the single "metadata" frame, throwing a descriptive error if absent. */
export function findMetadataFrame(
  elements: RawExcalidrawElement[],
  filePath: string
): RawExcalidrawElement {
  const metadataFrame = nonDeletedFrames(elements).find((f) => f.name === "metadata");
  if (!metadataFrame) {
    throw new MissingMetadataFrameError(filePath);
  }
  return metadataFrame;
}

/**
 * Parse and validate the metadata frame's single JSON text-element child.
 * Throws InvalidMetadataError on any structural problem (missing/multiple
 * text children, invalid JSON, missing required fields).
 */
export function parseMetadataFrame(
  elements: RawExcalidrawElement[],
  metadataFrame: RawExcalidrawElement,
  filePath: string
): { title: string; slug: string; template?: string; custom?: Record<string, unknown> } {
  const children = elements.filter(
    (el) => el.type === "text" && !el.isDeleted && el.frameId === metadataFrame.id
  );

  if (children.length === 0) {
    throw new InvalidMetadataError(filePath, 'the "metadata" frame contains no text element.');
  }
  if (children.length > 1) {
    throw new InvalidMetadataError(
      filePath,
      `the "metadata" frame must contain exactly one text element, found ${children.length}.`
    );
  }

  const raw = children[0].text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InvalidMetadataError(
      filePath,
      `metadata text element does not contain valid JSON (${(err as Error).message}).`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InvalidMetadataError(filePath, "metadata JSON must be an object.");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.title !== "string" || obj.title.length === 0) {
    throw new InvalidMetadataError(filePath, 'metadata is missing required field "title" (string).');
  }
  if (typeof obj.slug !== "string" || obj.slug.length === 0) {
    throw new InvalidMetadataError(filePath, 'metadata is missing required field "slug" (string).');
  }
  if (obj.template !== undefined && typeof obj.template !== "string") {
    throw new InvalidMetadataError(filePath, 'metadata field "template" must be a string when present.');
  }
  if (obj.custom !== undefined && (typeof obj.custom !== "object" || obj.custom === null || Array.isArray(obj.custom))) {
    throw new InvalidMetadataError(filePath, 'metadata field "custom" must be an object when present.');
  }

  return {
    title: obj.title,
    slug: obj.slug,
    template: obj.template as string | undefined,
    custom: obj.custom as Record<string, unknown> | undefined,
  };
}

/**
 * Find all canvas frames ("canvas" or "canvas-{width}"), resolve their
 * breakpoints, and validate there are no duplicate breakpoints. Throws if
 * none are found, or if two frames resolve to the same breakpoint.
 */
export function findCanvasFrames(
  elements: RawExcalidrawElement[],
  filePath: string
): CanvasFrameInfo[] {
  const candidates = nonDeletedFrames(elements).filter(
    (f) => typeof f.name === "string" && (CANVAS_DEFAULT_RE.test(f.name) || CANVAS_WIDTH_RE.test(f.name))
  );

  if (candidates.length === 0) {
    throw new MissingCanvasFrameError(filePath);
  }

  const infos: CanvasFrameInfo[] = candidates.map((frame) => {
    const name = frame.name as string;
    if (CANVAS_DEFAULT_RE.test(name)) {
      return { frame, breakpoint: null, width: frame.width };
    }
    const match = name.match(CANVAS_WIDTH_RE)!;
    const namedWidth = Number(match[1]);
    if (namedWidth !== frame.width) {
      console.warn(
        `[${filePath}] frame "${frame.id}" named "${name}" declares width ${namedWidth} but its actual drawn width is ${frame.width}; using the actual drawn width.`
      );
    }
    return { frame, breakpoint: namedWidth, width: frame.width };
  });

  const seen = new Map<string, CanvasFrameInfo>();
  for (const info of infos) {
    const key = info.breakpoint === null ? "default" : String(info.breakpoint);
    const existing = seen.get(key);
    if (existing) {
      const label = info.breakpoint === null ? "canvas (default)" : `canvas-${info.breakpoint}`;
      throw new DuplicateBreakpointError(filePath, label, existing.frame.id, info.frame.id);
    }
    seen.set(key, info);
  }

  return infos;
}

/** Find all "link:{target}" frames. */
export function findLinkFrames(elements: RawExcalidrawElement[]): LinkFrameInfo[] {
  return nonDeletedFrames(elements)
    .map((frame) => {
      const match = typeof frame.name === "string" ? frame.name.match(LINK_RE) : null;
      return match ? { frame, target: match[1] } : null;
    })
    .filter((x): x is LinkFrameInfo => x !== null);
}

/**
 * Whether an element (by its horizontal center) belongs to the given canvas
 * frame's horizontal (x) bounds. Per spec, only the x-range determines
 * variant membership — this lets content extend arbitrarily below a
 * frame's drawn height (the scroll case) without being excluded.
 */
export function isWithinCanvasBounds(
  element: RawExcalidrawElement,
  canvasFrame: RawExcalidrawElement
): boolean {
  const centerX = element.x + element.width / 2;
  return centerX >= canvasFrame.x && centerX <= canvasFrame.x + canvasFrame.width;
}

/** Whether a frame's own bounding box falls within a canvas variant's horizontal bounds (by center point), used to scope link frames per-variant. */
export function isFrameWithinCanvasBounds(
  frame: RawExcalidrawElement,
  canvasFrame: RawExcalidrawElement
): boolean {
  return isWithinCanvasBounds(frame, canvasFrame);
}
