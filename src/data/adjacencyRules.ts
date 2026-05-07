import type { NodeTypeId } from "@/game/types";

/**
 * Phase 5 starter trait set. Three traits exercise both passive
 * (physics-modifier) and active (player-input) effect paths. More can
 * be added without touching engine code — this file is the contract.
 */
export type TraitId = "propulsion" | "wide_capture" | "lock_on";

/** What the rule engine sees about the current entity graph. */
export interface RuleCtx {
  /** Type of every captured body, in graph order. */
  entityTypes: NodeTypeId[];
  /** Pairs (sourceType, targetType) for each resolved bond. */
  bondedPairs: [NodeTypeId, NodeTypeId][];
}

export interface TraitDef {
  id: TraitId;
  /** Display name. Themes can override later via src/data/themes.ts. */
  name: string;
  description: string;
  /**
   * Returns the trait "level" — 0 means inactive, higher means stronger.
   * Trait runtime parameters (speedMul, range, etc.) scale off this.
   */
  evaluate(ctx: RuleCtx): number;
}

/** Helper: case-insensitive bonded-pair check. */
const hasBondedPair = (
  pairs: [NodeTypeId, NodeTypeId][],
  a: NodeTypeId,
  b: NodeTypeId,
): number =>
  pairs.filter(([s, t]) => (s === a && t === b) || (s === b && t === a)).length;

const countType = (types: NodeTypeId[], target: NodeTypeId): number =>
  types.filter((t) => t === target).length;

export const TRAIT_DEFS: TraitDef[] = [
  {
    id: "propulsion",
    name: "Propulsion",
    description: "Autonomous swim toward nearest prey. Stacks with each propulsion captured.",
    evaluate: ({ entityTypes }) => countType(entityTypes, "propulsion"),
  },
  {
    id: "wide_capture",
    name: "Wide Capture",
    description: "Capture reach extends with each mouth.",
    evaluate: ({ entityTypes }) => countType(entityTypes, "mouth"),
  },
  {
    id: "lock_on",
    name: "Lock-On",
    description: "Click distant prey to pull it home. Requires sensor bonded to stinger.",
    evaluate: ({ bondedPairs }) => hasBondedPair(bondedPairs, "sensor", "stinger"),
  },
];
