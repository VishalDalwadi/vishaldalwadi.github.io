import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SiteConfig {
  title: string;
  baseUrl: string;
  description: string;
  nav: Array<{ label: string; href: string }>;
  port?: number;
}

export async function loadSiteConfig(rootDir: string): Promise<SiteConfig> {
  const raw = await readFile(path.join(rootDir, "site.config.json"), "utf-8");
  return JSON.parse(raw) as SiteConfig;
}
