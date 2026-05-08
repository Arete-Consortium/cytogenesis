import { describe, expect, it } from "vitest";
import { World } from "@/game/world";
import type { Body } from "@/game/types";

// Use propulsion so absorbed.membrane stays 0 — membrane armor would
// otherwise reduce the damage the tests are measuring.
const synth = (i: number): Body => ({
  id: `synth-${i}`,
  type: "propulsion",
  kind: "free",
  radius: 7,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
});

describe("World.damageAbsorbed", () => {
  it("decrements absorbed counts + total", () => {
    const w = new World({ freeCount: 1, seed: "damage" });
    for (let i = 0; i < 10; i++) {
      const f = synth(i);
      w.freeBodies.push(f);
      w.capture(f);
    }
    expect(w.totalAbsorbed).toBe(10);
    w.damageAbsorbed(3);
    expect(w.totalAbsorbed).toBe(7);
  });

  it("crossing a stage boundary downward fires devolve event", () => {
    const w = new World({ freeCount: 1, seed: "devolve" });
    for (let i = 0; i < 7; i++) {
      const f = synth(i);
      w.freeBodies.push(f);
      w.capture(f);
    }
    expect(w.evolutionStage).toBe(1);
    w.events.length = 0;
    w.damageAbsorbed(2); // 7 → 5, drops below stage 1 threshold (6)
    expect(w.evolutionStage).toBe(0);
    expect(w.events.some((e) => e === "devolve:0")).toBe(true);
  });

  it("damage past available absorbed kills the run", () => {
    const w = new World({ freeCount: 1, seed: "death" });
    for (let i = 0; i < 2; i++) {
      const f = synth(i);
      w.freeBodies.push(f);
      w.capture(f);
    }
    expect(w.totalAbsorbed).toBe(2);
    w.damageAbsorbed(5);
    expect(w.totalAbsorbed).toBe(0);
    expect(w.runStatus).toBe("dead");
  });
});

describe("World run lifecycle", () => {
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
