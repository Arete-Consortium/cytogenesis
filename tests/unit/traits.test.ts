import { describe, expect, it } from "vitest";
import { recomputeTraits, emptyTraitState } from "@/game/traits";
import type { NodeTypeId } from "@/game/types";

const absorbed = (overrides: Partial<Record<NodeTypeId, number>> = {}): Record<NodeTypeId, number> => ({
  core: 1,
  propulsion: 0,
  sensor: 0,
  membrane: 0,
  mouth: 0,
  stinger: 0,
  chloroplast: 0,
  mitochondrion: 0,
  spore: 0,
  ...overrides,
});

describe("recomputeTraits", () => {
  it("empty entity → no active traits", () => {
    const state = recomputeTraits(absorbed());
    expect(state.active.size).toBe(0);
    expect(state.speedMul).toBe(0);
    expect(state.lockOnRange).toBe(0);
  });

  it("propulsion stacks with each propulsion absorbed", () => {
    expect(recomputeTraits(absorbed({ propulsion: 1 })).levels.propulsion).toBe(1);
    const s = recomputeTraits(absorbed({ propulsion: 2 }));
    expect(s.levels.propulsion).toBe(2);
    expect(s.speedMul).toBeGreaterThan(0.5);
  });

  it("propulsion speedMul is capped at 1.2", () => {
    const s = recomputeTraits(absorbed({ propulsion: 10 }));
    expect(s.speedMul).toBe(1.2);
  });

  it("mouth grants wide_capture (radius bonus)", () => {
    const s = recomputeTraits(absorbed({ mouth: 1 }));
    expect(s.active.has("wide_capture")).toBe(true);
    expect(s.captureRadiusBonus).toBe(5);
  });

  it("sensor + stinger together grant lock_on", () => {
    const s = recomputeTraits(absorbed({ sensor: 1, stinger: 1 }));
    expect(s.active.has("lock_on")).toBe(true);
    expect(s.lockOnRange).toBeGreaterThan(0);
  });

  it("sensor without stinger does NOT grant lock_on", () => {
    const s = recomputeTraits(absorbed({ sensor: 3 }));
    expect(s.active.has("lock_on")).toBe(false);
  });

  it("emptyTraitState is a clean baseline", () => {
    const s = emptyTraitState();
    expect(s.active.size).toBe(0);
    expect(s.captureRadiusBonus).toBe(0);
    expect(s.lockOnRange).toBe(0);
  });
});
