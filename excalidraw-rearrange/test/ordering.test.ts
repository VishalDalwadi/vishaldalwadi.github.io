import { describe, expect, it } from "vitest";
import { sortReadingOrder } from "../src/ordering.js";
import { computeBoundingBox } from "../src/frames.js";
import type { ElementGroup, ExcalidrawElement } from "../src/types.js";

function group(id: string, elements: ExcalidrawElement[]): ElementGroup {
  return { id, elements, bbox: computeBoundingBox(elements) };
}

function rect(id: string, x: number, y: number, width = 100, height = 100): ExcalidrawElement {
  return { id, type: "rectangle", x, y, width, height };
}

describe("sortReadingOrder", () => {
  it("sorts groups at different Y top-to-bottom", () => {
    const bottom = group("bottom", [rect("b", 0, 500, 100, 50)]);
    const top = group("top", [rect("t", 0, 0, 100, 50)]);
    const sorted = sortReadingOrder([bottom, top]);
    expect(sorted.map((g) => g.id)).toEqual(["top", "bottom"]);
  });

  it("sorts groups at the same Y, different X, left-to-right", () => {
    const right = group("right", [rect("r", 500, 0, 100, 100)]);
    const left = group("left", [rect("l", 0, 0, 100, 100)]);
    const sorted = sortReadingOrder([right, left]);
    expect(sorted.map((g) => g.id)).toEqual(["left", "right"]);
  });

  it("treats groups within one group-height of Y as the same row", () => {
    const a = group("a", [rect("a", 0, 0, 100, 100)]);
    const b = group("b", [rect("b", 400, 30, 100, 100)]); // minY diff = 30 < height 100
    const sorted = sortReadingOrder([b, a]);
    expect(sorted.map((g) => g.id)).toEqual(["a", "b"]);
  });
});
