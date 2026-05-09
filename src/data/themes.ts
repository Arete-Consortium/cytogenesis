import type { NodeTypeId, Body, BossKind } from "@/game/types";
import { NODE_COLOR } from "./nodeTypes";
import type { World } from "@/game/world";
import { sushiOverrides, sushiPreviewSvg } from "./themes-sushi";
import { galacticOverrides, galacticPreviewSvg } from "./themes-galactic";
import { yokaiOverrides, yokaiPreviewSvg } from "./themes-yokai";

/**
 * Theme = palette + glyph mapping over the theme-neutral game state.
 * Per CLAUDE.md: themes are paint, not logic. Game systems must NEVER
 * branch on theme — only render.ts reads from here. Themes may
 * additionally provide optional draw overrides — render.ts and parts.ts
 * dispatch via `(theme.drawX ?? defaultDrawX)(...)`.
 */

export type ThemeId = "aquatic" | "galactic" | "sushi" | "yokai";

/** Tutorial verb shown on the play screen. */
export interface TutorialCopy {
  /** Verb fragment for the swim hint, e.g. "scamper" / "fly" / "drift". */
  swim: string;
}

/** Evolution-store / part-pick UI copy. Theme-driven so the cat picks
 *  sushi, the UFO installs modules, the spirit claims relics. */
export interface EvolutionCopy {
  /** Section header, e.g. "EVOLUTION", "UPGRADE STATION", "ASCENSION". */
  title: string;
  /** Subhead prompt, e.g. "choose an organelle", "install a module". */
  prompt: string;
  /** Per-NodeType label shown on each part offering tile. */
  partLabels: Record<NodeTypeId, string>;
  /** One-line blurb under the part name on each tile. */
  partBlurbs: Record<NodeTypeId, string>;
  /** Trait-toast labels — overrides the engine's TraitId→string map.
   *  Partial because not every trait needs a flavored name per theme. */
  traitLabels: Record<string, string>;
}

/** Optional draw overrides — bell, parts, predators. */
export interface ThemeOverrides {
  drawCore?: (ctx: CanvasRenderingContext2D, world: World, core: Body) => void;
  drawSpines?: (ctx: CanvasRenderingContext2D, world: World) => void;
  drawPincers?: (ctx: CanvasRenderingContext2D, world: World) => void;
  drawBarbedTail?: (ctx: CanvasRenderingContext2D, world: World) => void;
  drawChloroshield?: (ctx: CanvasRenderingContext2D, world: World) => void;
  drawRegenGlow?: (ctx: CanvasRenderingContext2D, world: World) => void;
  drawSurgeWake?: (ctx: CanvasRenderingContext2D, world: World) => void;
  drawSkirmisher?: (ctx: CanvasRenderingContext2D, body: Body, t: number) => void;
  drawCentipede?: (ctx: CanvasRenderingContext2D, world: World) => void;
  /**
   * Free-cell glyph override. If defined, replaces the default
   * `SHAPE_DRAWERS[body.type]` dispatch entirely — the override is
   * responsible for switching on body.type internally and drawing each.
   * Use to re-skin collectibles to theme-specific items (e.g. yokai
   * folklore artifacts: mochi, magatama, ofuda, koban, kitsune-bi).
   */
  drawFreeCellShape?: (ctx: CanvasRenderingContext2D, body: Body, t: number) => void;
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** Vertical bg gradient stops (top → bottom). */
  bg: [string, string, string];
  /**
   * Flat bg color tonally matched to the env-CA bloom — used as a
   * uniform fill so areas without CA contribution don't read as
   * "voids" against a contrasting gradient.
   */
  bgFlat: string;
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
  /** Tutorial copy — theme-specific verbs. */
  tutorial: TutorialCopy;
  /** Boss-bar names per BossKind. Defaults to the microbe taxonomy when unset. */
  bossLabels: Record<BossKind, string>;
  /** Evolution-store copy: section title, prompt, part labels + blurbs, trait toasts. */
  evolution: EvolutionCopy;
  /** Inline SVG markup used as a preview chip in ThemePicker. ~28×28. */
  previewSvg: string;
  /** Optional render overrides (bell, parts, predators). */
  overrides?: ThemeOverrides;
}

const AQUATIC: Theme = {
  id: "aquatic",
  name: "Aquatic",
  bg: ["#0c2440", "#061a30", "#020812"],
  bgFlat: "#0e2c2f",
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
  tutorial: { swim: "drift" },
  bossLabels: {
    centipede: "SPIROCHETE",
    swarmLord: "VOLVOX",
    tideMaw: "AMOEBA",
    phage: "PHAGE",
    ciliate: "CILIATE",
    abyssEye: "ABYSS EYE",
  },
  evolution: {
    title: "EVOLUTION",
    prompt: "choose an organelle",
    partLabels: {
      core: "Core",
      propulsion: "Propulsion",
      sensor: "Sensor",
      membrane: "Membrane",
      mouth: "Mouth",
      stinger: "Stinger",
      chloroplast: "Chloroplast",
      mitochondrion: "Mitochondrion",
      spore: "Spore",
    },
    partBlurbs: {
      core: "the bell",
      propulsion: "faster, snappier",
      sensor: "wider lock-on",
      membrane: "armored hide",
      mouth: "wider capture",
      stinger: "hits harder",
      chloroplast: "passive regen",
      mitochondrion: "shorter cooldown",
      spore: "orbiting swarm",
    },
    traitLabels: {
      propulsion: "Propulsion",
      wide_capture: "Wide Capture",
      lock_on: "Lock-On",
      spines: "Spines",
      pincers: "Pincers",
      barbed_tail: "Barbed Tail",
      chloroshield: "Chloroshield",
      regen: "Regeneration",
      surge: "Surge",
    },
  },
  previewSvg: `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="a-bell" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#dffbff" />
      <stop offset="100%" stop-color="#0891b2" />
    </radialGradient>
  </defs>
  <ellipse cx="16" cy="14" rx="9" ry="7" fill="url(#a-bell)" stroke="#0e7490" stroke-width="0.8" />
  <path d="M 9 14 Q 9 24 8 28" stroke="#22d3ee" stroke-width="1.2" fill="none" />
  <path d="M 13 14 Q 13 26 12 30" stroke="#22d3ee" stroke-width="1.2" fill="none" />
  <path d="M 16 14 Q 16 26 16 30" stroke="#22d3ee" stroke-width="1.2" fill="none" />
  <path d="M 19 14 Q 19 26 20 30" stroke="#22d3ee" stroke-width="1.2" fill="none" />
  <path d="M 23 14 Q 23 24 24 28" stroke="#22d3ee" stroke-width="1.2" fill="none" />
</svg>`.trim(),
  // No overrides — aquatic uses default abstract bell + microbe predators.
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
  bgFlat: "#221530",
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
  tutorial: { swim: "fly" },
  bossLabels: {
    centipede: "DREADNOUGHT",
    swarmLord: "MOTHERSHIP",
    tideMaw: "MIMIC CRAFT",
    phage: "VIRION CRUISER",
    ciliate: "SCOUT SWARM",
    abyssEye: "VOID WATCHER",
  },
  evolution: {
    title: "UPGRADE STATION",
    prompt: "install a module",
    partLabels: {
      core: "Command Module",
      propulsion: "Thrusters",
      sensor: "Scanner Array",
      membrane: "Hull Plating",
      mouth: "Tractor Scoop",
      stinger: "Laser Cannon",
      chloroplast: "Solar Panel",
      mitochondrion: "Reactor Core",
      spore: "Drone Bay",
    },
    partBlurbs: {
      core: "the saucer",
      propulsion: "more sub-light",
      sensor: "extended range",
      membrane: "harder shell",
      mouth: "wider scoop",
      stinger: "more firepower",
      chloroplast: "passive shield charge",
      mitochondrion: "faster recharge",
      spore: "drone escort",
    },
    traitLabels: {
      propulsion: "Sub-Light Drive",
      wide_capture: "Wide Tractor",
      lock_on: "Targeting Lock",
      spines: "Boarding Spikes",
      pincers: "Tractor Claws",
      barbed_tail: "Cluster Missiles",
      chloroshield: "Force Field",
      regen: "Self-Repair",
      surge: "Warp Drive",
    },
  },
  previewSvg: galacticPreviewSvg,
  overrides: galacticOverrides,
};

/**
 * Sushi skin — Maneki-neko collecting sushi vs. octopus predators.
 * Reuses the aquatic palette but overrides bell + skirmisher + centipede
 * + all 6 composed parts via Theme.overrides. Free cells stay on the
 * default palette (sushi-glyph override deferred to follow-up).
 */
const SUSHI: Theme = {
  ...AQUATIC,
  id: "sushi",
  name: "Sushi",
  bg: ["#15243f", "#0a162e", "#020812"],
  bgFlat: "#101a30",
  ambient: "rgba(255, 230, 200,",
  shaft: "rgba(255, 220, 180,",
  ca: { r: 230, g: 200, b: 140, a: 22 },
  bell: AQUATIC.bell,
  combo: AQUATIC.combo,
  predator: {
    ...AQUATIC.predator,
    bodyDark: "#5a1230",
    bodyLit: "#a23054",
    halo0: "rgba(180, 60, 90, 0.42)",
    halo1: "rgba(180, 60, 90, 0)",
    rim: "rgba(255, 200, 220, 0.5)",
  },
  brute: AQUATIC.brute,
  telegraph: "rgba(239, 68, 68,",
  tracer: "rgba(255, 220, 150,",
  nodeColors: NODE_COLOR,
  tutorial: { swim: "scamper" },
  bossLabels: {
    centipede: "TAKO-RENJI",
    swarmLord: "OCTOPUS QUEEN",
    tideMaw: "MIMIC OCTOPUS",
    phage: "RAZOR EEL",
    ciliate: "STARFISH",
    abyssEye: "ABYSS GAZER",
  },
  evolution: {
    title: "SUSHI BAR",
    prompt: "claim a piece",
    partLabels: {
      core: "Maneki-neko",
      propulsion: "Ebi Nigiri",
      sensor: "Tamago",
      membrane: "Onigiri",
      mouth: "Maguro",
      stinger: "Tekka Maki",
      chloroplast: "Kappa Maki",
      mitochondrion: "Uni Gunkan",
      spore: "Gari",
    },
    partBlurbs: {
      core: "lucky cat",
      propulsion: "shrimp — quicker paws",
      sensor: "egg — sharper eyes",
      membrane: "rice — tougher fur",
      mouth: "tuna — wider gobble",
      stinger: "tuna roll — sharper bite",
      chloroplast: "cucumber — slow heal",
      mitochondrion: "sea urchin — faster recovery",
      spore: "ginger — kitten cohort",
    },
    traitLabels: {
      propulsion: "Quick Paws",
      wide_capture: "Wide Mouth",
      lock_on: "Crosshair Eye",
      spines: "Cat Claws",
      pincers: "Cat Fangs",
      barbed_tail: "Sushi Skewer Tail",
      chloroshield: "Matcha Halo",
      regen: "Calligraphy Ring",
      surge: "Paw-Print Wake",
    },
  },
  previewSvg: sushiPreviewSvg,
  overrides: sushiOverrides,
};

/**
 * Yokai skin — Hitodama spirit-flame collecting folkloric offerings vs.
 * yokai. Night-time supernatural palette (deep purple, cyan glow,
 * vermillion accents). Full override surface including drawFreeCellShape
 * — free cells render as folklore artifacts (mochi, magatama, ofuda,
 * tanto, sakaki, koban, kitsune-bi, geta).
 */
const YOKAI: Theme = {
  ...AQUATIC,
  id: "yokai",
  name: "Yokai",
  bg: ["#1a0a2e", "#0c0418", "#000004"],
  bgFlat: "#180a26",
  ambient: "rgba(220, 200, 255,",
  shaft: "rgba(255, 200, 220,",
  ca: { r: 200, g: 130, b: 220, a: 22 },
  bell: AQUATIC.bell,
  combo: AQUATIC.combo,
  predator: {
    ...AQUATIC.predator,
    halo0: "rgba(200, 40, 60, 0.42)",
    halo1: "rgba(200, 40, 60, 0)",
  },
  brute: AQUATIC.brute,
  telegraph: "rgba(220, 60, 80,",
  tracer: "rgba(220, 240, 255,",
  nodeColors: NODE_COLOR,
  tutorial: { swim: "drift" },
  bossLabels: {
    centipede: "HYAKKI YAGYOU",
    swarmLord: "JOROGUMO",
    tideMaw: "NUE",
    phage: "ROKUROKUBI",
    ciliate: "KAMAITACHI",
    abyssEye: "TENGU",
  },
  evolution: {
    title: "ASCENSION",
    prompt: "claim a relic",
    partLabels: {
      core: "Hitodama",
      propulsion: "Geta",
      sensor: "Magatama",
      membrane: "Ofuda",
      mouth: "Mochi",
      stinger: "Tanto",
      chloroplast: "Sakaki",
      mitochondrion: "Koban",
      spore: "Kitsune-bi",
    },
    partBlurbs: {
      core: "spirit-flame",
      propulsion: "sandal — wind step",
      sensor: "jewel — spirit sight",
      membrane: "talisman — warded skin",
      mouth: "rice cake — fuller offering",
      stinger: "blade — sharper strike",
      chloroplast: "branch — slow rejuvenation",
      mitochondrion: "coin — quicker fortune",
      spore: "fox-fire — wisp escort",
    },
    traitLabels: {
      propulsion: "Wind Step",
      wide_capture: "Open Mouth",
      lock_on: "Spirit Sight",
      spines: "Spirit Flames",
      pincers: "Oni Horns",
      barbed_tail: "Shimenawa Tail",
      chloroshield: "Talisman Barrier",
      regen: "Omikuji Ring",
      surge: "Sakura Wake",
    },
  },
  previewSvg: yokaiPreviewSvg,
  overrides: yokaiOverrides,
};

export const THEMES: Record<ThemeId, Theme> = {
  aquatic: AQUATIC,
  galactic: GALACTIC,
  sushi: SUSHI,
  yokai: YOKAI,
};

let _current: Theme = AQUATIC;

export function currentTheme(): Theme {
  return _current;
}

export function setTheme(id: ThemeId): void {
  _current = THEMES[id];
}
