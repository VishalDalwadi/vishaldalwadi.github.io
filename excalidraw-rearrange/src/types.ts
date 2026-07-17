/**
 * Minimal typing for raw Excalidraw JSON element data. This package only
 * reads/writes/repositions raw JSON — it never renders or exports anything,
 * so we only model the fields we actually touch. Unknown/extra fields on
 * elements are preserved via the index signature + spread-copy approach
 * used throughout src/.
 */

export interface Point {
  0: number;
  1: number;
  [index: number]: number;
}

export interface Binding {
  elementId: string;
  focus?: number;
  gap?: number;
  [key: string]: unknown;
}

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  frameId?: string | null;
  containerId?: string | null;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  points?: number[][];
  fontSize?: number;
  text?: string;
  name?: string | null;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export interface ExcalidrawFrameElement extends ExcalidrawElement {
  type: "frame";
  name?: string | null;
}

export interface ExcalidrawFile {
  type: string;
  version: number;
  source?: string;
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/** A connected component of related elements from the proximity/binding graph. */
export interface ElementGroup {
  id: string;
  elements: ExcalidrawElement[];
  bbox: BoundingBox;
}

export interface RearrangeOptions {
  filePath: string;
  targetWidth: number;
  proximityThreshold?: number;
  minFontSize?: number;
  groupGap?: number;
  force?: boolean;
}

export interface FontFloorGroup {
  groupId: string;
  elementIds: string[];
}

export interface OverflowingText {
  elementId: string;
  textPreview: string;
}

export interface RearrangeReport {
  groupCount: number;
  fontFloorGroups: FontFloorGroup[];
  overflowingText: OverflowingText[];
  newCanvasHeight: number;
}

export interface RearrangeResult {
  outputElements: ExcalidrawElement[];
  report: RearrangeReport;
}
