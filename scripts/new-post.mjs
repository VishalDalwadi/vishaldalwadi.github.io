// Usage: npm run new-post -- my-post-slug
// Copies the base template scene into scenes/posts/<slug>.excalidraw so
// it can be opened in the Excalidraw app and filled in.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];

if (!slug) {
  console.error('Usage: npm run new-post -- <slug>');
  process.exit(1);
}

const templatePath = path.join(rootDir, 'templates/post-base.excalidraw');
const destDir = path.join(rootDir, 'scenes/posts');
const destPath = path.join(destDir, `${slug}.excalidraw`);

fs.mkdirSync(destDir, { recursive: true });

if (fs.existsSync(destPath)) {
  console.error(`${path.relative(rootDir, destPath)} already exists.`);
  process.exit(1);
}

fs.copyFileSync(templatePath, destPath);
console.log(`created ${path.relative(rootDir, destPath)} — open it in the Excalidraw app and fill it in.`);
