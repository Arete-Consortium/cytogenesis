import { describe, expect, it } from "vitest";
import { World } from "@/game/world";
import type { Body, NodeTypeId } from "@/game/types";

const place = (b: Body, x: number, y: number) => {
  b.x = x;
  b.y = y;
};

/**
 * Helper: capture cells around the core to build an entity of `n+1`
 * total bodies (including core). Returns refs to the captured leaves.
 */
function buildEntityOfSize(world: World, n: number, type: NodeTypeId = "membrane"): Body[] {
  // Park every free cell far away first.
  for (const b of world.freeBodies) place(b, 9000, 9000);
  place(world.entityBodies[0], 0, 0);
  const captured: Body[] = [];
  let radius = 22; // start just inside core capture range (18+10+2 = 30)
  for (let i = 0; i < n; i++) {
    const free = world.freeBodies[i];
    free.type = type;
    free.radius = 10;
    const angle = (i / n) * Math.PI * 2;
    place(free, Math.cos(angle) * radius, Math.sin(angle) * radius);
    world.captureNearby();
    captured.push(free);
    radius += 0.5; // micro-shell so collide doesn't shove later captures out
  }
  return captured;
}

describe("World.pruneFromGraph", () => {
  it("removes a leaf and returns it to the free pool", () => {
    const w = new World({ freeCount: 5, seed: "prune-leaf" });
    const leaves = buildEntityOfSize(w, 3);
    const target = leaves[0];
    const beforeFree = w.freeBodies.length;
    const beforeCaptured = w.entityBodies.length;
    w.pruneFromGraph(target);
    expect(w.entityBodies.length).toBe(beforeCaptured - 1);
    expect(w.freeBodies.length).toBe(beforeFree + 1);
    expect(target.kind).toBe("free");
    expect(w.freeBodies).toContain(target);
  });

  it("removing the core is a no-op", () => {
    const w = new World({ freeCount: 5, seed: "prune-core" });
    const before = w.entityBodies.length;
    w.pruneFromGraph(w.entityBodies[0]);
    expect(w.entityBodies.length).toBe(before);
  });

  it("recomputes traits after a prune", () => {
    const w = new World({ freeCount: 5, seed: "prune-traits" });
    // Build entity with one mouth → wide_capture active.
    const leaves = buildEntityOfSize(w, 1, "mouth");
    expect(w.traits.active.has("wide_capture")).toBe(true);
    w.pruneFromGraph(leaves[0]);
    expect(w.traits.active.has("wide_capture")).toBe(false);
    expect(w.traits.captureRadiusBonus).toBe(0);
  });

  it("orphans cascade out: removing the bridge frees both sides", () => {
    const w = new World({ freeCount: 8, seed: "prune-cascade" });
    // Build core—A—B chain via direct capture so we don't depend on
    // the captureNearby surface filter (which only lets core + mouths
    // act as capture surfaces).
    for (const b of w.freeBodies) place(b, 9000, 9000);
    place(w.entityBodies[0], 0, 0);
    const a = w.freeBodies[0];
    a.type = "membrane";
    a.radius = 10;
    place(a, 22, 0); // closer to core
    w.capture(a); // bonds to core
    const b = w.freeBodies[0]; // a was spliced out
    b.type = "membrane";
    b.radius = 10;
    place(b, 40, 0); // closer to a (18) than to core (40) → bonds to a
    w.capture(b);
    expect(w.entityBodies.length).toBe(3);

    w.pruneFromGraph(a);
    expect(w.entityBodies.length).toBe(1); // only core remains
    expect(b.kind).toBe("free");
  });
});

describe("World run lifecycle", () => {
  it("transcend triggers when captured count reaches 80", () => {
    const w = new World({ freeCount: 1, seed: "transcend" });
    place(w.entityBodies[0], 0, 0);
    // Forcibly stuff entity to TRANSCEND_AT - 1 then push one more capture.
    for (let i = 0; i < 78; i++) {
      const f: Body = {
        id: `synthetic-${i}`,
        type: "membrane",
        kind: "free",
        radius: 10,
        x: 9000,
        y: 9000,
        vx: 0,
        vy: 0,
      };
      w.freeBodies.push(f);
      w.capture(f);
    }
    expect(w.runStatus).toBe("running");
    const last: Body = {
      id: "synthetic-final",
      type: "membrane",
      kind: "free",
      radius: 10,
      x: 9000,
      y: 9000,
      vx: 0,
      vy: 0,
    };
    w.freeBodies.push(last);
    w.capture(last);
    expect(w.entityBodies.length).toBeGreaterThanOrEqual(80);
    expect(w.runStatus).toBe("transcended");
  });

  it("tick is a no-op once the run has ended", () => {
    const w = new World({ freeCount: 5, seed: "no-op-tick" });
    w.runStatus = "dead";
    const tickBefore = w.tickN;
    const wallBefore = w.wallMs;
    w.tick(100);
    expect(w.tickN).toBe(tickBefore);
    expect(w.wallMs).toBe(wallBefore);
  });
});
