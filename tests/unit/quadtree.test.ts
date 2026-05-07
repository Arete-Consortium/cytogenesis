import { describe, expect, it } from "vitest";
import { buildQuadtree, rangeQuery } from "@/game/quadtree";
import type { Body } from "@/game/types";

const makeBody = (id: string, x: number, y: number): Body => ({
  id,
  type: "propulsion",
  kind: "free",
  radius: 7,
  x,
  y,
  vx: 0,
  vy: 0,
});

describe("quadtree.rangeQuery", () => {
  it("returns bodies within radius and skips ones outside", () => {
    const bodies = [
      makeBody("a", 0, 0),
      makeBody("b", 10, 0),
      makeBody("c", 100, 0),
      makeBody("d", 0, -8),
      makeBody("e", 50, 50),
    ];
    const qt = buildQuadtree(bodies);
    const hits: string[] = [];
    rangeQuery(qt, 0, 0, 15, (b) => hits.push(b.id));
    hits.sort();
    expect(hits).toEqual(["a", "b", "d"]);
  });

  it("returns nothing when no body is in range", () => {
    const qt = buildQuadtree([makeBody("a", 1000, 1000)]);
    const hits: string[] = [];
    rangeQuery(qt, 0, 0, 50, (b) => hits.push(b.id));
    expect(hits).toEqual([]);
  });

  it("handles an empty body list", () => {
    const qt = buildQuadtree([]);
    const hits: string[] = [];
    rangeQuery(qt, 0, 0, 100, (b) => hits.push(b.id));
    expect(hits).toEqual([]);
  });

  it("scales: 1k random bodies, all inside the search radius", () => {
    const bodies: Body[] = [];
    for (let i = 0; i < 1000; i++) {
      bodies.push(makeBody(`b-${i}`, (i % 50) - 25, Math.floor(i / 50) - 10));
    }
    const qt = buildQuadtree(bodies);
    let n = 0;
    rangeQuery(qt, 0, 0, 1000, () => n++);
    expect(n).toBe(1000);
  });
});
