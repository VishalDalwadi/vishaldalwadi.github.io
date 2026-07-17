import { describe, expect, it } from "vitest";
import { stackGroups } from "../src/stacking.js";
import { scaleGroup } from "../src/scaling.js";
import { computeBoundingBox } from "../src/frames.js";
import type { ElementGroup, ExcalidrawElement, ExcalidrawFrameElement } from "../src/types.js";

function group(elements: ExcalidrawElement[]): ElementGroup {
  return { id: Math.random().toString(36), elements, bbox: computeBoundingBox(elements) };
}

const sourceCanvas: ExcalidrawFrameElement = {
  id: "canvas",
  type: "frame",
  name: "canvas",
  x: 0,
  y: 0,
  width: 800,
  height: 400,
};

describe("stackGroups", () => {
  it("places groups with the correct gap and cumulative Y", () => {
    const g1 = group([{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50 }]);
    const g2 = group([{ id: "b", type: "rectangle", x: 0, y: 0, width: 100, height: 80 }]);

    const s1 = scaleGroup(g1, 300, 12);
    const s2 = scaleGroup(g2, 300, 12);

    const { elements, contentHeight } = stackGroups([s1, s2], 300, 40, sourceCanvas);

    const elA = elements.find((e) => e.id === "a")!;
    const elB = elements.find((e) => e.id === "b")!;

    expect(elA.y).toBeCloseTo(0);
    // Second group starts at first group's bottom (50) + gap (40) = 90.
    expect(elB.y).toBeCloseTo(90);
    // Total height = 90 + 80 = 170 (no trailing gap).
    expect(contentHeight).toBeCloseTo(170);
  });

  it("centers a group that was scaled down", () => {
    const g1 = group([{ id: "a", type: "rectangle", x: 0, y: 0, width: 600, height: 100 }]);
    const s1 = scaleGroup(g1, 300, 12);
    const { elements } = stackGroups([s1], 300, 40, sourceCanvas);
    const elA = elements.find((e) => e.id === "a")!;
    // Scaled width = 300, centered in targetWidth 300 -> x = 0.
    expect(elA.x).toBeCloseTo(0);
  });

  it("preserves left alignment for an unscaled group already at the source canvas edge", () => {
    const g1 = group([{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50 }]);
    const s1 = scaleGroup(g1, 300, 12);
    const { elements } = stackGroups([s1], 300, 40, sourceCanvas);
    const elA = elements.find((e) => e.id === "a")!;
    expect(elA.x).toBeCloseTo(0);
  });
});
