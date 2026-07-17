import { mkdtemp, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rearrange, rearrangeToFile, RearrangeError } from "../src/index.js";
import { findCanvasFrame, findCanvasWidthFrames, findMetadataFrame } from "../src/frames.js";
import type { ExcalidrawFile } from "../src/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "excalidraw-rearrange-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function copyFixture(name: string): Promise<string> {
  const dest = join(workDir, name);
  await copyFile(join(FIXTURES, name), dest);
  return dest;
}

describe("rearrange() error handling", () => {
  it("throws when the canvas frame is missing", async () => {
    const file = await copyFixture("no-canvas.excalidraw");
    await expect(rearrange({ filePath: file, targetWidth: 400 })).rejects.toThrow(RearrangeError);
  });

  it("throws when the metadata frame is missing", async () => {
    const file = await copyFixture("no-metadata.excalidraw");
    await expect(rearrange({ filePath: file, targetWidth: 400 })).rejects.toThrow(RearrangeError);
  });

  it("throws when targetWidth is missing or <= 0", async () => {
    const file = await copyFixture("simple.excalidraw");
    await expect(rearrange({ filePath: file, targetWidth: 0 })).rejects.toThrow(RearrangeError);
    await expect(rearrange({ filePath: file, targetWidth: -10 })).rejects.toThrow(RearrangeError);
  });
});

describe("rearrange() integration - three-column fixture", () => {
  it("produces 3 groups stacked in reading order, leaves the original frame untouched, generates new ids", async () => {
    const file = await copyFixture("three-column.excalidraw");
    const result = await rearrange({ filePath: file, targetWidth: 350 });

    expect(result.report.groupCount).toBe(3);

    const originalCanvas = findCanvasFrame(result.outputElements, file);
    expect(originalCanvas.width).toBe(1400);
    // Original content elements (by id) must still be present, untouched.
    const originalRectA1 = result.outputElements.find((e) => e.id === "rectA1");
    expect(originalRectA1?.x).toBe(10);
    expect(originalRectA1?.y).toBe(50);

    // Metadata frame carried through untouched.
    const metadataFrame = findMetadataFrame(result.outputElements, file);
    expect(metadataFrame.width).toBe(300);

    const widthFrames = findCanvasWidthFrames(result.outputElements);
    expect(widthFrames.has(350)).toBe(true);
    const newFrame = widthFrames.get(350)!;
    expect(newFrame.width).toBe(350);

    // New content elements belong to the new frame and have ids distinct
    // from every original element id.
    const originalIds = new Set(
      ["frameCanvas", "frameMetadata", "textMetadata", "rectA1", "rectA2", "arrowA", "rectB", "textB", "rectC1", "rectC2"]
    );
    const newContentElements = result.outputElements.filter((e) => e.frameId === newFrame.id);
    expect(newContentElements.length).toBeGreaterThan(0);
    for (const el of newContentElements) {
      expect(originalIds.has(el.id)).toBe(false);
    }

    // 3 groups stacked top-to-bottom -> distinct Y bands, in ascending Y order.
    const ys = newContentElements.map((e) => e.y as number);
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys));
  });

  it("remaps arrow bindings and container bindings to the new copied element ids", async () => {
    const file = await copyFixture("three-column.excalidraw");
    const result = await rearrange({ filePath: file, targetWidth: 350 });
    const widthFrames = findCanvasWidthFrames(result.outputElements);
    const newFrame = widthFrames.get(350)!;
    const newElements = result.outputElements.filter((e) => e.frameId === newFrame.id);

    const newArrow = newElements.find((e) => e.type === "arrow")!;
    expect(newArrow).toBeDefined();
    const startId = newArrow.startBinding?.elementId as string;
    const endId = newArrow.endBinding?.elementId as string;
    expect(newElements.some((e) => e.id === startId)).toBe(true);
    expect(newElements.some((e) => e.id === endId)).toBe(true);
    // Must not still point at the original element ids.
    expect(startId).not.toBe("rectA1");
    expect(endId).not.toBe("rectA2");

    const newText = newElements.find((e) => e.type === "text" && e.containerId)!;
    expect(newText).toBeDefined();
    expect(newElements.some((e) => e.id === newText.containerId)).toBe(true);
  });
});

describe("rearrangeToFile() idempotency across multiple widths", () => {
  it("adding a second width keeps both new frames and the original untouched", async () => {
    const file = await copyFixture("simple.excalidraw");

    await rearrangeToFile({ filePath: file, targetWidth: 400 }, file);
    await rearrangeToFile({ filePath: file, targetWidth: 250 }, file);

    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as ExcalidrawFile;

    const widthFrames = findCanvasWidthFrames(parsed.elements);
    expect(widthFrames.has(400)).toBe(true);
    expect(widthFrames.has(250)).toBe(true);

    const originalCanvas = findCanvasFrame(parsed.elements, file);
    expect(originalCanvas.width).toBe(800);
  });
});

describe("rearrangeToFile() --force behavior", () => {
  it("fails re-running the same width without force, succeeds and replaces with force", async () => {
    const file = await copyFixture("simple.excalidraw");

    await rearrangeToFile({ filePath: file, targetWidth: 400 }, file);

    await expect(rearrangeToFile({ filePath: file, targetWidth: 400 }, file)).rejects.toThrow(
      RearrangeError
    );

    const result = await rearrangeToFile({ filePath: file, targetWidth: 400, force: true }, file);
    const widthFrames = findCanvasWidthFrames(result.outputElements);
    // Still exactly one canvas-400 frame after regeneration (old one removed).
    expect(widthFrames.has(400)).toBe(true);
    const frame400Count = result.outputElements.filter(
      (e) => e.type === "frame" && e.name === "canvas-400"
    ).length;
    expect(frame400Count).toBe(1);
  });
});

describe("scaling report - font floor and overflow flags", () => {
  it("flags a group that hits the font-size floor", async () => {
    const file = await copyFixture("scale-floor.excalidraw");
    const result = await rearrange({ filePath: file, targetWidth: 300, minFontSize: 12 });
    expect(result.report.fontFloorGroups.length).toBeGreaterThan(0);
  });

  it("does not flag a group that scales cleanly within the font floor", async () => {
    const file = await copyFixture("scale-no-floor.excalidraw");
    const result = await rearrange({ filePath: file, targetWidth: 300, minFontSize: 12 });
    expect(result.report.fontFloorGroups.length).toBe(0);
  });
});
