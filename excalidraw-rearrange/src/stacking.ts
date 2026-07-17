import type { ExcalidrawElement, ExcalidrawFrameElement } from "./types.js";
import type { ScaledGroup } from "./scaling.js";

export interface StackResult {
  elements: ExcalidrawElement[];
  contentHeight: number;
}

/**
 * Step 4: places scaled groups (already in reading order) stacked
 * vertically within the new canvas-{width} frame, each starting at
 * previousGroup.bottom + groupGap.
 *
 * Horizontal placement: center each group within targetWidth, unless the
 * group was NOT scaled down (already fit) and it was already left-aligned
 * to the source canvas's left edge — in that case, preserve left-alignment
 * as a heuristic that the author's original alignment was intentional.
 *
 * Returns elements repositioned into the new frame's local coordinate
 * space (relative to newFrame.x / newFrame.y), ready to have newFrame.x/y
 * added for final absolute placement.
 */
export function stackGroups(
  scaledGroups: ScaledGroup[],
  targetWidth: number,
  groupGap: number,
  sourceCanvas: ExcalidrawFrameElement,
  leftAlignEdgeTolerance = 8
): StackResult {
  const outElements: ExcalidrawElement[] = [];
  let cursorY = 0;

  for (const sg of scaledGroups) {
    const groupWidth = sg.bbox.width;
    const groupHeight = sg.bbox.height;

    const preserveLeftAlign =
      !sg.wasScaled && Math.abs(sg.group.bbox.minX - sourceCanvas.x) <= leftAlignEdgeTolerance;

    const targetX = preserveLeftAlign ? 0 : Math.max(0, (targetWidth - groupWidth) / 2);
    const targetY = cursorY;

    const dx = targetX - sg.bbox.minX;
    const dy = targetY - sg.bbox.minY;

    for (const el of sg.elements) {
      outElements.push(translateElement(el, dx, dy));
    }

    cursorY = targetY + groupHeight + groupGap;
  }

  // Remove trailing gap after the last group for a tight bounding height.
  const contentHeight =
    scaledGroups.length > 0 ? cursorY - groupGap : 0;

  return { elements: outElements, contentHeight: Math.max(0, contentHeight) };
}

function translateElement(el: ExcalidrawElement, dx: number, dy: number): ExcalidrawElement {
  const translated: ExcalidrawElement = {
    ...el,
    x: el.x + dx,
    y: el.y + dy,
  };
  if (Array.isArray(el.points)) {
    // points are relative offsets from (x, y) in Excalidraw's model, so
    // they do not need translation themselves — only the element origin
    // moves. Kept as-is (already copied via spread).
    translated.points = el.points;
  }
  return translated;
}
