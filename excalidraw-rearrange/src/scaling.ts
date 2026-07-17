import { computeBoundingBox } from "./frames.js";
import type { ElementGroup, ExcalidrawElement, FontFloorGroup, OverflowingText } from "./types.js";

export interface ScaledGroup {
  group: ElementGroup;
  elements: ExcalidrawElement[];
  bbox: ReturnType<typeof computeBoundingBox>;
  scaleFactor: number;
  wasScaled: boolean;
  hitFontFloor: boolean;
}

/**
 * Scales a single group's elements down to fit targetWidth, per Step 3 of
 * the algorithm. If groupWidth <= targetWidth, elements are copied as-is
 * (no scaling). Otherwise all elements' x/y/width/height/fontSize/points
 * are scaled by targetWidth/groupWidth uniformly, unless that would take
 * any text element below minFontSize — in that case the group is clamped
 * to the font floor scale factor instead (may leave it narrower than
 * targetWidth).
 *
 * Positions are computed relative to the group's own bounding box origin
 * (i.e. the group is normalized to start at 0,0) — final placement within
 * the target canvas happens later in stacking.ts.
 */
export function scaleGroup(
  group: ElementGroup,
  targetWidth: number,
  minFontSize: number
): ScaledGroup {
  const originalBbox = group.bbox;
  const groupWidth = originalBbox.width;

  let scaleFactor = 1;
  let wasScaled = false;
  let hitFontFloor = false;

  if (groupWidth > targetWidth && groupWidth > 0) {
    scaleFactor = targetWidth / groupWidth;
    wasScaled = true;

    const textElements = group.elements.filter(
      (el) => typeof el.fontSize === "number" && el.fontSize > 0
    );
    if (textElements.length > 0) {
      const minOriginalFontSize = Math.min(...textElements.map((el) => el.fontSize as number));
      const scaledMinFont = minOriginalFontSize * scaleFactor;
      if (scaledMinFont < minFontSize) {
        // Clamp: use the largest scale factor that keeps the smallest font
        // exactly at the floor.
        scaleFactor = minFontSize / minOriginalFontSize;
        hitFontFloor = true;
      }
    }
  }

  const scaledElements = group.elements.map((el) => scaleElement(el, scaleFactor, originalBbox));

  return {
    group,
    elements: scaledElements,
    bbox: computeBoundingBox(scaledElements),
    scaleFactor,
    wasScaled,
    hitFontFloor,
  };
}

function scaleElement(
  el: ExcalidrawElement,
  factor: number,
  origin: { minX: number; minY: number }
): ExcalidrawElement {
  if (factor === 1) {
    return { ...el };
  }

  const scaled: ExcalidrawElement = {
    ...el,
    x: origin.minX + (el.x - origin.minX) * factor,
    y: origin.minY + (el.y - origin.minY) * factor,
    width: el.width * factor,
    height: el.height * factor,
  };

  if (typeof el.fontSize === "number") {
    scaled.fontSize = el.fontSize * factor;
  }

  if (Array.isArray(el.points)) {
    scaled.points = el.points.map((pt) => [pt[0] * factor, pt[1] * factor]);
  }

  return scaled;
}

/** Builds the report entries for groups that hit the font-size floor. */
export function collectFontFloorGroups(scaledGroups: ScaledGroup[]): FontFloorGroup[] {
  return scaledGroups
    .filter((sg) => sg.hitFontFloor)
    .map((sg) => ({
      groupId: sg.group.id,
      elementIds: sg.elements.map((el) => el.id),
    }));
}

/**
 * Detects text elements that still exceed targetWidth after group scaling
 * (this algorithm never reflows/rewraps text, so a single wide text
 * element can still overflow even after its group was scaled).
 */
export function collectOverflowingText(
  scaledGroups: ScaledGroup[],
  targetWidth: number
): OverflowingText[] {
  const overflowing: OverflowingText[] = [];
  for (const sg of scaledGroups) {
    for (const el of sg.elements) {
      if (el.type === "text" && el.width > targetWidth) {
        const text = typeof el.text === "string" ? el.text : "";
        overflowing.push({
          elementId: el.id,
          textPreview: text.length > 40 ? `${text.slice(0, 40)}...` : text,
        });
      }
    }
  }
  return overflowing;
}
