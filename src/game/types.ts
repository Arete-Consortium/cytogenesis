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
export interface Body extends SimulationNodeDatum {
  id: string;
  type: NodeTypeId;
  kind: "captured" | "free" | "predator";
  radius: number;
  /** Lock-on flag: integrator routes this cell home to the core. Cleared on capture. */
  magnetized?: boolean;
  /** Predator-only: physics tick at which recoil ends and AI resumes. */
  recoilUntil?: number;
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
