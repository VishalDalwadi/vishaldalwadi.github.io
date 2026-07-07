// Converts Excalidraw scenes into rendered pages: scenes/homepage.excalidraw
// (the one singleton) and scenes/posts/*.excalidraw (one per post).
//
// Excalidraw is the actual authoring surface here — whatever is drawn (text,
// doodles, jokes, diagrams, headlines, anything) is rendered as-is to
// src/data/scenes/<slug>.svg and embedded directly on the page. Nothing about
// the drawing is parsed into paragraphs/fields; the only two things this
// script looks for are:
//
//   - a frame named "meta" containing a few "key: value" lines (title, date,
//     category, readTime, seo) — plain facts a page needs for routing/SEO
//     that can't themselves be a drawing. Its contents are excluded from the
//     rendered SVG (it's bookkeeping, not art).
//   - any frame named "link:home" or "link:post/<slug>" — whatever is drawn
//     inside becomes a clickable link to the given page, wrapped natively in
//     the rendered SVG (an <a> around that frame's elements plus a
//     transparent hit-area rect sized to their bounds).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneToSvg } from './lib/excalidraw-svg.mjs';

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

function convertScene(slug, scene) {
  const elements = scene.elements ?? [];
  const allFrames = frames(elements);

  const metaFrames = allFrames.filter((f) => f.name === 'meta');
  const linkFrames = allFrames.filter((f) => f.name?.startsWith('link:'));
  const excludeFrameIds = new Set(metaFrames.map((f) => f.id));

  const meta = parseMeta(metaFrames, elements);
  if (!meta.title) throw new Error(`[${slug}] "meta" frame is missing a "title:" line`);
  if (!meta.seo) throw new Error(`[${slug}] "meta" frame is missing a "seo:" line`);

  const renderable = elements.filter(
    (el) => el.type !== 'frame' && !el.isDeleted && !(el.frameId && excludeFrameIds.has(el.frameId))
  );

  const links = linkFrames
    .map((frame) => {
      const href = resolveHref(frame.name, slug);
      if (!href) return null;
      return { id: frame.id, href, ariaLabel: href === '/' ? 'back to notebook' : 'read post' };
    })
    .filter(Boolean);

  const rendered = sceneToSvg(renderable, { links });
  if (!rendered) throw new Error(`[${slug}] scene has no drawable content outside the "meta" frame`);

  return { meta, svg: rendered.svg };
}

function buildHomepage() {
  if (!fs.existsSync(homepageScenePath)) {
    console.log('No scenes/homepage.excalidraw yet — skipping homepage build.');
    return;
  }

  const scene = JSON.parse(fs.readFileSync(homepageScenePath, 'utf-8'));
  const { meta, svg } = convertScene('homepage', scene);

  fs.writeFileSync(path.join(scenesOutDir, 'homepage.svg'), svg);
  fs.writeFileSync(
    homepageOutFile,
    JSON.stringify({ title: meta.title, seoDescription: meta.seo }, null, 2) + '\n'
  );
  console.log('built scene: homepage');
}

function buildPosts() {
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

    const { meta, svg } = convertScene(slug, scene);
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

buildHomepage();
buildPosts();
