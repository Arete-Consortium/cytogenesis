import type { NodeTypeId } from "@/game/types";

/**
 * Trait set. Under the absorb-counter model the rule engine receives
 * per-NodeTypeId counts and emits a "level" per trait. Adding a new
 * trait is data-only — no engine code changes.
 */
export type TraitId =
  | "propulsion"
  | "wide_capture"
  | "lock_on"
  // Evolution v2 — combo-gated traits with composed-part rendering.
  | "spines"
  | "pincers"
  | "barbed_tail"
  | "chloroshield"
  | "regen"
  | "surge";

/** Helper: gate level on the minimum of two absorb counts above a threshold. */
function comboGate(a: number, b: number, threshold: number): number {
  const m = Math.min(a, b);
  return m >= threshold ? m - threshold + 1 : 0;
}

export interface RuleCtx {
  /** Per-NodeTypeId absorbed counts (incl. 'core': 1). */
  absorbed: Record<NodeTypeId, number>;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  evaluate(ctx: RuleCtx): number;
}

export const TRAIT_DEFS: TraitDef[] = [
  {
    id: "propulsion",
    name: "Propulsion",
    description: "Autonomous swim toward nearest prey. Stacks with each propulsion absorbed.",
    evaluate: ({ absorbed }) => absorbed.propulsion ?? 0,
  },
  {
    id: "wide_capture",
    name: "Wide Capture",
    description: "Capture reach extends with each mouth absorbed.",
    evaluate: ({ absorbed }) => absorbed.mouth ?? 0,
  },
  {
    id: "lock_on",
    name: "Lock-On",
    description:
      "Press the Attack button to fire a stinger at the nearest predator in range. Requires both sensor and stinger.",
    evaluate: ({ absorbed }) =>
      Math.min(absorbed.sensor ?? 0, absorbed.stinger ?? 0),
  },
  // ── Evolution v2 — composed-part traits. Levels gate visual size and
  //    the magnitude of the underlying effect. ─────────────────────────
  {
    id: "spines",
    name: "Spines",
    description: "Predator contact deals recoil damage to the attacker.",
    evaluate: ({ absorbed }) => comboGate(absorbed.stinger ?? 0, absorbed.membrane ?? 0, 3),
  },
  {
    id: "pincers",
    name: "Pincers",
    description: "Each free-cell capture procs a stinger hit on the nearest predator.",
    evaluate: ({ absorbed }) => comboGate(absorbed.mouth ?? 0, absorbed.stinger ?? 0, 4),
  },
  {
    id: "barbed_tail",
    name: "Barbed Tail",
    description: "A trailing barb damages predators that pass behind your motion vector.",
    evaluate: ({ absorbed }) => comboGate(absorbed.stinger ?? 0, absorbed.propulsion ?? 0, 5),
  },
  {
    id: "chloroshield",
    name: "Chloroshield",
    description: "A photosynthetic halo absorbs 30% of incoming damage.",
    evaluate: ({ absorbed }) => comboGate(absorbed.membrane ?? 0, absorbed.chloroplast ?? 0, 5),
  },
  {
    id: "regen",
    name: "Regeneration",
    description: "Slowly recover health over time. Capped at run-start HP.",
    evaluate: ({ absorbed }) => comboGate(absorbed.membrane ?? 0, absorbed.mitochondrion ?? 0, 6),
  },
  {
    id: "surge",
    name: "Surge",
    description: "Mitochondrial overload raises your speed floor.",
    evaluate: ({ absorbed }) => comboGate(absorbed.propulsion ?? 0, absorbed.mitochondrion ?? 0, 6),
  },
];
