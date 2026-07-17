import type { ElementGroup } from "./types.js";

/**
 * Sorts groups into reading order: primarily top-to-bottom (minY),
 * secondarily left-to-right (minX) for groups whose Y ranges are close
 * enough to be considered "the same row" — within one group-height of
 * each other.
 *
 * Implementation: sort by minY first, then sweep through in that order and
 * cluster adjacent groups into "rows" whenever consecutive groups are
 * within one group-height of each other's minY (using a running row
 * anchor, transitively chaining nearby groups into the same row). Each
 * row is then re-sorted left-to-right by minX. This avoids the
 * non-transitive-comparator pitfalls of a single pairwise sort.
 */
export function sortReadingOrder(groups: ElementGroup[]): ElementGroup[] {
  if (groups.length === 0) return [];

  const byY = [...groups].sort((a, b) => a.bbox.minY - b.bbox.minY);

  const rows: ElementGroup[][] = [];
  let currentRow: ElementGroup[] = [byY[0]];
  let rowAnchorY = byY[0].bbox.minY;
  let rowAnchorHeight = byY[0].bbox.height;

  for (let i = 1; i < byY.length; i++) {
    const g = byY[i];
    const rowThreshold = Math.min(rowAnchorHeight, g.bbox.height);
    if (Math.abs(g.bbox.minY - rowAnchorY) < rowThreshold) {
      currentRow.push(g);
    } else {
      rows.push(currentRow);
      currentRow = [g];
      rowAnchorY = g.bbox.minY;
      rowAnchorHeight = g.bbox.height;
    }
  }
  rows.push(currentRow);

  const result: ElementGroup[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.bbox.minX - b.bbox.minX);
    result.push(...row);
  }
  return result;
}
