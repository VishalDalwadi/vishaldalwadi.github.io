import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertPage, type ConvertResult } from "excalidraw-converter";
import { loadSiteConfig } from "./config.js";
import { routePages, type RoutedPage } from "./routing.js";
import { renderBlogListing, renderPage } from "./template.js";

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function findExcalidrawFiles(dir: string, pagesDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.relative(pagesDir, full) === "templates") continue;
      files.push(...(await findExcalidrawFiles(full, pagesDir)));
    } else if (entry.name.endsWith(".excalidraw")) {
      files.push(full);
    }
  }
  return files;
}

export interface BuildResult {
  pages: RoutedPage[];
  outDir: string;
}

export async function build(rootDir: string = defaultRootDir): Promise<BuildResult> {
  const pagesDir = path.join(rootDir, "pages");
  const staticDir = path.join(rootDir, "static");
  const distDir = path.join(rootDir, "dist");
  const converterFontsDir = path.join(defaultRootDir, "excalidraw-converter", "assets", "fonts");

  const site = await loadSiteConfig(rootDir);
  const files = await findExcalidrawFiles(pagesDir, pagesDir);

  const converted: Array<{ result: ConvertResult; filePath: string }> = [];
  const conversionErrors: string[] = [];
  for (const filePath of files) {
    try {
      const result = await convertPage(filePath);
      converted.push({ result, filePath: path.relative(rootDir, filePath) });
    } catch (err) {
      conversionErrors.push(`${path.relative(rootDir, filePath)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (conversionErrors.length > 0) {
    throw new Error(`Failed to convert ${conversionErrors.length} page(s):\n${conversionErrors.map((m) => `  - ${m}`).join("\n")}`);
  }

  const routed = routePages(converted);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const page of routed) {
    const outFile = path.join(distDir, page.outPath);
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, renderPage(page, site));
  }

  const posts = routed.filter((p) => p.custom.type === "post");
  await mkdir(path.join(distDir, "blog"), { recursive: true });
  await writeFile(path.join(distDir, "blog", "index.html"), renderBlogListing(posts, site));

  const routes = [...routed.map((p) => p.route), "/blog/"];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((r) => `  <url><loc>${new URL(r, site.baseUrl).toString()}</loc></url>`).join("\n")}
</urlset>
`;
  await writeFile(path.join(distDir, "sitemap.xml"), sitemap);

  // CNAME and robots.txt are GitHub-Pages-root files, not assets served from
  // /static/ — exclude them from the wholesale copy so they only end up at
  // the dist root (below), not duplicated under dist/static/ as dead files.
  const rootOnlyFiles = new Set(["CNAME", "robots.txt"]);
  await cp(staticDir, path.join(distDir, "static"), {
    recursive: true,
    filter: (source) => !rootOnlyFiles.has(path.relative(staticDir, source)),
  });
  await mkdir(path.join(distDir, "static", "fonts"), { recursive: true });
  await cp(converterFontsDir, path.join(distDir, "static", "fonts"), { recursive: true });

  for (const rootFile of rootOnlyFiles) {
    const src = path.join(staticDir, rootFile);
    try {
      await cp(src, path.join(distDir, rootFile));
    } catch {
      // optional
    }
  }

  return { pages: routed, outDir: distDir };
}

export async function runBuildCli(): Promise<void> {
  const { pages, outDir } = await build();
  console.log(`built ${pages.length} page(s) -> ${path.relative(defaultRootDir, outDir)}/`);
  for (const p of pages) {
    console.log(`  ${p.route}  (${p.custom.type}, from ${p.filePath})`);
  }
}
