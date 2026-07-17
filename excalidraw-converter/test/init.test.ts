import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { init } from "../src/init.js";
import { OutputExistsError } from "../src/errors.js";
import type { RawExcalidrawElement, RawExcalidrawFile } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(here, "fixtures", name);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "excalidraw-converter-init-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function frames(scene: RawExcalidrawFile): RawExcalidrawElement[] {
  return scene.elements.filter((el) => el.type === "frame");
}

describe("init", () => {
  it("with no template produces a file with one default canvas and one metadata frame", async () => {
    const outputPath = path.join(tmpDir, "new.excalidraw");
    await init({ outputPath });

    const scene: RawExcalidrawFile = JSON.parse(await readFile(outputPath, "utf-8"));
    const fs = frames(scene);
    expect(fs.filter((f) => f.name === "canvas")).toHaveLength(1);
    expect(fs.filter((f) => f.name === "metadata")).toHaveLength(1);

    const metadataFrame = fs.find((f) => f.name === "metadata")!;
    const textChild = scene.elements.find((el) => el.type === "text" && el.frameId === metadataFrame.id)!;
    expect(textChild).toBeDefined();
    const parsed = JSON.parse(textChild.text as string);
    expect(parsed).toEqual({ title: "", slug: "", custom: {} });
  });

  it("refuses to overwrite an existing output file", async () => {
    const outputPath = path.join(tmpDir, "existing.excalidraw");
    await init({ outputPath });
    await expect(init({ outputPath })).rejects.toThrow(OutputExistsError);
  });

  it("with a template missing all canvas frames adds one default canvas, preserves existing metadata and content", async () => {
    const outputPath = path.join(tmpDir, "from-template.excalidraw");
    await init({ outputPath, template: fixture("template-no-canvas.excalidraw") });

    const original: RawExcalidrawFile = JSON.parse(
      await readFile(fixture("template-no-canvas.excalidraw"), "utf-8")
    );
    const scene: RawExcalidrawFile = JSON.parse(await readFile(outputPath, "utf-8"));

    const fs = frames(scene);
    expect(fs.filter((f) => f.name === "canvas")).toHaveLength(1);
    // existing metadata frame untouched (same id still present)
    const originalMetadataFrame = frames(original).find((f) => f.name === "metadata")!;
    expect(fs.some((f) => f.id === originalMetadataFrame.id)).toBe(true);
    // existing decorative text element preserved untouched
    const decorative = original.elements.find((el) => el.text === "Some existing content")!;
    expect(scene.elements.some((el) => el.id === decorative.id)).toBe(true);
  });

  it("with a template that already has a canvas-{width} frame does not add a redundant default canvas", async () => {
    const outputPath = path.join(tmpDir, "from-width-template.excalidraw");
    await init({ outputPath, template: fixture("template-with-width-canvas.excalidraw") });

    const scene: RawExcalidrawFile = JSON.parse(await readFile(outputPath, "utf-8"));
    const fs = frames(scene);
    expect(fs.filter((f) => f.name === "canvas")).toHaveLength(0);
    expect(fs.filter((f) => f.name === "canvas-400")).toHaveLength(1);
  });
});
