import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "../src/build.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(testDir, "fixtures", "site");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("build (end-to-end)", () => {
  let outDir: string;

  it("builds a small fixture pages/ dir into the expected dist/ tree", async () => {
    const result = await build(fixtureRoot);
    outDir = result.outDir;

    expect(result.pages).toHaveLength(2);
    expect(await exists(path.join(outDir, "index.html"))).toBe(true);
    expect(await exists(path.join(outDir, "blog", "hello", "index.html"))).toBe(true);
    expect(await exists(path.join(outDir, "blog", "index.html"))).toBe(true);
    expect(await exists(path.join(outDir, "static", "placeholder.txt"))).toBe(true);
    expect(await exists(path.join(outDir, "static", "fonts", "Excalifont-Regular.woff2"))).toBe(true);
    expect(await exists(path.join(outDir, "sitemap.xml"))).toBe(true);
  });

  it("blog listing page links to the post", async () => {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(path.join(outDir, "blog", "index.html"), "utf-8");
    expect(html).toContain('href="/blog/hello/"');
    expect(html).toContain("Hello Post");
  });

  afterAll(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(outDir, { recursive: true, force: true });
  });
});
