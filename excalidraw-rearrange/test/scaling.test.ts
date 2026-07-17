import { describe, expect, it } from "vitest";
import { scaleGroup } from "../src/scaling.js";
import { computeBoundingBox } from "../src/frames.js";
import type { ElementGroup, ExcalidrawElement } from "../src/types.js";

function group(elements: ExcalidrawElement[]): ElementGroup {
  return { id: "g", elements, bbox: computeBoundingBox(elements) };
}

describe("scaleGroup", () => {
  it("leaves a group narrower than target width unscaled", () => {
    const rect: ExcalidrawElement = { id: "r", type: "rectangle", x: 0, y: 0, width: 100, height: 100 };
    const g = group([rect]);
    const result = scaleGroup(g, 300, 12);
    expect(result.wasScaled).toBe(false);
    expect(result.scaleFactor).toBe(1);
    expect(result.elements[0].width).toBe(100);
  });

  it("scales a group wider than target width by the correct factor", () => {
    const rect: ExcalidrawElement = { id: "r", type: "rectangle", x: 0, y: 0, width: 600, height: 100 };
    const text: ExcalidrawElement = {
      id: "t",
      type: "text",
      x: 250,
      y: 30,
      width: 100,
      height: 50,
      fontSize: 40,
      containerId: "r",
    };
    const g = group([rect, text]);
    const result = scaleGroup(g, 300, 12);
    expect(result.wasScaled).toBe(true);
    expect(result.hitFontFloor).toBe(false);
    expect(result.scaleFactor).toBeCloseTo(0.5);
    const scaledRect = result.elements.find((e) => e.id === "r")!;
    expect(scaledRect.width).toBeCloseTo(300);
    const scaledText = result.elements.find((e) => e.id === "t")!;
    expect(scaledText.fontSize).toBeCloseTo(20);
  });

  it("clamps scaling to the font floor and flags it", () => {
    const rect: ExcalidrawElement = { id: "r", type: "rectangle", x: 0, y: 0, width: 600, height: 100 };
    const text: ExcalidrawElement = {
      id: "t",
      type: "text",
      x: 250,
      y: 30,
      width: 100,
      height: 50,
      fontSize: 20,
      containerId: "r",
    };
    const g = group([rect, text]);
    // Naive scale factor would be 300/600 = 0.5 -> fontSize 10, below floor 12.
    const result = scaleGroup(g, 300, 12);
    expect(result.wasScaled).toBe(true);
    expect(result.hitFontFloor).toBe(true);
    // Clamped factor = 12/20 = 0.6, wider than the naive 0.5 factor.
    expect(result.scaleFactor).toBeCloseTo(0.6);
    const scaledText = result.elements.find((e) => e.id === "t")!;
    expect(scaledText.fontSize).toBeCloseTo(12);
    const scaledRect = result.elements.find((e) => e.id === "r")!;
    // Clamped factor (0.6) is looser than the naive fit factor (0.5), so
    // the group ends up at 600*0.6=360px, wider than targetWidth (300) --
    // confirms the group may overflow the target width slightly when the
    // font floor is hit, per spec.
    expect(scaledRect.width).toBeCloseTo(360);
  });
});
