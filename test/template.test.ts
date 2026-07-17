import type { CanvasVariant } from "excalidraw-converter";
import { describe, expect, it } from "vitest";
import { renderVariants, resolveLinkTarget } from "../src/template.js";

function variant(overrides: Partial<CanvasVariant>): CanvasVariant {
  return {
    breakpoint: null,
    width: 800,
    height: 600,
    svg: "<svg></svg>",
    textElements: [],
    links: [],
    html: "",
    ...overrides,
  };
}

describe("renderVariants", () => {
  it("makes text labels non-interactive so they never block a link underneath them, even with a quoted font-family (regression)", () => {
    // fontFamily is a real CSS stack with embedded double quotes (e.g. what
    // excalidraw-converter's resolveFontFamily actually returns), which — if
    // not escaped — prematurely closes this double-quoted style="..."
    // attribute and silently truncates pointer-events:none along with
    // everything else after font-family. The visible text still renders
    // (an HTML parser tolerates the malformed attribute soup that follows),
    // which is why this needs its own regex-captured-attribute check rather
    // than a plain .toContain on the raw markup.
    const { bodyHtml } = renderVariants([
      variant({
        links: [{ id: "l1", target: "home", x: 20, y: 20, width: 190, height: 40 }],
        textElements: [
          {
            id: "t1",
            text: "back to notebook",
            x: 40,
            y: 30,
            width: 160,
            height: 20,
            fontSize: 14,
            fontFamily: '"Excalifont", "Virgil", cursive',
            color: "#000",
            textAlign: "left",
            angle: 0,
          },
        ],
      }),
    ]);
    const textDivMatch = bodyHtml.match(/<div style="([^"]*)">back to notebook<\/div>/);
    expect(textDivMatch).not.toBeNull();
    expect(textDivMatch![1]).toContain("pointer-events:none");
  });
});

describe("renderVariants (variant switching)", () => {
  it("renders single-variant pages with no data-breakpoint wrapper or media-query style block", () => {
    const { bodyHtml, styleBlock } = renderVariants([variant({ breakpoint: null })]);
    expect(bodyHtml).not.toContain("data-breakpoint");
    expect(styleBlock).toBe("");
  });

  it("renders two variants (canvas + canvas-400) with correct wrapper markup and a min-width media query", () => {
    const { bodyHtml, styleBlock } = renderVariants([
      variant({ breakpoint: 400, width: 400 }),
      variant({ breakpoint: null, width: 800 }),
    ]);
    expect(bodyHtml).toContain('data-breakpoint="400"');
    expect(bodyHtml).toContain('data-breakpoint="default"');
    expect(styleBlock).toContain('[data-breakpoint="400"] { display: block; }');
    expect(styleBlock).toContain("@media (min-width: 401px)");
    expect(styleBlock).toContain('[data-breakpoint="default"] { display: block; }');
  });

  it("renders three variants with an ascending media-query chain", () => {
    const { styleBlock } = renderVariants([
      variant({ breakpoint: 400, width: 400 }),
      variant({ breakpoint: 800, width: 800 }),
      variant({ breakpoint: null, width: 1200 }),
    ]);
    const idx400 = styleBlock.indexOf("min-width: 401px");
    const idx800 = styleBlock.indexOf("min-width: 801px");
    expect(idx400).toBeGreaterThan(-1);
    expect(idx800).toBeGreaterThan(idx400);
  });
});

describe("resolveLinkTarget", () => {
  it("resolves 'home' to /", () => {
    expect(resolveLinkTarget("home")).toBe("/");
  });
  it("resolves 'post/<slug>' to /blog/<slug>/", () => {
    expect(resolveLinkTarget("post/my-first-post")).toBe("/blog/my-first-post/");
  });
  it("resolves a bare slug to /<slug>/", () => {
    expect(resolveLinkTarget("about")).toBe("/about/");
  });
  it("passes through absolute URLs untouched", () => {
    expect(resolveLinkTarget("https://example.com")).toBe("https://example.com");
  });
  it("treats a target that's already an absolute path as-is, without producing a protocol-relative //", () => {
    expect(resolveLinkTarget("/blog/free-spin")).toBe("/blog/free-spin/");
    expect(resolveLinkTarget("/blog/free-spin/")).toBe("/blog/free-spin/");
  });
});
