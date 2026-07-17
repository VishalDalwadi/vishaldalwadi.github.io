import { randomUUID } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import type { RawExcalidrawElement, RawExcalidrawFile } from "./types.js";
import { ExcalidrawConvertError, OutputExistsError } from "./errors.js";

const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const MARGIN = 100;

function baseElementFields(): Pick<
  RawExcalidrawElement,
  | "strokeColor"
  | "backgroundColor"
  | "fillStyle"
  | "strokeWidth"
  | "strokeStyle"
  | "roundness"
  | "roughness"
  | "opacity"
  | "angle"
  | "seed"
  | "version"
  | "versionNonce"
  | "index"
  | "isDeleted"
  | "groupIds"
  | "frameId"
  | "boundElements"
  | "updated"
  | "link"
  | "locked"
> {
  return {
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    angle: 0,
    seed: Math.floor(Math.random() * 1_000_000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1_000_000),
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

function makeFrame(name: string, x: number, y: number, width: number, height: number): RawExcalidrawElement {
  return {
    id: randomUUID(),
    type: "frame",
    name,
    x,
    y,
    width,
    height,
    ...baseElementFields(),
  };
}

function makeMetadataTextElement(frameId: string, x: number, y: number): RawExcalidrawElement {
  const text = JSON.stringify({ title: "", slug: "", custom: {} }, null, 2);
  return {
    id: randomUUID(),
    type: "text",
    x,
    y,
    width: 360,
    height: 160,
    text,
    fontSize: 16,
    fontFamily: 5,
    textAlign: "left",
    ...baseElementFields(),
    frameId,
  };
}

function hasFrameNamed(elements: RawExcalidrawElement[], predicate: (name: string) => boolean): boolean {
  return elements.some(
    (el) => el.type === "frame" && !el.isDeleted && typeof el.name === "string" && predicate(el.name)
  );
}

function hasAnyCanvasFrame(elements: RawExcalidrawElement[]): boolean {
  return hasFrameNamed(elements, (name) => name === "canvas" || /^canvas-\d+$/.test(name));
}

function hasMetadataFrame(elements: RawExcalidrawElement[]): boolean {
  return hasFrameNamed(elements, (name) => name === "metadata");
}

function boundingBoxOf(elements: RawExcalidrawElement[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (el.isDeleted) continue;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { minX, minY, maxX, maxY };
}

function buildDefaultScene(): RawExcalidrawFile {
  const metadataFrame = makeFrame("metadata", 0, 0, 400, 220);
  const metadataText = makeMetadataTextElement(metadataFrame.id, metadataFrame.x + 20, metadataFrame.y + 20);
  const canvasFrame = makeFrame(
    "canvas",
    0,
    metadataFrame.y + metadataFrame.height + MARGIN,
    DEFAULT_CANVAS_WIDTH,
    DEFAULT_CANVAS_HEIGHT
  );

  return {
    type: "excalidraw",
    version: 2,
    source: "excalidraw-converter",
    elements: [metadataFrame, metadataText, canvasFrame],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
}

export interface InitOptions {
  outputPath: string;
  template?: string;
}

/**
 * Scaffold a new .excalidraw file at `outputPath`. With no template, writes
 * a minimal file containing exactly a "canvas" frame and a "metadata" frame.
 * With a template, copies the template's contents and injects whichever of
 * those two frames are missing, without touching any existing content.
 */
export async function init(options: InitOptions): Promise<void> {
  const { outputPath, template } = options;

  try {
    await access(outputPath);
    throw new OutputExistsError(outputPath);
  } catch (err) {
    if (err instanceof OutputExistsError) throw err;
    // ENOENT is expected (file does not exist yet) — proceed.
  }

  if (!template) {
    const scene = buildDefaultScene();
    await writeFile(outputPath, JSON.stringify(scene, null, 2), "utf-8");
    return;
  }

  const templateRaw = await readFile(template, "utf-8");
  let scene: RawExcalidrawFile;
  try {
    scene = JSON.parse(templateRaw);
  } catch (err) {
    throw new ExcalidrawConvertError(template, `template file is not valid JSON: ${(err as Error).message}`);
  }

  const elements = [...(scene.elements ?? [])];
  const bbox = boundingBoxOf(elements);
  let nextX = bbox.maxX === -Infinity ? 0 : bbox.maxX + MARGIN;
  const baseY = bbox.minY === Infinity ? 0 : bbox.minY;

  if (!hasMetadataFrame(elements)) {
    const metadataFrame = makeFrame("metadata", nextX, baseY, 400, 220);
    const metadataText = makeMetadataTextElement(metadataFrame.id, metadataFrame.x + 20, metadataFrame.y + 20);
    elements.push(metadataFrame, metadataText);
    nextX = metadataFrame.x + metadataFrame.width + MARGIN;
  }

  if (!hasAnyCanvasFrame(elements)) {
    const canvasFrame = makeFrame("canvas", nextX, baseY, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
    elements.push(canvasFrame);
  }

  const outputScene: RawExcalidrawFile = { ...scene, elements };
  await writeFile(outputPath, JSON.stringify(outputScene, null, 2), "utf-8");
}
