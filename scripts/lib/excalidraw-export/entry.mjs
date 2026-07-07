import { exportToSvg } from '@excalidraw/excalidraw';

const SVG_NS = 'http://www.w3.org/2000/svg';

async function exportFrame(elements, frame) {
  return exportToSvg({
    elements,
    appState: { exportBackground: false },
    files: null,
    exportPadding: 0,
    exportingFrame: frame,
  });
}

function wrapLink(svg, run) {
  const nested = document.createElementNS(SVG_NS, 'svg');
  nested.setAttribute('x', String(run.frame.x));
  nested.setAttribute('y', String(run.frame.y));
  nested.setAttribute('width', String(run.frame.width));
  nested.setAttribute('height', String(run.frame.height));
  nested.setAttribute('viewBox', svg.getAttribute('viewBox'));

  for (const child of Array.from(svg.childNodes)) {
    nested.appendChild(child);
  }

  if (!run.hitAreaEmitted) {
    const hit = document.createElementNS(SVG_NS, 'rect');
    hit.setAttribute('width', String(run.frame.width));
    hit.setAttribute('height', String(run.frame.height));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('class', 'hit-area');
    nested.appendChild(hit);
  }

  const a = document.createElementNS(SVG_NS, 'a');
  a.setAttribute('href', run.href);
  a.setAttribute('class', 'link-hotspot');
  if (run.ariaLabel) a.setAttribute('aria-label', run.ariaLabel);
  a.appendChild(nested);
  return a;
}

// Renders a scene using the real Excalidraw exporter (authentic rough.js
// strokes, fonts, curves, opacity — everything the app itself draws), then
// wraps each "link:*" frame's content in a native SVG <a> for click-through
// navigation.
//
// `runs` is the scene's content elements split into maximal consecutive runs
// by which link frame (if any) owns each element — same document z-order as
// the original scene. Splitting by document order (not "all main content,
// then all links") matters: an element can sit on top of a link frame's
// content (or vice versa) despite not belonging to that frame, and always
// drawing link content last would silently invert that stacking.
//
// Each run is exported separately (still scoped via exportingFrame to a
// shared coordinate space for "main" runs, or the link frame's own bounds
// for "link" runs) and spliced into a shell SVG in run order, so the
// composited result preserves the scene's real stacking.
window.__renderScene = async ({ canvasFrame, runs }) => {
  const rootSvg = await exportFrame([canvasFrame], canvasFrame);

  for (const run of runs) {
    if (run.kind === 'main') {
      const svg = await exportFrame([canvasFrame, ...run.elements], canvasFrame);
      for (const child of Array.from(svg.childNodes)) {
        rootSvg.appendChild(child);
      }
      continue;
    }

    const svg = await exportFrame([run.frame, ...run.elements], run.frame);
    rootSvg.appendChild(wrapLink(svg, run));
  }

  rootSvg.setAttribute('width', '100%');
  rootSvg.removeAttribute('height');
  return rootSvg.outerHTML;
};

window.__ready = true;
