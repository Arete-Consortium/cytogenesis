import type { SimulationLinkDatum, SimulationNodeDatum } from "d3";

export type NodeTypeId =
  | "core"
  | "propulsion"
  | "sensor"
  | "membrane"
  | "mouth"
  | "stinger"
  | "chloroplast"
  | "mitochondrion"
  | "spore";

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A physical body in the world. d3-force mutates x/y/vx/vy each tick;
 * fx/fy pin a body in place (used during drag). `kind` tags whether the
 * body is part of the player's entity graph or a free-floating cell.
 */
export type PredatorVariant = "skirmisher" | "brute";
export type BossKind = "swarmLord" | "tideMaw" | "abyssEye" | "centipede";

export interface Body extends SimulationNodeDatum {
  id: string;
  type: NodeTypeId;
  kind: "captured" | "free" | "predator" | "rival";
  radius: number;
  /** Predator-only: physics tick at which recoil ends and AI resumes. */
  recoilUntil?: number;
  /** Predator-only: visual + behavior variant. */
  variant?: PredatorVariant;
  /** Predator-only: HP. Reaches ≤0 → killed. */
  health?: number;
  /** Predator-only: marks this body as a boss with a specific personality. */
  bossKind?: BossKind;
  /** Centipede segment marker: index in chain (0 = head, 1+ = segments). */
  segmentIndex?: number;
  /** Free-cell wander heading (rad) — drifts slowly so motion has intent
   *  instead of pure jitter. */
  wanderAngle?: number;
  /** Free-cell tempo phase — drives a slow speed pulse so the cell
   *  breathes in/out instead of moving at constant cadence. */
  tempoPhase?: number;
}

/** Camera transform — matches d3.zoomTransform shape (k, x, y). */
export interface Camera {
  k: number;
  x: number;
  y: number;
}

/**
 * A bond between two captured nodes. d3.forceLink mutates source/target
 * from id-strings to resolved Body refs after the link force initializes;
 * SimulationLinkDatum captures both shapes.
 */
export interface Bond extends SimulationLinkDatum<Body> {
  id: string;
  /** Bond stiffness 0..1. Phase 2 always 1.0; Phase 5 trait-CA may vary it. */
  strength: number;
  /** Tick at which the bond formed — for capture animation in polish. */
  formedAt: number;
}
