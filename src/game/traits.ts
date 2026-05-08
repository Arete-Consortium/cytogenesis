import { TRAIT_DEFS, type TraitId } from "@/data/adjacencyRules";
import type { NodeTypeId } from "./types";

/**
 * Snapshot of derived gameplay parameters. Recomputed only on
 * graph-mutation hooks (capture / damage). Physics reads from this;
 * the trait engine writes it.
 */
export interface TraitState {
  active: Set<TraitId>;
  levels: Record<TraitId, number>;
  /** Multiplier on autonomous-swim acceleration. 0 = no swim. */
  speedMul: number;
  /** Extra world units added to the contact threshold. */
  captureRadiusBonus: number;
  /** Click-to-pull range. 0 disables. */
  lockOnRange: number;
  /** Cooldown after a lock-on fires. */
  lockOnCooldownMs: number;
  // ── Evolution v2 effects (additive — multiple may apply together) ──
  /** spines: damage dealt to predators on contact. 0 = inactive. */
  recoilDamage: number;
  /** chloroshield: incoming damage multiplier (1 = no reduction, 0.7 = -30%). */
  damageTakenMul: number;
  /** regen: HP per second restored, capped at run-start HP. */
  regenPerSec: number;
  /** surge: floor added to speedMul; effective swim = max(speedMul, surgeFloor). */
  surgeFloor: number;
  /** pincers: bonus stinger procs per free-cell capture. */
  pincerProcs: number;
  /** barbed_tail: tail damage per tick of contact. 0 = inactive. */
  tailDamage: number;
  /** barbed_tail: tail length in world units (driven by level). */
  tailLength: number;
}

export function emptyTraitState(): TraitState {
  return {
    active: new Set(),
    levels: {
      propulsion: 0,
      wide_capture: 0,
      lock_on: 0,
      spines: 0,
      pincers: 0,
      barbed_tail: 0,
      chloroshield: 0,
      regen: 0,
      surge: 0,
    },
    speedMul: 0,
    captureRadiusBonus: 0,
    lockOnRange: 0,
    lockOnCooldownMs: 1500,
    recoilDamage: 0,
    damageTakenMul: 1,
    regenPerSec: 0,
    surgeFloor: 0,
    pincerProcs: 0,
    tailDamage: 0,
    tailLength: 0,
  };
}

/**
 * Compute traits from per-NodeTypeId absorb counts. Under the
 * absorb-counter model the player's "graph" is just these counts —
 * no bonded pairs exist, so trait rules read counts directly.
 */
export function recomputeTraits(absorbed: Record<NodeTypeId, number>): TraitState {
  const ctx = { absorbed };
  const state = emptyTraitState();
  for (const def of TRAIT_DEFS) {
    const level = def.evaluate(ctx);
    state.levels[def.id] = level;
    if (level > 0) state.active.add(def.id);
  }
  // Translate levels into runtime numbers.
  const surgeLevel = state.levels.surge;
  const surgeBonus = surgeLevel > 0 ? Math.min(0.4, surgeLevel * 0.1) : 0;
  const surgeFloor = surgeLevel > 0 ? 0.3 : 0;
  const speedFromProp = state.levels.propulsion * 0.45;
  state.speedMul = Math.max(surgeFloor, Math.min(1.2 + surgeBonus, speedFromProp));
  state.captureRadiusBonus = Math.min(15, state.levels.wide_capture * 5);
  state.lockOnRange = state.levels.lock_on > 0 ? 250 + state.levels.lock_on * 80 : 0;
  // Mitochondrion absorbs reduce lock-on cooldown — base 1500ms, -100ms
  // per mito, floor 500ms (10 mitos = max recharge speed).
  const mito = absorbed.mitochondrion ?? 0;
  state.lockOnCooldownMs = Math.max(500, 1500 - mito * 100);
  // ── Evolution v2 runtime values. Each scales with its own level so
  //    the visual-cap-of-3 logic can dim the effect of trimmed parts.
  state.recoilDamage = state.levels.spines > 0 ? Math.max(1, Math.floor(state.levels.spines / 2)) : 0;
  state.damageTakenMul = state.levels.chloroshield > 0
    ? Math.max(0.4, 1 - 0.3 - Math.min(0.2, (state.levels.chloroshield - 1) * 0.05))
    : 1;
  state.regenPerSec = state.levels.regen > 0 ? 0.25 + state.levels.regen * 0.1 : 0;
  state.surgeFloor = surgeFloor;
  state.pincerProcs = state.levels.pincers > 0 ? 1 + Math.floor((state.levels.pincers - 1) / 3) : 0;
  state.tailDamage = state.levels.barbed_tail > 0 ? Math.max(1, Math.floor(state.levels.barbed_tail / 2)) : 0;
  state.tailLength = state.levels.barbed_tail > 0 ? 60 + state.levels.barbed_tail * 8 : 0;
  return state;
}
