import type { ConvertResult } from "excalidraw-converter";

export type PageType = "home" | "post" | "page";

export interface PageCustom {
  type: PageType;
  date?: string;
  tags?: string[];
  description?: string;
}

export interface RoutedPage {
  result: ConvertResult;
  custom: PageCustom;
  filePath: string;
  /** Output path relative to dist/, e.g. "index.html" or "blog/my-post/index.html" */
  outPath: string;
  /** Public URL path, e.g. "/" or "/blog/my-post/" */
  route: string;
}

export class SiteValidationError extends Error {
  constructor(messages: string[]) {
    super(`Site validation failed:\n${messages.map((m) => `  - ${m}`).join("\n")}`);
    this.name = "SiteValidationError";
  }
}

function validateCustom(filePath: string, custom: unknown, errors: string[]): PageCustom | null {
  if (typeof custom !== "object" || custom === null) {
    errors.push(`${filePath}: metadata.custom is required and must be an object`);
    return null;
  }
  const c = custom as Record<string, unknown>;
  const type = c.type;
  if (type !== "home" && type !== "post" && type !== "page") {
    errors.push(`${filePath}: metadata.custom.type must be one of "home" | "post" | "page" (got ${JSON.stringify(type)})`);
    return null;
  }
  if (type === "post") {
    const date = c.date;
    if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
      errors.push(`${filePath}: metadata.custom.date is required and must be a valid date string when type is "post" (got ${JSON.stringify(date)})`);
      return null;
    }
  }
  if (c.tags !== undefined) {
    if (!Array.isArray(c.tags) || !c.tags.every((t) => typeof t === "string")) {
      errors.push(`${filePath}: metadata.custom.tags must be a string array when present`);
      return null;
    }
  }
  return {
    type,
    date: typeof c.date === "string" ? c.date : undefined,
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : undefined,
    description: typeof c.description === "string" ? c.description : undefined,
  };
}

function routeFor(custom: PageCustom, slug: string): { outPath: string; route: string } {
  if (custom.type === "home") return { outPath: "index.html", route: "/" };
  if (custom.type === "post") return { outPath: `blog/${slug}/index.html`, route: `/blog/${slug}/` };
  return { outPath: `${slug}/index.html`, route: `/${slug}/` };
}

/**
 * Validates the home/slug/type rules across all converted pages, aggregating
 * every problem found rather than throwing on the first one. Returns the
 * routed pages (each with its resolved output path) on success.
 */
export function routePages(pages: Array<{ result: ConvertResult; filePath: string }>): RoutedPage[] {
  const errors: string[] = [];
  const routed: RoutedPage[] = [];

  for (const { result, filePath } of pages) {
    const custom = validateCustom(filePath, result.metadata.custom, errors);
    if (!custom) continue;
    const { outPath, route } = routeFor(custom, result.metadata.slug);
    routed.push({ result, custom, filePath, outPath, route });
  }

  const homePages = routed.filter((p) => p.custom.type === "home");
  if (homePages.length === 0) {
    errors.push('No page found with metadata.custom.type === "home" — exactly one is required');
  } else if (homePages.length > 1) {
    errors.push(
      `Multiple pages have metadata.custom.type === "home": ${homePages.map((p) => p.filePath).join(", ")} — exactly one is required`
    );
  }

  const slugOwners = new Map<string, RoutedPage[]>();
  for (const p of routed) {
    if (p.custom.type === "home") continue;
    const key = `${p.custom.type}:${p.result.metadata.slug}`;
    const list = slugOwners.get(key) ?? [];
    list.push(p);
    slugOwners.set(key, list);
  }
  for (const [key, owners] of slugOwners) {
    if (owners.length > 1) {
      errors.push(`Duplicate slug "${key.split(":")[1]}" used by: ${owners.map((p) => p.filePath).join(", ")}`);
    }
  }

  if (errors.length > 0) {
    throw new SiteValidationError(errors);
  }

  return routed;
}
