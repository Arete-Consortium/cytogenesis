import { TRAIT_DEFS, type TraitId } from "@/data/adjacencyRules";
import type { Body, Bond, NodeTypeId } from "./types";

/**
 * Snapshot of derived gameplay parameters. Recomputed only when the
 * entity graph mutates (capture / loss) — never per frame. Physics
 * code reads from this; the trait engine writes it.
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
  /** Cooldown after a lock-on fires. Shrinks with stinger count later. */
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

/** Resolve a bond endpoint that may still be a string id (pre-tick). */
function resolveBody(ref: string | Body, byId: Map<string, Body>): Body | null {
  if (typeof ref === "string") return byId.get(ref) ?? null;
  return ref;
}

export function recomputeTraits(entityBodies: Body[], bonds: Bond[]): TraitState {
  const byId = new Map(entityBodies.map((b) => [b.id, b]));
  const entityTypes: NodeTypeId[] = entityBodies.map((b) => b.type);
  const bondedPairs: [NodeTypeId, NodeTypeId][] = [];
  for (const bond of bonds) {
    const s = resolveBody(bond.source as string | Body, byId);
    const t = resolveBody(bond.target as string | Body, byId);
    if (!s || !t) continue;
    bondedPairs.push([s.type, t.type]);
  }
  const ctx = { entityTypes, bondedPairs };
  const state = emptyTraitState();
  for (const def of TRAIT_DEFS) {
    const level = def.evaluate(ctx);
    state.levels[def.id] = level;
    if (level > 0) state.active.add(def.id);
  }
  // Translate levels into runtime numbers. Curves chosen so each new
  // node feels meaningful but stacking has diminishing returns.
  state.speedMul = Math.min(1.2, state.levels.propulsion * 0.45);
  state.captureRadiusBonus = Math.min(15, state.levels.wide_capture * 5);
  state.lockOnRange = state.levels.lock_on > 0 ? 250 + state.levels.lock_on * 80 : 0;
  return state;
}
