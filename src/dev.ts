import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.js";
import { loadSiteConfig } from "./config.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = path.join(rootDir, "pages");
const staticDir = path.join(rootDir, "static");
const distDir = path.join(rootDir, "dist");

const LIVE_RELOAD_SCRIPT = `<script>
(function () {
  let last = null;
  setInterval(async () => {
    try {
      const res = await fetch("/__dev/version");
      const version = await res.text();
      if (last !== null && version !== last) location.reload();
      last = version;
    } catch {}
  }, 500);
})();
</script>`;

async function collectMtimes(dir: string, out: Map<string, number>): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMtimes(full, out);
    } else {
      const s = await stat(full);
      out.set(full, s.mtimeMs);
    }
  }
}

async function snapshot(): Promise<string> {
  const mtimes = new Map<string, number>();
  await collectMtimes(pagesDir, mtimes);
  await collectMtimes(staticDir, mtimes);
  const entries = [...mtimes.entries()].sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

export async function runDevServer(): Promise<void> {
  const site = await loadSiteConfig(rootDir);
  const port = site.port ?? 3000;

  let version = "";
  let building = false;

  const rebuild = async () => {
    if (building) return;
    building = true;
    try {
      const result = await build();
      console.log(`rebuilt ${result.pages.length} page(s)`);
    } catch (err) {
      console.error("build failed:", err instanceof Error ? err.message : err);
    } finally {
      building = false;
    }
  };

  await rebuild();
  version = await snapshot();

  setInterval(async () => {
    const next = await snapshot();
    if (next !== version) {
      version = next;
      await rebuild();
    }
  }, 500);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/__dev/version") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(version);
      return;
    }

    let filePath = path.join(distDir, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) filePath = path.join(filePath, "index.html");

    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = path.join(filePath, "index.html");
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("404 not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });

    if (ext === ".html") {
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(filePath, "utf-8");
      res.end(html.replace("</body>", `${LIVE_RELOAD_SCRIPT}\n</body>`));
      return;
    }

    createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    console.log(`dev server running at http://localhost:${port}`);
    console.log(`watching pages/**/*.excalidraw and static/** for changes`);
  });
}
