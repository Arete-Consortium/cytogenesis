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
}

export function emptyTraitState(): TraitState {
  return {
    active: new Set(),
    levels: { propulsion: 0, wide_capture: 0, lock_on: 0 },
    speedMul: 0,
    captureRadiusBonus: 0,
    lockOnRange: 0,
    lockOnCooldownMs: 1500,
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
  state.speedMul = Math.min(1.2, state.levels.propulsion * 0.45);
  state.captureRadiusBonus = Math.min(15, state.levels.wide_capture * 5);
  state.lockOnRange = state.levels.lock_on > 0 ? 250 + state.levels.lock_on * 80 : 0;
  // Mitochondrion absorbs reduce lock-on cooldown — base 1500ms, -100ms
  // per mito, floor 500ms (10 mitos = max recharge speed).
  const mito = absorbed.mitochondrion ?? 0;
  state.lockOnCooldownMs = Math.max(500, 1500 - mito * 100);
  return state;
}
