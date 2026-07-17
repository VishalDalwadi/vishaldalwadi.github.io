import { computeBoundingBox, generateId } from "./frames.js";
import type { ElementGroup, ExcalidrawElement } from "./types.js";

/** Edge-to-edge (not center-to-center) gap between two axis-aligned bounding boxes. */
export function bboxGap(a: ExcalidrawElement, b: ExcalidrawElement): number {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  // If boxes overlap on both axes, gap is 0. Otherwise use Euclidean
  // distance between the nearest edges (matches "nearest edge-to-edge
  // distance" from the spec more accurately than max(dx, dy) alone when
  // boxes are diagonal from one another).
  return Math.sqrt(dx * dx + dy * dy);
}

/** Default proximity threshold for a pair of elements per the spec's formula. */
export function defaultProximityThreshold(a: ExcalidrawElement, b: ExcalidrawElement): number {
  return Math.min(a.height, b.height) * 0.75;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const p = this.parent.get(id);
    if (p === undefined) {
      this.parent.set(id, id);
      return id;
    }
    if (p === id) return id;
    const root = this.find(p);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Builds the proximity/binding graph over content elements and returns
 * connected components as ElementGroups.
 *
 * Strong edges: arrow/line startBinding/endBinding, text containerId.
 * Weak edges: proximity below the threshold (elementwise gap).
 */
export function buildGroups(
  elements: ExcalidrawElement[],
  proximityThreshold?: number
): ElementGroup[] {
  const uf = new UnionFind();
  const byId = new Map(elements.map((el) => [el.id, el]));

  for (const el of elements) {
    uf.add(el.id);
  }

  // Strong edges: arrow/line bindings.
  for (const el of elements) {
    const startId = el.startBinding?.elementId;
    const endId = el.endBinding?.elementId;
    if (startId && byId.has(startId)) uf.union(el.id, startId);
    if (endId && byId.has(endId)) uf.union(el.id, endId);
  }

  // Strong edges: container/label binding (text.containerId -> container).
  for (const el of elements) {
    const containerId = el.containerId;
    if (containerId && byId.has(containerId)) uf.union(el.id, containerId);
  }

  // Weak edges: proximity, for all pairs.
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      const threshold = proximityThreshold ?? defaultProximityThreshold(a, b);
      if (bboxGap(a, b) < threshold) {
        uf.union(a.id, b.id);
      }
    }
  }

  const componentMap = new Map<string, ExcalidrawElement[]>();
  for (const el of elements) {
    const root = uf.find(el.id);
    const bucket = componentMap.get(root);
    if (bucket) {
      bucket.push(el);
    } else {
      componentMap.set(root, [el]);
    }
  }

  const groups: ElementGroup[] = [];
  for (const groupElements of componentMap.values()) {
    groups.push({
      id: generateId("group"),
      elements: groupElements,
      bbox: computeBoundingBox(groupElements),
    });
  }
  return groups;
}
