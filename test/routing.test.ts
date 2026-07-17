import type { ConvertResult } from "excalidraw-converter";
import { describe, expect, it } from "vitest";
import { routePages, SiteValidationError } from "../src/routing.js";

function page(overrides: {
  title: string;
  slug: string;
  custom: Record<string, unknown>;
}): { result: ConvertResult; filePath: string } {
  return {
    filePath: `pages/${overrides.slug}.excalidraw`,
    result: {
      metadata: { title: overrides.title, slug: overrides.slug, custom: overrides.custom },
      variants: [{ breakpoint: null, width: 800, height: 600, svg: "<svg></svg>", textElements: [], links: [], html: "" }],
    },
  };
}

describe("routePages", () => {
  it("routes a home page to /", () => {
    const routed = routePages([page({ title: "Home", slug: "home", custom: { type: "home" } })]);
    expect(routed[0].route).toBe("/");
    expect(routed[0].outPath).toBe("index.html");
  });

  it("routes a post to /blog/{slug}/", () => {
    const routed = routePages([
      page({ title: "Home", slug: "home", custom: { type: "home" } }),
      page({ title: "My Post", slug: "my-post", custom: { type: "post", date: "2026-01-01" } }),
    ]);
    const post = routed.find((p) => p.custom.type === "post")!;
    expect(post.route).toBe("/blog/my-post/");
    expect(post.outPath).toBe("blog/my-post/index.html");
  });

  it("routes a page to /{slug}/", () => {
    const routed = routePages([
      page({ title: "Home", slug: "home", custom: { type: "home" } }),
      page({ title: "About", slug: "about", custom: { type: "page" } }),
    ]);
    const about = routed.find((p) => p.custom.type === "page")!;
    expect(about.route).toBe("/about/");
    expect(about.outPath).toBe("about/index.html");
  });

  it("throws when no home page exists", () => {
    expect(() => routePages([page({ title: "About", slug: "about", custom: { type: "page" } })])).toThrow(
      SiteValidationError
    );
  });

  it("throws when more than one home page exists, naming both files", () => {
    expect(() =>
      routePages([
        page({ title: "Home", slug: "home", custom: { type: "home" } }),
        page({ title: "Home 2", slug: "home2", custom: { type: "home" } }),
      ])
    ).toThrow(/pages\/home\.excalidraw.*pages\/home2\.excalidraw|pages\/home2\.excalidraw.*pages\/home\.excalidraw/s);
  });

  it("throws on duplicate slugs, naming the conflicting files", () => {
    let error: unknown;
    try {
      routePages([
        page({ title: "Home", slug: "home", custom: { type: "home" } }),
        page({ title: "Post A", slug: "dup", custom: { type: "post", date: "2026-01-01" } }),
        page({ title: "Post B", slug: "dup", custom: { type: "post", date: "2026-02-01" } }),
      ]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(SiteValidationError);
    expect((error as Error).message).toMatch(/Duplicate slug "dup"/);
  });

  it("throws when custom.type is missing or invalid", () => {
    expect(() => routePages([page({ title: "Bad", slug: "bad", custom: {} })])).toThrow(SiteValidationError);
    expect(() => routePages([page({ title: "Bad", slug: "bad", custom: { type: "nonsense" } })])).toThrow(
      SiteValidationError
    );
  });

  it("throws when a post is missing a valid date", () => {
    expect(() => routePages([page({ title: "Bad", slug: "bad", custom: { type: "post" } })])).toThrow(
      SiteValidationError
    );
    expect(() =>
      routePages([page({ title: "Bad", slug: "bad", custom: { type: "post", date: "not-a-date" } })])
    ).toThrow(SiteValidationError);
  });

  it("throws when tags is present but not a string array", () => {
    expect(() =>
      routePages([page({ title: "Bad", slug: "bad", custom: { type: "post", date: "2026-01-01", tags: [1, 2] } })])
    ).toThrow(SiteValidationError);
  });

  it("aggregates multiple problems into one error rather than throwing on the first", () => {
    let error: unknown;
    try {
      routePages([
        page({ title: "Bad1", slug: "bad1", custom: { type: "nonsense" } }),
        page({ title: "Bad2", slug: "bad2", custom: { type: "post" } }),
      ]);
    } catch (err) {
      error = err;
    }
    const message = (error as Error).message;
    expect(message).toMatch(/bad1/);
    expect(message).toMatch(/bad2/);
    expect(message).toMatch(/No page found with metadata\.custom\.type === "home"/);
  });
});
