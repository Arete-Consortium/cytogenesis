import type { NodeTypeId } from "@/game/types";

/**
 * Trait set. Under the absorb-counter model the rule engine receives
 * per-NodeTypeId counts and emits a "level" per trait. Adding a new
 * trait is data-only — no engine code changes.
 */
export type TraitId = "propulsion" | "wide_capture" | "lock_on";

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
    description: "Tap distant prey or predators to engage. Requires both sensor and stinger.",
    evaluate: ({ absorbed }) =>
      Math.min(absorbed.sensor ?? 0, absorbed.stinger ?? 0),
  },
];
