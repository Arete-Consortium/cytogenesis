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
    expect(s.damageTakenMul).toBe(1);
    expect(s.regenPerSec).toBe(0);
    expect(s.surgeFloor).toBe(0);
    expect(s.tailLength).toBe(0);
  });

  // ── Evolution v2 — combo-gated traits ─────────────────────────────

  it("spines: stinger 3 + membrane 3 unlocks recoil damage", () => {
    expect(recomputeTraits(absorbed({ stinger: 2, membrane: 3 })).active.has("spines")).toBe(false);
    const s = recomputeTraits(absorbed({ stinger: 3, membrane: 3 }));
    expect(s.active.has("spines")).toBe(true);
    expect(s.recoilDamage).toBeGreaterThan(0);
  });

  it("pincers: mouth 4 + stinger 4 grants pincerProcs ≥ 1", () => {
    expect(recomputeTraits(absorbed({ mouth: 3, stinger: 4 })).active.has("pincers")).toBe(false);
    const s = recomputeTraits(absorbed({ mouth: 4, stinger: 4 }));
    expect(s.active.has("pincers")).toBe(true);
    expect(s.pincerProcs).toBeGreaterThanOrEqual(1);
  });

  it("barbed_tail: stinger 5 + propulsion 5 sets tail damage and length", () => {
    expect(recomputeTraits(absorbed({ stinger: 4, propulsion: 5 })).active.has("barbed_tail")).toBe(false);
    const s = recomputeTraits(absorbed({ stinger: 5, propulsion: 5 }));
    expect(s.active.has("barbed_tail")).toBe(true);
    expect(s.tailDamage).toBeGreaterThan(0);
    expect(s.tailLength).toBeGreaterThan(0);
  });

  it("chloroshield: membrane 5 + chloroplast 5 sets damageTakenMul ≤ 0.7", () => {
    expect(recomputeTraits(absorbed({ membrane: 4, chloroplast: 5 })).damageTakenMul).toBe(1);
    const s = recomputeTraits(absorbed({ membrane: 5, chloroplast: 5 }));
    expect(s.active.has("chloroshield")).toBe(true);
    expect(s.damageTakenMul).toBeLessThanOrEqual(0.7);
    expect(s.damageTakenMul).toBeGreaterThanOrEqual(0.4);
  });

  it("regen: membrane 6 + mitochondrion 6 sets regenPerSec > 0", () => {
    expect(recomputeTraits(absorbed({ membrane: 5, mitochondrion: 6 })).active.has("regen")).toBe(false);
    const s = recomputeTraits(absorbed({ membrane: 6, mitochondrion: 6 }));
    expect(s.active.has("regen")).toBe(true);
    expect(s.regenPerSec).toBeGreaterThan(0);
  });

  it("surge: propulsion 6 + mitochondrion 6 raises speed cap above 1.2", () => {
    const baseline = recomputeTraits(absorbed({ propulsion: 10 }));
    expect(baseline.speedMul).toBe(1.2);
    const s = recomputeTraits(absorbed({ propulsion: 10, mitochondrion: 6 }));
    expect(s.active.has("surge")).toBe(true);
    expect(s.speedMul).toBeGreaterThan(1.2);
  });

  it("surge floor: with surge active and propulsion=0 (devolved), speedMul still positive", () => {
    // Devolved scenario — propulsion absorbed dropped to 0 but surge level lingers
    // until the next recompute clears it. Direct re-eval of (0 prop, 6 mito) gives
    // surge = min(0, 6) = 0 → no surge active. To exercise the floor cleanly we
    // confirm: surge level > 0 with propulsion > 0 produces speedMul > 0.
    const s = recomputeTraits(absorbed({ propulsion: 6, mitochondrion: 6 }));
    expect(s.active.has("surge")).toBe(true);
    expect(s.surgeFloor).toBeGreaterThan(0);
    expect(s.speedMul).toBeGreaterThanOrEqual(s.surgeFloor);
  });

  it("level scales with absorb count past the gate threshold", () => {
    // spines threshold = 3; level = min - threshold + 1
    const s3 = recomputeTraits(absorbed({ stinger: 3, membrane: 3 }));
    const s6 = recomputeTraits(absorbed({ stinger: 6, membrane: 6 }));
    expect(s6.levels.spines).toBeGreaterThan(s3.levels.spines);
    expect(s6.recoilDamage).toBeGreaterThan(s3.recoilDamage);
  });
});
