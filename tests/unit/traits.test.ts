import { describe, expect, it } from "vitest";
import { recomputeTraits, emptyTraitState } from "@/game/traits";
import type { Body, Bond, NodeTypeId } from "@/game/types";

const body = (id: string, type: NodeTypeId): Body => ({
  id,
  type,
  kind: "captured",
  radius: 8,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
});

const bond = (sId: string, tId: string): Bond => ({
  id: `${sId}-${tId}`,
  source: sId,
  target: tId,
  strength: 1,
  formedAt: 0,
});

describe("recomputeTraits", () => {
  it("empty entity → no active traits", () => {
    const state = recomputeTraits([], []);
    expect(state.active.size).toBe(0);
    expect(state.speedMul).toBe(0);
    expect(state.lockOnRange).toBe(0);
  });

  it("propulsion stacks with each captured propulsion", () => {
    const bodies = [body("c", "core"), body("p1", "propulsion")];
    const bonds = [bond("c", "p1")];
    expect(recomputeTraits(bodies, bonds).levels.propulsion).toBe(1);

    bodies.push(body("p2", "propulsion"));
    bonds.push(bond("c", "p2"));
    const s = recomputeTraits(bodies, bonds);
    expect(s.levels.propulsion).toBe(2);
    expect(s.speedMul).toBeGreaterThan(0.5);
  });

  it("propulsion speedMul is capped at 1.2", () => {
    const bodies: Body[] = [body("c", "core")];
    const bonds: Bond[] = [];
    for (let i = 0; i < 10; i++) {
      bodies.push(body(`p${i}`, "propulsion"));
      bonds.push(bond("c", `p${i}`));
    }
    const s = recomputeTraits(bodies, bonds);
    expect(s.speedMul).toBe(1.2);
  });

  it("mouth grants wide_capture (radius bonus)", () => {
    const bodies = [body("c", "core"), body("m", "mouth")];
    const s = recomputeTraits(bodies, [bond("c", "m")]);
    expect(s.active.has("wide_capture")).toBe(true);
    expect(s.captureRadiusBonus).toBe(5);
  });

  it("sensor + stinger bonded pair grants lock_on", () => {
    const bodies = [body("c", "core"), body("s", "sensor"), body("g", "stinger")];
    const s = recomputeTraits(bodies, [bond("s", "g")]);
    expect(s.active.has("lock_on")).toBe(true);
    expect(s.lockOnRange).toBeGreaterThan(0);
  });

  it("sensor + stinger unbonded does NOT grant lock_on", () => {
    const bodies = [body("c", "core"), body("s", "sensor"), body("g", "stinger")];
    // Both bonded only to core, not to each other.
    const s = recomputeTraits(bodies, [bond("c", "s"), bond("c", "g")]);
    expect(s.active.has("lock_on")).toBe(false);
  });

  it("emptyTraitState is a clean baseline", () => {
    const s = emptyTraitState();
    expect(s.active.size).toBe(0);
    expect(s.captureRadiusBonus).toBe(0);
    expect(s.lockOnRange).toBe(0);
  });
});
