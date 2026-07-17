import { describe, expect, it } from "vitest";
import { buildGroups } from "../src/graph.js";
import type { ExcalidrawElement } from "../src/types.js";

function rect(id: string, x: number, y: number, width = 100, height = 60): ExcalidrawElement {
  return { id, type: "rectangle", x, y, width, height };
}

describe("buildGroups - proximity", () => {
  it("groups two close elements together", () => {
    const a = rect("a", 0, 0, 100, 100);
    const b = rect("b", 110, 0, 100, 100); // gap = 10, threshold = 100*0.75 = 75
    const groups = buildGroups([a, b]);
    expect(groups.length).toBe(1);
    expect(groups[0].elements.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("does not group two far elements", () => {
    const a = rect("a", 0, 0, 100, 100);
    const b = rect("b", 500, 0, 100, 100); // gap = 400, threshold = 75
    const groups = buildGroups([a, b]);
    expect(groups.length).toBe(2);
  });

  it("respects an explicit proximity threshold override", () => {
    const a = rect("a", 0, 0, 100, 100);
    const b = rect("b", 150, 0, 100, 100); // gap = 50
    expect(buildGroups([a, b], 40).length).toBe(2); // 50 > 40 -> not grouped
    expect(buildGroups([a, b], 60).length).toBe(1); // 50 < 60 -> grouped
  });
});

describe("buildGroups - arrow bindings", () => {
  it("groups arrow-bound elements regardless of distance", () => {
    const a = rect("a", 0, 0, 50, 50);
    const b = rect("b", 2000, 0, 50, 50); // far apart, way beyond proximity threshold
    const arrow: ExcalidrawElement = {
      id: "arrow",
      type: "arrow",
      x: 50,
      y: 25,
      width: 1950,
      height: 1,
      startBinding: { elementId: "a" },
      endBinding: { elementId: "b" },
    };
    const groups = buildGroups([a, b, arrow]);
    expect(groups.length).toBe(1);
    expect(groups[0].elements.map((e) => e.id).sort()).toEqual(["a", "arrow", "b"]);
  });
});

describe("buildGroups - container binding", () => {
  it("groups container-bound text with its container regardless of distance", () => {
    const container = rect("container", 0, 0, 50, 50);
    const text: ExcalidrawElement = {
      id: "text",
      type: "text",
      x: 10,
      y: 10,
      width: 30,
      height: 20,
      containerId: "container",
    };
    const farAway = rect("far", 5000, 5000, 50, 50);
    const groups = buildGroups([container, text, farAway]);
    expect(groups.length).toBe(2);
    const containerGroup = groups.find((g) => g.elements.some((e) => e.id === "container"))!;
    expect(containerGroup.elements.map((e) => e.id).sort()).toEqual(["container", "text"]);
  });
});
