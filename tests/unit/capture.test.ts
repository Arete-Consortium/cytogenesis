import { describe, expect, it } from "vitest";
import { World } from "@/game/world";
import type { Body } from "@/game/types";

const place = (b: Body, x: number, y: number) => {
  b.x = x;
  b.y = y;
};

describe("World.capture", () => {
  it("starts with one captured (core), five free, zero bonds", () => {
    const w = new World({ freeCount: 5 });
    const counts = w.countByKind();
    expect(counts.captured).toBe(1);
    expect(counts.free).toBe(5);
    expect(w.bonds).toHaveLength(0);
  });

  it("flips a free cell to captured and adds one bond", () => {
    const w = new World({ freeCount: 5 });
    const free = w.freeBodies[0];
    const bond = w.capture(free);
    expect(bond).not.toBeNull();
    expect(free.kind).toBe("captured");
    expect(w.bonds).toHaveLength(1);
    expect(w.entityBodies).toContain(free);
    expect(w.freeBodies).not.toContain(free);
  });

  it("links the new capture to the nearest captured node", () => {
    const w = new World({ freeCount: 5 });
    const core = w.entityBodies[0];
    place(core, 0, 0);
    const farCaptured = w.freeBodies[0];
    place(farCaptured, 1000, 0);
    w.capture(farCaptured);

    const free = w.freeBodies[0]; // was index 1, now first free after splice
    place(free, 1010, 0);
    const bond = w.capture(free)!;
    const target = bond.target as Body;
    expect(target.id).toBe(farCaptured.id);
  });

  it("never re-captures an already-captured body", () => {
    const w = new World({ freeCount: 5 });
    const core = w.entityBodies[0];
    expect(w.capture(core)).toBeNull();
    expect(w.bonds).toHaveLength(0);
  });

  it("captureNearby sweeps in cells touching any captured node and respawns one", () => {
    const w = new World({ freeCount: 5, seed: "capture-test" });
    const core = w.entityBodies[0];
    place(core, 0, 0);
    for (const b of w.freeBodies) place(b, 5000, 5000);
    const adj = w.freeBodies[0];
    place(adj, 20, 0);

    const formed = w.captureNearby();
    expect(formed).toHaveLength(1);
    expect(adj.kind).toBe("captured");
    expect(w.bonds).toHaveLength(1);
    // Replacement spawned → free count steady, captured up by one.
    const counts = w.countByKind();
    expect(counts.captured).toBe(2);
    expect(counts.free).toBe(5);
  });

  it("captureNearby does nothing when no free cell is in range", () => {
    const w = new World({ freeCount: 5 });
    for (const b of w.freeBodies) place(b, 5000, 5000);
    expect(w.captureNearby()).toHaveLength(0);
    expect(w.bonds).toHaveLength(0);
  });

  it("respawn keeps free count steady and lands inside arena bounds", () => {
    const w = new World({ freeCount: 1, arenaHalf: 200, seed: "respawn-test" });
    const core = w.entityBodies[0];
    place(core, 0, 0);
    const adj = w.freeBodies[0];
    place(adj, 10, 0);
    w.captureNearby();
    const spawned = w.freeBodies[0]; // only one free left, the replacement
    expect(w.freeBodies).toHaveLength(1);
    expect(Math.abs(spawned.x ?? 0)).toBeLessThanOrEqual(200);
    expect(Math.abs(spawned.y ?? 0)).toBeLessThanOrEqual(200);
  });

  it("respawn falls back to edge when env CA is fully dead", () => {
    const w = new World({ freeCount: 1, arenaHalf: 200, seed: "respawn-edge" });
    // Force the CA dead so biasToAlive cannot find a live cell.
    w.envCA.cells.fill(0);
    const core = w.entityBodies[0];
    place(core, 0, 0);
    const adj = w.freeBodies[0];
    place(adj, 10, 0);
    w.captureNearby();
    const spawned = w.freeBodies[0];
    const onEdge =
      Math.abs(spawned.x ?? 0) > 199 || Math.abs(spawned.y ?? 0) > 199;
    expect(onEdge).toBe(true);
  });
});
