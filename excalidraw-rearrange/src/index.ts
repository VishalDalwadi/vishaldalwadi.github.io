import { readFile, writeFile } from "node:fs/promises";
import {
  RearrangeError,
  childrenOf,
  computeBoundingBox,
  createCanvasWidthFrame,
  findCanvasFrame,
  findCanvasWidthFrames,
  findMetadataFrame,
  generateId,
  getContentElements,
} from "./frames.js";
import { buildGroups } from "./graph.js";
import { sortReadingOrder } from "./ordering.js";
import { scaleGroup, collectFontFloorGroups, collectOverflowingText } from "./scaling.js";
import { stackGroups } from "./stacking.js";
import type {
  ElementGroup,
  ExcalidrawElement,
  ExcalidrawFile,
  RearrangeOptions,
  RearrangeResult,
} from "./types.js";

export { RearrangeError } from "./frames.js";
export type {
  RearrangeOptions,
  RearrangeResult,
  RearrangeReport,
  FontFloorGroup,
  OverflowingText,
} from "./types.js";

const DEFAULT_MIN_FONT_SIZE = 12;
const DEFAULT_GROUP_GAP = 40;

/**
 * Reads an .excalidraw file already following the canvas/metadata frame
 * convention and produces a new canvas-{width} frame with content
 * regrouped/stacked for a narrower target width. Does not write to disk —
 * callers (e.g. the CLI) decide where/whether to persist outputElements.
 */
export async function rearrange(options: RearrangeOptions): Promise<RearrangeResult> {
  const { filePath, targetWidth } = options;

  if (!targetWidth || targetWidth <= 0) {
    throw new RearrangeError(
      `targetWidth must be a positive number, got: ${String(targetWidth)}`
    );
  }

  const minFontSize = options.minFontSize ?? DEFAULT_MIN_FONT_SIZE;
  const groupGap = options.groupGap ?? DEFAULT_GROUP_GAP;
  const force = options.force ?? false;

  const raw = await readFile(filePath, "utf-8");
  let file: ExcalidrawFile;
  try {
    file = JSON.parse(raw) as ExcalidrawFile;
  } catch (err) {
    throw new RearrangeError(
      `${filePath}: failed to parse as JSON — ${(err as Error).message}`
    );
  }

  const elements = file.elements ?? [];

  return rearrangeElements(elements, { ...options, minFontSize, groupGap, force }, filePath);
}

/** Core logic split out so it can be tested against in-memory element arrays too. */
export function rearrangeElements(
  elements: ExcalidrawElement[],
  options: RearrangeOptions,
  filePathForErrors = "<in-memory>"
): RearrangeResult {
  const { targetWidth } = options;
  if (!targetWidth || targetWidth <= 0) {
    throw new RearrangeError(
      `targetWidth must be a positive number, got: ${String(targetWidth)}`
    );
  }

  const minFontSize = options.minFontSize ?? DEFAULT_MIN_FONT_SIZE;
  const groupGap = options.groupGap ?? DEFAULT_GROUP_GAP;
  const force = options.force ?? false;

  const canvasFrame = findCanvasFrame(elements, filePathForErrors);
  const metadataFrame = findMetadataFrame(elements, filePathForErrors);

  const existingWidthFrames = findCanvasWidthFrames(elements);
  let workingElements = elements;

  if (existingWidthFrames.has(targetWidth)) {
    if (!force) {
      throw new RearrangeError(
        `${filePathForErrors}: a "canvas-${targetWidth}" frame already exists. Pass --force to regenerate it, or pick a different --width.`
      );
    }
    const staleFrame = existingWidthFrames.get(targetWidth)!;
    const staleChildren = new Set(
      childrenOf(elements, staleFrame).map((el) => el.id)
    );
    workingElements = elements.filter(
      (el) => el.id !== staleFrame.id && !staleChildren.has(el.id)
    );
  }

  const contentElements = getContentElements(workingElements, metadataFrame, canvasFrame);

  const groups: ElementGroup[] = buildGroups(contentElements, options.proximityThreshold);
  const orderedGroups = sortReadingOrder(groups);

  const scaledGroups = orderedGroups.map((g) => scaleGroup(g, targetWidth, minFontSize));

  const { elements: stackedElements, contentHeight } = stackGroups(
    scaledGroups,
    targetWidth,
    groupGap,
    canvasFrame
  );

  // Assign new ids to every copied element, and remap internal bindings
  // (startBinding/endBinding/containerId) to point at the new copies
  // instead of the originals, so the new frame's arrows/labels stay
  // correctly wired to their new counterparts rather than the old layout.
  const idMap = new Map<string, string>();
  for (const el of stackedElements) {
    idMap.set(el.id, generateId("el"));
  }

  const newFrameId = generateId("frame");

  const remappedElements: ExcalidrawElement[] = stackedElements.map((el) => {
    const newId = idMap.get(el.id)!;
    const remapped: ExcalidrawElement = { ...el, id: newId, frameId: newFrameId };

    if (el.startBinding?.elementId && idMap.has(el.startBinding.elementId)) {
      remapped.startBinding = {
        ...el.startBinding,
        elementId: idMap.get(el.startBinding.elementId)!,
      };
    }
    if (el.endBinding?.elementId && idMap.has(el.endBinding.elementId)) {
      remapped.endBinding = {
        ...el.endBinding,
        elementId: idMap.get(el.endBinding.elementId)!,
      };
    }
    if (el.containerId && idMap.has(el.containerId)) {
      remapped.containerId = idMap.get(el.containerId)!;
    }

    return remapped;
  });

  const newCanvasHeight = contentHeight;

  const newFrame = createCanvasWidthFrame(canvasFrame, targetWidth, newCanvasHeight);
  newFrame.id = newFrameId;

  // Final absolute placement: elements were positioned relative to (0,0)
  // of the new frame's local space in stacking.ts, so add the frame's
  // origin to get absolute canvas coordinates.
  const finalElements = remappedElements.map((el) => ({
    ...el,
    x: el.x + newFrame.x,
    y: el.y + newFrame.y,
  }));

  const outputElements = [...workingElements, newFrame, ...finalElements];

  const fontFloorGroups = collectFontFloorGroups(scaledGroups);
  const overflowingText = collectOverflowingText(scaledGroups, targetWidth);

  return {
    outputElements,
    report: {
      groupCount: groups.length,
      fontFloorGroups,
      overflowingText,
      newCanvasHeight,
    },
  };
}

/** Convenience helper for the CLI: runs rearrange() and writes the result to disk. */
export async function rearrangeToFile(
  options: RearrangeOptions,
  outPath: string
): Promise<RearrangeResult> {
  const raw = await readFile(options.filePath, "utf-8");
  const file = JSON.parse(raw) as ExcalidrawFile;

  const result = rearrangeElements(file.elements ?? [], options, options.filePath);

  const outFile: ExcalidrawFile = {
    ...file,
    elements: result.outputElements,
  };

  await writeFile(outPath, JSON.stringify(outFile, null, 2), "utf-8");

  return result;
}

// Re-export computeBoundingBox for convenience/testing.
export { computeBoundingBox };
