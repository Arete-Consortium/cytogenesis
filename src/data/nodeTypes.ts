import type { NodeTypeId } from "@/game/types";

/**
 * Theme-neutral palette. Themes (aquatic / galactic) re-skin via
 * src/data/themes.ts in Phase 8 — these defaults stand in until then.
 */
export const NODE_COLOR: Record<NodeTypeId, string> = {
  core: "#22d3ee",          // cyan — the player's seed
  propulsion: "#f59e0b",    // amber — flagellum / thruster
  sensor: "#a78bfa",        // violet — photoreceptor / scanner
  membrane: "#94a3b8",      // slate — armor / shield
  mouth: "#ef4444",         // red — ingestor / harvester
  stinger: "#ec4899",       // pink — weapon / drone-bay
  chloroplast: "#10b981",   // emerald — passive feeder
  mitochondrion: "#eab308", // yellow — energy storage
  spore: "#c084fc",         // light violet — mutation seed
};

export const NODE_RADIUS: Record<NodeTypeId, number> = {
  core: 18,
  propulsion: 7,
  sensor: 8,
  membrane: 10,
  mouth: 9,
  stinger: 8,
  chloroplast: 9,
  mitochondrion: 10,
  spore: 6,
};
