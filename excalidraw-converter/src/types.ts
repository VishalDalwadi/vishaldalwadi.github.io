/**
 * Loose shape of a raw element inside an .excalidraw file's `elements[]`
 * array. We intentionally do not import Excalidraw's internal element types
 * for the JSON model itself — this package treats the input as plain JSON
 * per the documented frame conventions, and only reaches for the real
 * library types at the `exportToSvg` boundary in convert.ts.
 */
export interface RawExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  frameId?: string | null;
  containerId?: string | null;
  isDeleted?: boolean;
  name?: string | null; // frames only
  text?: string; // text elements only
  fontSize?: number;
  fontFamily?: number;
  strokeColor?: string;
  textAlign?: "left" | "center" | "right";
  [key: string]: unknown;
}

export interface RawExcalidrawFile {
  type: string;
  version?: number;
  source?: string;
  elements: RawExcalidrawElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface PageMetadata {
  title: string;
  slug: string;
  template?: string;
  custom?: Record<string, unknown>;
}

export interface TextOverlayElement {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  textAlign: "left" | "center" | "right";
  angle: number;
}

export interface LinkOverlay {
  id: string;
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasVariant {
  breakpoint: number | null;
  width: number;
  height: number;
  svg: string;
  textElements: TextOverlayElement[];
  links: LinkOverlay[];
  html: string;
}

export interface ConvertResult {
  metadata: PageMetadata;
  variants: CanvasVariant[];
}
