import type { CanvasVariant, ConvertResult } from "excalidraw-converter";
import type { SiteConfig } from "./config.js";
import type { RoutedPage } from "./routing.js";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

/**
 * Resolves a link frame's raw `target` string (opaque to excalidraw-converter,
 * e.g. "home", "post/my-first-post", or a full URL) into a real site route.
 * This project owns this mapping — the converter package never interprets it.
 */
export function resolveLinkTarget(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  if (target === "home") return "/";
  if (target.startsWith("post/")) return `/blog/${target.slice("post/".length)}/`;
  if (target.startsWith("/")) return target.endsWith("/") ? target : `${target}/`;
  return `/${target}/`;
}

function renderVariantBody(variant: CanvasVariant): string {
  const linksHtml = variant.links
    .map(
      (link) =>
        `      <a href="${escapeAttr(resolveLinkTarget(link.target))}" style="position:absolute; left:${link.x}px; top:${link.y}px; width:${link.width}px; height:${link.height}px; display:block;"></a>`
    )
    .join("\n");

  const textHtml = variant.textElements
    .map((t) => {
      // font-family values contain literal double quotes (e.g. `"Excalifont",
      // "Virgil", cursive`), which would otherwise prematurely close this
      // double-quoted style attribute and silently truncate everything after
      // it (including pointer-events:none) — escape the whole style value.
      const style = `position:absolute; left:${t.x}px; top:${t.y}px; width:${t.width}px; font-size:${t.fontSize}px; font-family:${t.fontFamily}; color:${t.color}; text-align:${t.textAlign}; transform: rotate(${t.angle}rad); pointer-events:none;`;
      return `      <div style="${escapeAttr(style)}">${escapeHtml(t.text)}</div>`;
    })
    .join("\n");

  return `<div class="excalidraw-page" style="position:relative; width:${variant.width}px;">
  <div class="excalidraw-bg" style="position:absolute; top:0; left:0;">${variant.svg}</div>
  <div class="excalidraw-links-layer" style="position:relative; z-index:1;">
${linksHtml}
  </div>
  <div class="excalidraw-text-layer" style="position:relative; z-index:2;">
${textHtml}
  </div>
</div>`;
}

/**
 * Renders every canvas variant of a page and, when there's more than one,
 * the min-width media-query CSS that switches between them (mobile-first:
 * smallest breakpoint visible by default, each larger breakpoint takes over
 * above its own width, the default/null variant — the original desktop
 * layout — taking over above the largest declared breakpoint).
 *
 * Single-variant pages (the common case) skip all wrapper markup/CSS.
 */
export function renderVariants(variants: CanvasVariant[]): { bodyHtml: string; styleBlock: string } {
  if (variants.length === 1) {
    return { bodyHtml: renderVariantBody(variants[0]), styleBlock: "" };
  }

  const withNames = variants.map((v) => ({
    v,
    name: v.breakpoint === null ? "default" : String(v.breakpoint),
  }));

  const bodyHtml = withNames
    .map(
      ({ v, name }) =>
        `<div class="excalidraw-variant" data-breakpoint="${name}">\n${renderVariantBody(v)}\n</div>`
    )
    .join("\n");

  // Ascending by breakpoint, default/null last (matches ConvertResult.variants ordering).
  const numeric = withNames.filter((w): w is { v: CanvasVariant; name: string } & { v: { breakpoint: number } } => w.v.breakpoint !== null);

  const rules: string[] = [".excalidraw-variant { display: none; }"];
  rules.push(`.excalidraw-variant[data-breakpoint="${numeric[0]?.name ?? "default"}"] { display: block; }`);

  for (let i = 0; i < numeric.length; i++) {
    const current = numeric[i];
    const next = withNames[withNames.findIndex((w) => w.v === current.v) + 1] ?? withNames.find((w) => w.name === "default");
    rules.push(`@media (min-width: ${current.v.breakpoint + 1}px) {
  .excalidraw-variant[data-breakpoint="${current.name}"] { display: none; }
  .excalidraw-variant[data-breakpoint="${next?.name}"] { display: block; }
}`);
  }

  return { bodyHtml, styleBlock: `<style>\n${rules.join("\n")}\n</style>` };
}

/**
 * Site chrome (wordmark + back-to-notebook link) lives outside any
 * Excalidraw canvas — it's pinned to the viewport's edges, which a
 * fixed-width hand-drawn canvas has no way to reach. Plain HTML/CSS,
 * not hand-drawn; see BACKLOG.md for the hand-drawn "chrome frame"
 * alternative this deliberately skips for now.
 */
function renderSiteNav(isHome: boolean): string {
  // Home: wordmark alone, sits at the left edge (justify-content:space-between
  // puts a single child at flex-start). Everywhere else: back-link at the left
  // edge, wordmark at the right — source order matters here since both are
  // present and space-between places first-child/last-child at opposite ends.
  const backLink = isHome
    ? ""
    : `<a class="site-nav-back" href="/">&larr; back to notebook</a>`;
  const mark = `<a class="site-nav-mark" href="/"><img src="/static/logo-underline.svg" alt="paperplanes.cloud" width="260" height="44" /></a>`;

  return `    <header class="site-nav">
      ${isHome ? mark : `${backLink}\n      ${mark}`}
    </header>`;
}

function renderAnalytics(): string {
  const gaId = process.env.PUBLIC_GA_ID;
  if (!gaId) return "";
  return `    <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeAttr(gaId)}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag('js', new Date());
      gtag('config', ${JSON.stringify(gaId)});
    </script>
`;
}

export interface ShellOptions {
  site: SiteConfig;
  title: string;
  description: string;
  route: string;
  bodyHtml: string;
  bodyClass: string;
  extraStyle?: string;
  articleMeta?: { datePublished: string; section: string };
}

export function renderShell(opts: ShellOptions): string {
  const { site, title, description, route, bodyHtml, bodyClass, extraStyle, articleMeta } = opts;
  const canonicalUrl = new URL(route, site.baseUrl).toString();
  const ogImageUrl = new URL("/static/og-default.png", site.baseUrl).toString();

  const jsonLd = articleMeta
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        datePublished: articleMeta.datePublished,
        articleSection: articleMeta.section,
        description,
        url: canonicalUrl,
      }
    : null;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    <link rel="preload" href="/static/fonts/Excalifont-Regular.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/static/site.css" />

    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />

    <meta property="og:type" content="${articleMeta ? "article" : "website"}" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
    <meta property="og:image" content="${escapeAttr(ogImageUrl)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
    <meta name="twitter:image" content="${escapeAttr(ogImageUrl)}" />
${jsonLd ? `    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` : ""}${extraStyle ?? ""}${renderAnalytics()}
  </head>
  <body class="${bodyClass}">
${bodyHtml}
  </body>
</html>
`;
}

export function renderPage(page: RoutedPage, site: SiteConfig): string {
  const { result, custom, route } = page;
  const { bodyHtml, styleBlock } = renderVariants(result.variants);
  const title = custom.type === "post" ? `${result.metadata.title} — ${site.title}` : result.metadata.title;
  const description = custom.description ?? site.description;

  const pageWrap = `${renderSiteNav(custom.type === "home")}
    <main class="page">
      ${custom.type === "post" ? `<h1 class="sr-only">${escapeHtml(result.metadata.title)}</h1>\n      ` : ""}<div class="page-wrap">
        ${bodyHtml}
      </div>
    </main>`;

  return renderShell({
    site,
    title,
    description,
    route,
    bodyHtml: pageWrap,
    bodyClass: custom.type === "home" ? "theme-home" : "theme-article",
    extraStyle: styleBlock ? `    ${styleBlock}\n` : undefined,
    articleMeta:
      custom.type === "post" && custom.date
        ? { datePublished: new Date(custom.date).toISOString(), section: custom.tags?.[0] ?? "Blog" }
        : undefined,
  });
}

export function renderBlogListing(posts: RoutedPage[], site: SiteConfig): string {
  const sorted = [...posts].sort((a, b) => (b.custom.date ?? "").localeCompare(a.custom.date ?? ""));

  const entries = sorted
    .map(
      (p) => `        <li class="blog-listing-entry">
          <a href="${escapeAttr(p.route)}">${escapeHtml(p.result.metadata.title)}</a>
          <div class="blog-listing-meta">${escapeHtml(p.custom.date ?? "")}${p.custom.tags?.length ? ` · ${escapeHtml(p.custom.tags.join(", "))}` : ""}</div>
        </li>`
    )
    .join("\n");

  const bodyHtml = `${renderSiteNav(false)}
    <main class="blog-listing">
      <div class="blog-listing-wrap">
        <h1>Blog</h1>
        <ul class="blog-listing-entries">
${entries || "          <li>No posts yet.</li>"}
        </ul>
      </div>
    </main>`;

  return renderShell({
    site,
    title: `Blog — ${site.title}`,
    description: site.description,
    route: "/blog/",
    bodyHtml,
    bodyClass: "theme-article",
  });
}
