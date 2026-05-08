import type { NodeTypeId } from "@/game/types";
import { NODE_COLOR } from "./nodeTypes";

/**
 * Theme = palette + glyph mapping over the theme-neutral game state.
 * Per CLAUDE.md: themes are paint, not logic. Game systems must NEVER
 * branch on theme — only render.ts reads from here.
 */

export type ThemeId = "aquatic" | "galactic";

export interface Theme {
  id: ThemeId;
  name: string;
  /** Vertical bg gradient stops (top → bottom). */
  bg: [string, string, string];
  /** Drifting plankton / starlight motes. rgba prefix; alpha appended at draw. */
  ambient: string;
  /** Light shaft tint. rgba prefix; alpha appended. */
  shaft: string;
  /** Env CA bloom — pixel color + base alpha. */
  ca: { r: number; g: number; b: number; a: number };
  /** Bell sub-element colors. */
  bell: {
    halo0: string;
    halo1: string;
    bellInner: string;
    bellMid: string;
    bellOuter: string;
    rim: string;
    organ: string;
    highlight: string;
    tentacle0: string;
    tentacle1: string;
    /** Wake trail rgba prefix; alpha appended at draw. */
    trail: string;
  };
  /** Combo-buff halo colors. */
  combo: { halo0: string; halo1: string };
  /** Skirmisher predator. */
  predator: {
    halo0: string;
    halo1: string;
    bodyDark: string;
    bodyLit: string;
    bodyDarkRecoil: string;
    bodyLitRecoil: string;
    rim: string;
    teeth: string;
    eye: string;
    lure0: string;
    lure1: string;
    lureLine: string;
  };
  /** Brute predator. */
  brute: {
    halo0: string;
    halo1: string;
    bodyDark: string;
    bodyLit: string;
    bodyDarkRecoil: string;
    bodyLitRecoil: string;
    rim: string;
    teeth: string;
    eye: string;
    chitin: string;
  };
  /** Telegraph chevron — rgba prefix, alpha multiplied at draw. */
  telegraph: string;
  /** Lock-on tracer line. rgba prefix; alpha appended. */
  tracer: string;
  /** Node-type color map. Same NodeTypeId, different color. */
  nodeColors: Record<NodeTypeId, string>;
}

const AQUATIC: Theme = {
  id: "aquatic",
  name: "Aquatic",
  bg: ["#0c2440", "#061a30", "#020812"],
  ambient: "rgba(190, 230, 255,",
  shaft: "rgba(180, 220, 255,",
  ca: { r: 96, g: 200, b: 190, a: 28 },
  bell: {
    halo0: "rgba(64, 220, 255, 0.28)",
    halo1: "rgba(64, 220, 255, 0)",
    bellInner: "rgba(220, 252, 255, 0.92)",
    bellMid: "rgba(64, 220, 255, 0.62)",
    bellOuter: "rgba(8, 145, 178, 0.22)",
    rim: "rgba(220, 252, 255, 0.45)",
    organ: "rgba(34, 211, 238, 0.55)",
    highlight: "rgba(255, 255, 255, 0.28)",
    tentacle0: "rgba(96, 240, 255, 0.7)",
    tentacle1: "rgba(64, 220, 255, 0)",
    trail: "rgba(64, 220, 255,",
  },
  combo: {
    halo0: "rgba(255, 215, 100, 0.42)",
    halo1: "rgba(255, 215, 100, 0)",
  },
  predator: {
    halo0: "rgba(220, 38, 38, 0.42)",
    halo1: "rgba(220, 38, 38, 0)",
    bodyDark: "#3a0e10",
    bodyLit: "#3a0e10",
    bodyDarkRecoil: "#1c0608",
    bodyLitRecoil: "#1c0608",
    rim: "rgba(254, 202, 202, 0.45)",
    teeth: "rgba(255, 240, 240, 0.85)",
    eye: "rgba(255, 230, 230, 0.85)",
    lure0: "rgba(255, 120, 120, 0.95)",
    lure1: "rgba(255, 80, 80, 0)",
    lureLine: "rgba(120, 30, 30, 0.7)",
  },
  brute: {
    halo0: "rgba(180, 20, 20, 0.5)",
    halo1: "rgba(180, 20, 20, 0)",
    bodyDark: "#1f0507",
    bodyLit: "#1f0507",
    bodyDarkRecoil: "#0e0303",
    bodyLitRecoil: "#0e0303",
    rim: "rgba(254, 130, 130, 0.6)",
    teeth: "rgba(255, 240, 240, 0.9)",
    eye: "rgba(255, 220, 220, 0.85)",
    chitin: "rgba(0, 0, 0, 0.55)",
  },
  telegraph: "rgba(239, 68, 68,",
  tracer: "rgba(96, 240, 255,",
  nodeColors: NODE_COLOR,
};

/**
 * Galactic palette. Same NodeTypeId glyphs, but recolored to read as
 * proto-civilization in the void: violet bell-hub, amber stellar
 * plankton, hot-orange predators (incoming fleet).
 */
const GALACTIC: Theme = {
  id: "galactic",
  name: "Galactic",
  bg: ["#1c0f3d", "#0a0530", "#020010"],
  ambient: "rgba(255, 240, 220,",
  shaft: "rgba(220, 200, 255,",
  ca: { r: 255, g: 170, b: 80, a: 24 },
  bell: {
    halo0: "rgba(167, 139, 250, 0.32)",
    halo1: "rgba(167, 139, 250, 0)",
    bellInner: "rgba(245, 240, 255, 0.92)",
    bellMid: "rgba(167, 139, 250, 0.62)",
    bellOuter: "rgba(91, 33, 182, 0.25)",
    rim: "rgba(245, 240, 255, 0.45)",
    organ: "rgba(196, 181, 253, 0.65)",
    highlight: "rgba(255, 255, 255, 0.32)",
    tentacle0: "rgba(196, 181, 253, 0.75)",
    tentacle1: "rgba(167, 139, 250, 0)",
    trail: "rgba(196, 181, 253,",
  },
  combo: {
    halo0: "rgba(250, 204, 21, 0.45)",
    halo1: "rgba(250, 204, 21, 0)",
  },
  predator: {
    halo0: "rgba(251, 146, 60, 0.45)",
    halo1: "rgba(251, 146, 60, 0)",
    bodyDark: "#3a1607",
    bodyLit: "#3a1607",
    bodyDarkRecoil: "#1c0a04",
    bodyLitRecoil: "#1c0a04",
    rim: "rgba(254, 215, 170, 0.5)",
    teeth: "rgba(255, 245, 230, 0.9)",
    eye: "rgba(255, 230, 200, 0.9)",
    lure0: "rgba(251, 191, 36, 0.95)",
    lure1: "rgba(245, 158, 11, 0)",
    lureLine: "rgba(120, 53, 15, 0.7)",
  },
  brute: {
    halo0: "rgba(200, 70, 20, 0.5)",
    halo1: "rgba(200, 70, 20, 0)",
    bodyDark: "#240a04",
    bodyLit: "#240a04",
    bodyDarkRecoil: "#0e0301",
    bodyLitRecoil: "#0e0301",
    rim: "rgba(254, 170, 100, 0.6)",
    teeth: "rgba(255, 245, 230, 0.92)",
    eye: "rgba(255, 230, 200, 0.85)",
    chitin: "rgba(0, 0, 0, 0.55)",
  },
  telegraph: "rgba(251, 146, 60,",
  tracer: "rgba(196, 181, 253,",
  nodeColors: {
    core: "#a78bfa",          // violet hub
    propulsion: "#22d3ee",    // thruster cyan
    sensor: "#fbbf24",        // sensor amber
    membrane: "#d4d4d8",      // hull plate
    mouth: "#fb923c",         // collector orange
    stinger: "#ef4444",       // warhead red
    chloroplast: "#4ade80",   // solar green
    mitochondrion: "#facc15", // reactor gold
    spore: "#f472b6",         // seed pink
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  aquatic: AQUATIC,
  galactic: GALACTIC,
};

let _current: Theme = AQUATIC;

export function currentTheme(): Theme {
  return _current;
}

export function setTheme(id: ThemeId): void {
  _current = THEMES[id];
}
