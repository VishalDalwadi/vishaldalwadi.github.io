// Minimal Excalidraw-element-to-SVG serializer.
//
// This intentionally does NOT depend on the full @excalidraw/excalidraw
// package (which needs a browser/DOM canvas to export scenes) — it
// implements just enough of the element geometry to render freeform
// Excalidraw scenes (rectangles, lines/arrows, freedraw strokes, text) as
// clean-line inline SVG. The whole scene is rendered as drawn — this is not
// a content-extraction step, just a faithful re-render of the artwork.

export function bbox(elements) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    const w = el.width ?? estimateTextWidth(el);
    const h = el.height ?? estimateTextHeight(el);
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + w);
    maxY = Math.max(maxY, el.y + h);
  }

  return { minX, minY, maxX, maxY };
}

function estimateTextWidth(el) {
  if (el.type !== 'text') return 0;
  const longestLine = Math.max(...el.text.split('\n').map((l) => l.length));
  return longestLine * (el.fontSize ?? 20) * 0.55;
}

function estimateTextHeight(el) {
  if (el.type !== 'text') return 0;
  const lines = el.text.split('\n').length;
  return lines * (el.fontSize ?? 20) * (el.lineHeight ?? 1.25);
}

function toDeg(radians) {
  return ((radians ?? 0) * 180) / Math.PI;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rotateAttr(el) {
  const angle = toDeg(el.angle);
  if (!angle) return '';
  const cx = el.x + (el.width ?? 0) / 2;
  const cy = el.y + (el.height ?? 0) / 2;
  return ` transform="rotate(${angle.toFixed(2)} ${cx} ${cy})"`;
}

function renderRectangle(el) {
  const rx = el.roundness ? Math.min(el.width, el.height) * 0.08 : 0;
  const fill = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'none';
  return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${rx}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth ?? 1.5}"${rotateAttr(el)}/>`;
}

function renderEllipse(el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const fill = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'none';
  return `<ellipse cx="${cx}" cy="${cy}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth ?? 1.5}"${rotateAttr(el)}/>`;
}

function renderDiamond(el) {
  const { x, y, width: w, height: h } = el;
  const points = [
    [x + w / 2, y],
    [x + w, y + h / 2],
    [x + w / 2, y + h],
    [x, y + h / 2],
  ]
    .map((p) => p.join(','))
    .join(' ');
  const fill = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'none';
  return `<polygon points="${points}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth ?? 1.5}"${rotateAttr(el)}/>`;
}

function renderLinePath(el) {
  const points = el.points ?? [[0, 0], [el.width ?? 0, el.height ?? 0]];
  const d = points
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${el.x + px} ${el.y + py}`)
    .join(' ');
  const dash = el.strokeStyle === 'dashed' ? ' stroke-dasharray="4 5"' : el.strokeStyle === 'dotted' ? ' stroke-dasharray="1 4"' : '';
  const marker = el.type === 'arrow' && el.endArrowhead !== null ? ' marker-end="url(#arrowhead)"' : '';
  return `<path d="${d}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth ?? 1.5}" stroke-linecap="round" stroke-linejoin="round"${dash}${marker}${rotateAttr(el)}/>`;
}

function renderText(el) {
  const lines = el.text.split('\n');
  const fontSize = el.fontSize ?? 20;
  const lineHeight = (el.lineHeight ?? 1.25) * fontSize;
  const anchor = el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start';
  const anchorX = anchor === 'middle' ? el.x + el.width / 2 : anchor === 'end' ? el.x + el.width : el.x;
  const tspans = lines
    .map((line, i) => `<tspan x="${anchorX}" dy="${i === 0 ? fontSize : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text x="${anchorX}" y="${el.y}" font-family="Excalifont, cursive" font-size="${fontSize}" fill="${el.strokeColor}" text-anchor="${anchor}"${rotateAttr(el)}>${tspans}</text>`;
}

export const RENDERERS = {
  rectangle: renderRectangle,
  ellipse: renderEllipse,
  diamond: renderDiamond,
  line: renderLinePath,
  arrow: renderLinePath,
  freedraw: renderLinePath,
  text: renderText,
};

/**
 * Renders a full set of Excalidraw elements as a standalone, tightly-cropped
 * inline SVG. Elements belonging to a frame listed in `links` are wrapped in
 * a native SVG `<a>` with a transparent hit-area rect sized to that frame's
 * content — the clickable region is expressed in the same coordinate space
 * as the artwork itself, so it can never drift out of alignment with it.
 */
export function sceneToSvg(elements, { padding = 12, links = [] } = {}) {
  const renderable = elements.filter((el) => RENDERERS[el.type] && !el.isDeleted);
  if (renderable.length === 0) return null;

  const { minX, minY, maxX, maxY } = bbox(renderable);
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  const shifted = renderable.map((el) => ({ ...el, x: el.x - minX + padding, y: el.y - minY + padding }));

  const linksById = new Map(links.map((link) => [link.id, link]));
  const frameBoxes = new Map();
  for (const link of links) {
    const els = shifted.filter((el) => el.frameId === link.id);
    if (els.length > 0) frameBoxes.set(link.id, bbox(els));
  }

  // Walk elements in their original document order — stacking (what's drawn
  // on top of what) depends on that order, so grouping link-frame content
  // separately from everything else would silently reorder the two.
  const emittedHitArea = new Set();
  const parts = [];
  for (let i = 0; i < shifted.length; ) {
    const link = linksById.get(shifted[i].frameId);
    if (!link) {
      parts.push(RENDERERS[shifted[i].type](shifted[i]));
      i += 1;
      continue;
    }

    const run = [];
    while (i < shifted.length && shifted[i].frameId === link.id) {
      run.push(shifted[i]);
      i += 1;
    }

    const box = frameBoxes.get(link.id);
    let hit = '';
    if (box && !emittedHitArea.has(link.id)) {
      // Painted last (on top of the artwork) so its hover stroke is actually
      // visible — fill stays transparent, so this never obscures anything.
      hit = `\n    <rect x="${box.minX}" y="${box.minY}" width="${box.maxX - box.minX}" height="${box.maxY - box.minY}" fill="transparent" class="hit-area"/>`;
      emittedHitArea.add(link.id);
    }
    const label = link.ariaLabel ? ` aria-label="${escapeXml(link.ariaLabel)}"` : '';
    const runBody = run.map((el) => RENDERERS[el.type](el)).join('\n    ');
    parts.push(`<a href="${escapeXml(link.href)}" class="link-hotspot"${label}>\n    ${runBody}${hit}\n  </a>`);
  }

  const body = parts.join('\n  ');

  const svg = `<svg width="100%" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 L2,4 z" fill="#1e1e1e"/>
    </marker>
  </defs>
  ${body}
</svg>
`;

  return { svg, width, height, minX, minY, padding };
}
