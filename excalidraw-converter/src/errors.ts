/** Base class for all errors this package throws, always naming the source file. */
export class ExcalidrawConvertError extends Error {
  constructor(filePath: string, message: string) {
    super(`[${filePath}] ${message}`);
    this.name = "ExcalidrawConvertError";
  }
}

export class MissingMetadataFrameError extends ExcalidrawConvertError {
  constructor(filePath: string) {
    super(filePath, 'No frame named "metadata" was found. Every .excalidraw file needs a "metadata" frame containing a single JSON text element.');
    this.name = "MissingMetadataFrameError";
  }
}

export class InvalidMetadataError extends ExcalidrawConvertError {
  constructor(filePath: string, reason: string) {
    super(filePath, `Invalid "metadata" frame: ${reason}`);
    this.name = "InvalidMetadataError";
  }
}

export class MissingCanvasFrameError extends ExcalidrawConvertError {
  constructor(filePath: string) {
    super(filePath, 'No canvas frame was found. Every .excalidraw file needs at least one frame named "canvas" or "canvas-{width}".');
    this.name = "MissingCanvasFrameError";
  }
}

export class DuplicateBreakpointError extends ExcalidrawConvertError {
  constructor(filePath: string, breakpointLabel: string, frameIdA: string, frameIdB: string) {
    super(
      filePath,
      `Two canvas frames resolve to the same breakpoint (${breakpointLabel}): frame "${frameIdA}" and frame "${frameIdB}". Rename one of them.`
    );
    this.name = "DuplicateBreakpointError";
  }
}

export class OutputExistsError extends ExcalidrawConvertError {
  constructor(filePath: string) {
    super(filePath, "Output file already exists. Pick a new name or delete the existing file first.");
    this.name = "OutputExistsError";
  }
}
