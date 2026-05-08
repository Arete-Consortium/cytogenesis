import { describe, expect, it } from "vitest";
import { World } from "@/game/world";
import type { Body } from "@/game/types";

const place = (b: Body, x: number, y: number) => {
  b.x = x;
  b.y = y;
};

describe("World.capture (absorb-counter model)", () => {
  it("starts with totalAbsorbed=0 and stage 0", () => {
    const w = new World({ freeCount: 5 });
    expect(w.totalAbsorbed).toBe(0);
    expect(w.evolutionStage).toBe(0);
    expect(w.entityBodies).toHaveLength(1);
    expect(w.bonds).toHaveLength(0);
  });

  it("capturing a free cell increments absorbed without growing the entity graph", () => {
    const w = new World({ freeCount: 5 });
    const free = w.freeBodies[0];
    const type = free.type;
    w.capture(free);
    expect(w.totalAbsorbed).toBe(1);
    expect(w.absorbed[type]).toBe(1);
    // The graph stays at exactly the core.
    expect(w.entityBodies).toHaveLength(1);
    expect(w.bonds).toHaveLength(0);
  });

  it("captureNearby on contact pulls in cells touching the bell", () => {
    const w = new World({ freeCount: 5, seed: "capture-near" });
    place(w.entityBodies[0], 0, 0);
    for (const b of w.freeBodies) place(b, 5000, 5000);
    const adj = w.freeBodies[0];
    place(adj, 20, 0);
    w.captureNearby();
    expect(w.totalAbsorbed).toBeGreaterThanOrEqual(1);
  });

  it("captureNearby does nothing when no free cell is near", () => {
    const w = new World({ freeCount: 5 });
    for (const b of w.freeBodies) place(b, 5000, 5000);
    expect(w.captureNearby()).toHaveLength(0);
    expect(w.totalAbsorbed).toBe(0);
  });

  it("crossing a stage threshold advances evolutionStage", () => {
    const w = new World({ freeCount: 50, seed: "stage" });
    place(w.entityBodies[0], 0, 0);
    for (const b of w.freeBodies) place(b, 5000, 5000);
    // Force-absorb 6 cells to reach stage 1.
    for (let i = 0; i < 6; i++) {
      const free = w.freeBodies[0];
      place(free, 0, 0);
      w.capture(free);
    }
    expect(w.totalAbsorbed).toBe(6);
    expect(w.evolutionStage).toBe(1);
  });

  it("biome milestones fire as you cross thresholds (run stays endless)", () => {
    const w = new World({ freeCount: 1, seed: "transcend" });
    place(w.entityBodies[0], 0, 0);
    for (let i = 0; i < 80; i++) {
      const f: Body = {
        id: `synth-${i}`,
        type: "propulsion",
        kind: "free",
        radius: 7,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      w.freeBodies.push(f);
      w.capture(f);
      // Clear any boss spawned by the milestone so the test can keep
      // crossing thresholds — checkMilestones is now boss-gated.
      w.predators.length = 0;
    }
    expect(w.totalAbsorbed).toBeGreaterThanOrEqual(80);
    expect(w.runStatus).toBe("running"); // endless mode — never ends on absorb count
    // At least the first biome milestone should have fired during the loop.
    expect(w.events.some((e) => e === "biome:20")).toBe(true);
  });
});
