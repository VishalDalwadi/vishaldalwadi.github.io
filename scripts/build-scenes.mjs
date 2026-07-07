// Converts Excalidraw scenes into rendered pages: scenes/homepage.excalidraw
// (the one singleton) and scenes/posts/*.excalidraw (one per post).
//
// Excalidraw is the actual authoring surface here — whatever is drawn (text,
// doodles, jokes, diagrams, headlines, anything) is rendered as-is to
// src/data/scenes/<slug>.svg and embedded directly on the page, using the
// real @excalidraw/excalidraw exporter (see lib/excalidraw-export) so the
// output matches the app pixel-for-pixel — rough.js strokes, fonts, curved
// arrows, opacity, all of it. Nothing about the drawing is parsed into
// paragraphs/fields; the only things this script looks for are:
//
//   - a frame named "meta" containing a few "key: value" lines (title, date,
//     category, readTime, seo) — plain facts a page needs for routing/SEO
//     that can't themselves be a drawing. Its contents are excluded from the
//     rendered SVG (it's bookkeeping, not art).
//   - any frame named "link:home" or "link:post/<slug>" — whatever is drawn
//     inside becomes a clickable link to the given page, wrapped natively in
//     the rendered SVG (an <a> around that frame's elements plus a
//     transparent hit-area rect sized to their bounds).
//   - a frame named "canvas" — its bounds become the SVG's fixed viewBox, so
//     the rendered scale of everything stays stable no matter what else gets
//     added, moved, or removed elsewhere in the scene. This frame is
//     required — it's also the artboard you should draw within.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer } from './lib/excalidraw-export/render.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postScenesDir = path.join(rootDir, 'scenes/posts');
const homepageScenePath = path.join(rootDir, 'scenes/homepage.excalidraw');
const postsOutDir = path.join(rootDir, 'src/content/posts');
const scenesOutDir = path.join(rootDir, 'src/data/scenes');
const homepageOutFile = path.join(rootDir, 'src/data/homepage.json');

fs.mkdirSync(postsOutDir, { recursive: true });
fs.mkdirSync(scenesOutDir, { recursive: true });

function frames(elements) {
  return elements.filter((el) => el.type === 'frame' && !el.isDeleted);
}

function parseMeta(metaFrames, elements) {
  const metaFrameIds = new Set(metaFrames.map((f) => f.id));
  const text = elements
    .filter((el) => el.type === 'text' && el.frameId && metaFrameIds.has(el.frameId) && !el.isDeleted)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((el) => el.text)
    .join('\n');

  const fields = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields[key] = value;
  }
  return fields;
}

function resolveHref(frameName, slug) {
  if (frameName === 'link:home') return '/';
  if (frameName.startsWith('link:post/')) {
    const target = frameName.slice('link:post/'.length).trim();
    return target ? `/posts/${target}/` : null;
  }
  console.warn(`[${slug}] unrecognized link frame name "${frameName}" — skipping`);
  return null;
}

async function convertScene(slug, scene, renderer) {
  const elements = scene.elements ?? [];
  const allFrames = frames(elements);

  const metaFrames = allFrames.filter((f) => f.name === 'meta');
  const linkFrames = allFrames.filter((f) => f.name?.startsWith('link:'));
  const canvasFrame = allFrames.find((f) => f.name === 'canvas');
  if (!canvasFrame) {
    throw new Error(`[${slug}] scene is missing a frame named "canvas" to define its export bounds`);
  }

  const meta = parseMeta(metaFrames, elements);
  if (!meta.title) throw new Error(`[${slug}] "meta" frame is missing a "title:" line`);
  if (!meta.seo) throw new Error(`[${slug}] "meta" frame is missing a "seo:" line`);

  const metaFrameIds = new Set(metaFrames.map((f) => f.id));
  const contentElements = elements.filter(
    (el) => el.type !== 'frame' && !el.isDeleted && !(el.frameId && metaFrameIds.has(el.frameId))
  );

  const linksByFrameId = new Map();
  for (const frame of linkFrames) {
    const href = resolveHref(frame.name, slug);
    if (!href) continue;
    linksByFrameId.set(frame.id, { frame, href, ariaLabel: href === '/' ? 'back to notebook' : 'read post' });
  }

  if (contentElements.length === 0) {
    throw new Error(`[${slug}] scene has no drawable content outside the "meta" frame`);
  }

  // Split content into maximal consecutive runs by which link frame (if any)
  // owns each element, preserving the scene's original document z-order —
  // an element can stack on top of (or under) a link frame's content
  // without belonging to that frame, so grouping "all main content, then
  // all links" would silently invert that stacking.
  const hitAreaEmitted = new Set();
  const runs = [];
  let currentOwnerId = undefined;
  for (const el of contentElements) {
    const link = linksByFrameId.get(el.frameId);
    const ownerId = link ? link.frame.id : null;
    if (currentOwnerId === ownerId && runs.length > 0) {
      runs[runs.length - 1].elements.push(el);
    } else {
      runs.push({ ownerId, elements: [el] });
      currentOwnerId = ownerId;
    }
  }

  const resolvedRuns = runs.map(({ ownerId, elements: runElements }) => {
    if (ownerId === null) return { kind: 'main', elements: runElements };
    const link = linksByFrameId.get(ownerId);
    const hitAreaEmitted_ = hitAreaEmitted.has(ownerId);
    hitAreaEmitted.add(ownerId);
    return {
      kind: 'link',
      frame: link.frame,
      elements: runElements,
      href: link.href,
      ariaLabel: link.ariaLabel,
      hitAreaEmitted: hitAreaEmitted_,
    };
  });

  const svg = await renderer.render({ canvasFrame, runs: resolvedRuns });
  return { meta, svg };
}

async function buildHomepage(renderer) {
  if (!fs.existsSync(homepageScenePath)) {
    console.log('No scenes/homepage.excalidraw yet — skipping homepage build.');
    return;
  }

  const scene = JSON.parse(fs.readFileSync(homepageScenePath, 'utf-8'));
  const { meta, svg } = await convertScene('homepage', scene, renderer);

  fs.writeFileSync(path.join(scenesOutDir, 'homepage.svg'), svg);
  fs.writeFileSync(
    homepageOutFile,
    JSON.stringify({ title: meta.title, seoDescription: meta.seo }, null, 2) + '\n'
  );
  console.log('built scene: homepage');
}

async function buildPosts(renderer) {
  if (!fs.existsSync(postScenesDir)) {
    console.log(`No ${path.relative(rootDir, postScenesDir)} directory yet — skipping post scenes.`);
    return;
  }

  const files = fs.readdirSync(postScenesDir).filter((f) => f.endsWith('.excalidraw'));
  if (files.length === 0) {
    console.log('No post scenes found — skipping post scenes.');
    return;
  }

  for (const file of files) {
    const slug = path.basename(file, '.excalidraw');
    const scene = JSON.parse(fs.readFileSync(path.join(postScenesDir, file), 'utf-8'));

    const { meta, svg } = await convertScene(slug, scene, renderer);
    for (const field of ['date', 'category', 'readTime']) {
      if (!meta[field]) throw new Error(`[${slug}] "meta" frame is missing a "${field}:" line`);
    }

    fs.writeFileSync(path.join(scenesOutDir, `${slug}.svg`), svg);
    fs.writeFileSync(
      path.join(postsOutDir, `${slug}.json`),
      JSON.stringify(
        {
          title: meta.title,
          date: meta.date,
          category: meta.category,
          readTime: meta.readTime,
          seoDescription: meta.seo,
        },
        null,
        2
      ) + '\n'
    );

    console.log(`built scene: ${slug}`);
  }
}

const renderer = await createRenderer();
try {
  await buildHomepage(renderer);
  await buildPosts(renderer);
} finally {
  await renderer.close();
}
