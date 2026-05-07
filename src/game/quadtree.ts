import { quadtree as d3quadtree, type Quadtree, type QuadtreeLeaf } from "d3";
import type { Body } from "./types";

export type BodyQuadtree = Quadtree<Body>;

/**
 * Build a fresh quadtree over the given bodies. The d3 quadtree is
 * cheap to rebuild (~O(n log n)) and bodies move every frame, so we
 * rebuild rather than incrementally update.
 */
export function buildQuadtree(bodies: Body[]): BodyQuadtree {
  return d3quadtree<Body>()
    .x((d) => d.x ?? 0)
    .y((d) => d.y ?? 0)
    .addAll(bodies);
}

/**
 * Visit every body whose center lies within `r` of (qx, qy). Standard
 * d3-quadtree range-query idiom: prune subtrees whose bounding box
 * can't intersect the search disk.
 */
export function rangeQuery(
  qt: BodyQuadtree,
  qx: number,
  qy: number,
  r: number,
  cb: (b: Body) => void,
): void {
  const r2 = r * r;
  qt.visit((node, x0, y0, x1, y1) => {
    // Internal nodes have a `length` (always 4); leaves don't.
    if (!("length" in node)) {
      let leaf: QuadtreeLeaf<Body> | undefined = node;
      do {
        const b: Body = leaf.data;
        const dx = (b.x ?? 0) - qx;
        const dy = (b.y ?? 0) - qy;
        if (dx * dx + dy * dy <= r2) cb(b);
        leaf = leaf.next;
      } while (leaf);
    }
    return x0 > qx + r || x1 < qx - r || y0 > qy + r || y1 < qy - r;
  });
}
