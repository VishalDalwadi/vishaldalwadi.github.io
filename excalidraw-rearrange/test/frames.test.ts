import { describe, expect, it } from "vitest";
import {
  RearrangeError,
  findCanvasFrame,
  findCanvasWidthFrames,
  findMetadataFrame,
} from "../src/frames.js";
import type { ExcalidrawElement } from "../src/types.js";

describe("findCanvasFrame", () => {
  it("throws a descriptive error when no canvas frame exists", () => {
    const elements: ExcalidrawElement[] = [
      { id: "m", type: "frame", name: "metadata", x: 0, y: 0, width: 100, height: 100 },
    ];
    expect(() => findCanvasFrame(elements, "test.excalidraw")).toThrow(RearrangeError);
    expect(() => findCanvasFrame(elements, "test.excalidraw")).toThrow(/test\.excalidraw/);
  });

  it("finds the canvas frame by exact name", () => {
    const elements: ExcalidrawElement[] = [
      { id: "c", type: "frame", name: "canvas", x: 0, y: 0, width: 800, height: 400 },
      { id: "c400", type: "frame", name: "canvas-400", x: 0, y: 700, width: 400, height: 400 },
    ];
    const frame = findCanvasFrame(elements, "test.excalidraw");
    expect(frame.id).toBe("c");
  });
});

describe("findMetadataFrame", () => {
  it("throws when no metadata frame exists", () => {
    const elements: ExcalidrawElement[] = [
      { id: "c", type: "frame", name: "canvas", x: 0, y: 0, width: 800, height: 400 },
    ];
    expect(() => findMetadataFrame(elements, "test.excalidraw")).toThrow(RearrangeError);
  });
});

describe("findCanvasWidthFrames", () => {
  it("maps canvas-{width} frames by numeric width", () => {
    const elements: ExcalidrawElement[] = [
      { id: "c", type: "frame", name: "canvas", x: 0, y: 0, width: 800, height: 400 },
      { id: "c400", type: "frame", name: "canvas-400", x: 0, y: 700, width: 400, height: 400 },
      { id: "c1200", type: "frame", name: "canvas-1200", x: 0, y: 1200, width: 1200, height: 400 },
    ];
    const map = findCanvasWidthFrames(elements);
    expect(map.size).toBe(2);
    expect(map.get(400)?.id).toBe("c400");
    expect(map.get(1200)?.id).toBe("c1200");
  });
});
