import { describe, expect, it } from "vitest";
import { World, STAGE_THRESHOLDS } from "@/game/world";
import type { Body } from "@/game/types";

// Exercise public gameplay transitions with controlled contact fixtures.
// This verifies reachability, not a human player's ability to survive combat.
describe("browser playtest lifecycle", () => {
  it("contacts reach each evolution, resume after choices, transcend and finish after fatal damage", () => {
    const world = new World({ freeCount: 0, seed: "release-lifecycle" });
    try {
      const core = world.entityBodies[0];
      const chosenStages: number[] = [];
      for (let count = 1; count <= 81; count++) {
        const cell: Body = {
          id: `release-cell-${count}`, type: "propulsion", kind: "free", radius: 7,
          x: core.x, y: core.y, vx: 0, vy: 0,
        };
        world.freeBodies.push(cell);
        world.captureNearby();
        expect(world.totalAbsorbed).toBe(count);
        expect(world.freeBodies).not.toContain(cell);
        if (world.editor.open) {
          chosenStages.push(world.editor.triggeredStage);
          const timeBefore = world.wallMs;
          world.tick(100);
          expect(world.wallMs).toBe(timeBefore);
          expect(world.paused).toBe(true);
          world.selectEditorPart(world.editor.offerings[0]);
          expect(world.editor.open).toBe(false);
          expect(world.paused).toBe(false);
        }
      }
      expect(chosenStages).toEqual([1, 2, 3, 4, 5]);
      expect(world.placedParts).toHaveLength(STAGE_THRESHOLDS.length - 1);
      expect(world.events.filter((event) => event === "transcend")).toHaveLength(1);
      expect(world.evolutionStage).toBe(5);
      expect(world.peakCaptured).toBe(81);
      expect(world.runStatus).toBe("running");
      // Crossing 80 again after damage must not replay the badge event.
      world.damageAbsorbed(3);
      for (let count = 82; count <= 84; count++) {
        world.freeBodies.push({ id: `release-cell-${count}`, type: "propulsion", kind: "free", radius: 7, x: core.x, y: core.y });
        world.captureNearby();
        if (world.editor.open) world.closeEditor();
      }
      expect(world.events.filter((event) => event === "transcend")).toHaveLength(1);
      world.damageAbsorbed(100);
      expect(world.runStatus).toBe("dead");
      expect(world.totalAbsorbed).toBe(0);
      expect(world.peakCaptured).toBe(81);
      expect(world.events).toContain("death");
      // Match the UI's 800ms end-overlay gate, then verify time stops.
      for (let frame = 0; frame < 8; frame++) world.tick(100);
      expect(world.wallMs - world.runEndedAtMs!).toBeGreaterThanOrEqual(800);
      const endedTime = world.wallMs;
      world.tick(100);
      expect(world.wallMs).toBe(endedTime);
    } finally {
      world.dispose();
    }
  });
});
