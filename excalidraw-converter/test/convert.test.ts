import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertPage } from "../src/convert.js";
import {
  DuplicateBreakpointError,
  InvalidMetadataError,
  MissingCanvasFrameError,
  MissingMetadataFrameError,
} from "../src/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(here, "fixtures", name);

describe("convertPage", () => {
  it("converts a valid minimal file with a single canvas frame", async () => {
    const result = await convertPage(fixture("minimal.excalidraw"));

    expect(result.metadata.title).toBe("Minimal Page");
    expect(result.metadata.slug).toBe("minimal");
    expect(result.variants).toHaveLength(1);

    const variant = result.variants[0];
    expect(variant.breakpoint).toBeNull();
    expect(variant.width).toBe(800);
    expect(variant.svg).toContain("<svg");
    expect(variant.textElements).toHaveLength(1);
    expect(variant.textElements[0].text).toBe("Hello world");
    // relative to canvas frame origin (canvas.y = 300)
    expect(variant.textElements[0].y).toBe(50);
    expect(variant.html).toContain("Hello world");
    expect(variant.links).toEqual([]);
  });

  it("doesn't let a font-family value's embedded quotes break the style attribute (regression)", async () => {
    // "minimal.excalidraw"'s text elements use fontFamily 5 (Excalifont),
    // whose CSS stack is `"Excalifont", "Virgil", cursive` — literal double
    // quotes that, if not escaped, prematurely close a double-quoted style="..."
    // attribute and silently truncate every property after font-family
    // (color, text-align, transform), even though the visible text content
    // is unaffected (an HTML parser tolerates the malformed attribute soup
    // that follows without breaking the DOM tree, which is why a naive
    // `.toContain("Hello world")` check alone doesn't catch this).
    const result = await convertPage(fixture("minimal.excalidraw"));
    const html = result.variants[0].html;
    const styleMatch = html.match(/<div style="([^"]*)">Hello world<\/div>/);
    expect(styleMatch).not.toBeNull();
    expect(styleMatch![1]).toContain("color:");
    expect(styleMatch![1]).toContain("text-align:");
    expect(styleMatch![1]).toContain("transform:");
  });

  it("handles canvas + canvas-400 with two sorted variants and no cross-variant leakage", async () => {
    const result = await convertPage(fixture("multi-variant.excalidraw"));

    expect(result.variants).toHaveLength(2);
    expect(result.variants[0].breakpoint).toBe(400);
    expect(result.variants[1].breakpoint).toBeNull();

    const narrow = result.variants[0];
    const wide = result.variants[1];

    expect(narrow.textElements).toHaveLength(1);
    expect(narrow.textElements[0].text).toBe("Mobile text");
    expect(wide.textElements).toHaveLength(1);
    expect(wide.textElements[0].text).toBe("Desktop text");
  });

  it("handles files with only canvas-{width} frames (no default canvas)", async () => {
    const result = await convertPage(fixture("only-width-variant.excalidraw"));
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].breakpoint).toBe(400);
    expect(result.variants.some((v) => v.breakpoint === null)).toBe(false);
  });

  it("throws when no canvas frame is found", async () => {
    await expect(convertPage(fixture("no-canvas.excalidraw"))).rejects.toThrow(MissingCanvasFrameError);
  });

  it("throws on duplicate breakpoints, naming both frame ids", async () => {
    await expect(convertPage(fixture("duplicate-breakpoint.excalidraw"))).rejects.toThrow(
      /frame-3.*frame-4|frame-4.*frame-3/
    );
  });

  it("throws when metadata frame is missing", async () => {
    await expect(convertPage(fixture("missing-metadata.excalidraw"))).rejects.toThrow(
      MissingMetadataFrameError
    );
  });

  it("throws on malformed metadata JSON", async () => {
    await expect(convertPage(fixture("malformed-metadata.excalidraw"))).rejects.toThrow(
      InvalidMetadataError
    );
  });

  it("throws when a required metadata field is missing", async () => {
    await expect(convertPage(fixture("missing-required-field.excalidraw"))).rejects.toThrow(
      InvalidMetadataError
    );
  });

  it("excludes elements outside the canvas frame's horizontal bounds", async () => {
    const result = await convertPage(fixture("multi-variant.excalidraw"));
    const wide = result.variants.find((v) => v.breakpoint === null)!;
    // "Mobile text" belongs to canvas-400, must not appear in the default variant
    expect(wide.textElements.map((t) => t.text)).not.toContain("Mobile text");
    const narrow = result.variants.find((v) => v.breakpoint === 400)!;
    expect(narrow.textElements.map((t) => t.text)).not.toContain("Desktop text");
  });

  it("renders freedraw elements without throwing (roughjs Path2D dependency)", async () => {
    const result = await convertPage(fixture("freedraw.excalidraw"));
    const variant = result.variants[0];
    expect(variant.svg).toContain("<svg");
    expect(variant.svg.length).toBeGreaterThan(100);
  });

  it("produces a taller height when content extends below the frame's drawn height (scroll case)", async () => {
    const result = await convertPage(fixture("scroll-content.excalidraw"));
    const variant = result.variants[0];
    // canvas drawn height was 200, but "belowText" sits at relative y=600, height 40
    expect(variant.height).toBeGreaterThan(200);
    expect(variant.height).toBeGreaterThanOrEqual(640);
  });

  describe("link:* frame convention", () => {
    it("extracts a links entry with correct target/bounds, scoped per-variant", async () => {
      const result = await convertPage(fixture("with-links.excalidraw"));

      const wide = result.variants.find((v) => v.breakpoint === null)!;
      const narrow = result.variants.find((v) => v.breakpoint === 400)!;

      // two separate link:home frames in the default canvas -> two entries
      const homeLinks = wide.links.filter((l) => l.target === "home");
      expect(homeLinks).toHaveLength(2);
      expect(new Set(homeLinks.map((l) => l.id)).size).toBe(2);

      // bounds are relative to the canvas variant's own origin
      const small = homeLinks.find((l) => l.width === 60)!;
      expect(small).toBeDefined();
      expect(small.x).toBe(40); // linkSmall.x=40, canvasDefault.x=0
      expect(small.y).toBe(40); // linkSmall.y=340, canvasDefault.y=300

      // link:post/my-first-post frame only appears in the canvas-400 variant
      expect(narrow.links).toHaveLength(1);
      expect(narrow.links[0].target).toBe("post/my-first-post");
      expect(wide.links.some((l) => l.target === "post/my-first-post")).toBe(false);

      // content inside a link frame is still extracted as normal text/svg content
      expect(wide.textElements.map((t) => t.text)).toContain("Hi");
      expect(narrow.textElements.map((t) => t.text)).toContain("Read");
    });

    it("produces an empty links array when there are no link:* frames", async () => {
      const result = await convertPage(fixture("no-links.excalidraw"));
      expect(result.variants[0].links).toEqual([]);
    });

    it("renders link overlays as anchors in the html output", async () => {
      const result = await convertPage(fixture("with-links.excalidraw"));
      const wide = result.variants.find((v) => v.breakpoint === null)!;
      expect(wide.html).toContain('href="home"');
      expect(wide.html).toMatch(/<a href="home"[^>]*position:absolute/);
    });
  });
});
