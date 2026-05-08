import * as d3 from "d3";
import type { Body, Bond, BossKind, Camera, NodeTypeId } from "./types";
import { NODE_RADIUS } from "@/data/nodeTypes";
import { rngFromSeed, type Rng } from "@/lib/rng";
import { buildQuadtree, rangeQuery, type BodyQuadtree } from "./quadtree";
import { EnvCA } from "./envCA";
import { emptyTraitState, recomputeTraits, type TraitState } from "./traits";

let nextId = 0;
const newId = (prefix: string) => `${prefix}-${nextId++}`;

const makeBody = (
  type: NodeTypeId,
  kind: Body["kind"],
  x: number,
  y: number,
  vx = 0,
  vy = 0,
): Body => ({
  id: newId(type),
  type,
  kind,
  radius: NODE_RADIUS[type],
  x,
  y,
  vx,
  vy,
});

/** Pad beyond hard-collide radius at which a free cell is grabbed. */
const CAPTURE_PAD = 2;
/** Free-cell speed cap (world units per tick). */
const MAX_FREE_SPEED = 1.1;
/** Per-tick random jitter applied to velocity (Brownian-flavored drift). */
const JITTER = 0.05;
/** Total absorbed at which the first 'transcend' event fires (badge milestone). */
const TRANSCEND_AT = 80;
/** Difficulty cycle length — every CYCLE_LEN absorbed bumps challenge. */
const CYCLE_LEN = 80;
/**
 * Cycle-based scalar with a knee. Pre-knee growth is exponential at
 * `fast` per cycle so early progression feels meaningful; past the knee
 * it slows to `slow` per cycle so endless runs stay solvable. Without
 * this cap, plain Math.pow(1.4, cycle) produced 38B-HP bosses by
 * cycle 62.
 */
const CYCLE_KNEE = 10;
function cycleScalar(cycle: number, fast: number, slow: number): number {
  const k = Math.min(cycle, CYCLE_KNEE);
  const tail = Math.max(0, cycle - CYCLE_KNEE);
  return Math.pow(fast, k) * Math.pow(slow, tail);
}
/** Soft-capped radius mul — cycle bonus plateaus so bosses don't fill the screen. */
function cycleRadiusMul(cycle: number): number {
  return 1 + Math.min(cycle, 8) * 0.05;
}
/** Evolution-stage thresholds — index = stage, value = totalAbsorbed required. */
export const STAGE_THRESHOLDS = [0, 6, 16, 32, 56, 80];
export const MAX_STAGE = STAGE_THRESHOLDS.length - 1;
/** Damage per predator hit (subtracted from totalAbsorbed). */
const HIT_DAMAGE_SKIRMISHER = 3;
const HIT_DAMAGE_BRUTE = 7;
/** Predator config — base values; variant-specific values applied at spawn. */
const PREDATOR_RADIUS_SKIRMISHER = 11;
const PREDATOR_RADIUS_BRUTE = 20;
const PREDATOR_SPEED_SKIRMISHER = 0.95;
const PREDATOR_SPEED_BRUTE = 0.45;
const PREDATOR_RECOIL_TICKS = 30;
const PREDATOR_BRUTE_PROB = 0.3;
const PREDATOR_FIRST_SPAWN_MS = 8000;
const PREDATOR_SPAWN_INTERVAL_MS = 5000;
const PREDATOR_MIN_SPAWN_DISTANCE = 400;
/** Warning window between telegraph appearance and predator materializing. */
const PREDATOR_TELEGRAPH_MS = 1500;
/** Free-cell types to sample from when scattering / respawning. */
const FREE_POOL: NodeTypeId[] = [
  "propulsion",
  "sensor",
  "membrane",
  "mouth",
  "stinger",
  "chloroplast",
  "mitochondrion",
  "spore",
];

/**
 * Biome ecosystem weights — relative spawn probability per type per
 * depth. Surface (stage 0) leans toward easy prey; abyss (stage 3+)
 * leans defensive + hostile so the player's build choices matter.
 */
const BIOME_WEIGHTS: Record<NodeTypeId, number>[] = [
  // Stage 0 — surface: lots of food, little defense
  { core: 0, propulsion: 4, sensor: 3, membrane: 1, mouth: 2, stinger: 1, chloroplast: 3, mitochondrion: 1, spore: 2 },
  // Stage 1 — twilight
  { core: 0, propulsion: 3, sensor: 3, membrane: 2, mouth: 2, stinger: 2, chloroplast: 2, mitochondrion: 2, spore: 2 },
  // Stage 2 — midnight: balanced
  { core: 0, propulsion: 2, sensor: 2, membrane: 3, mouth: 2, stinger: 3, chloroplast: 1, mitochondrion: 2, spore: 2 },
  // Stage 3 — abyss: scarce + dangerous
  { core: 0, propulsion: 1, sensor: 2, membrane: 4, mouth: 1, stinger: 4, chloroplast: 1, mitochondrion: 3, spore: 1 },
];

/**
 * Per-type skittishness — multiplier on the fear response when prey
 * detect the bell or a predator nearby. 0 = unflinching, 2 = manic
 * fluttering.
 */
const FEAR_BY_TYPE: Record<NodeTypeId, number> = {
  core: 0,
  propulsion: 1.7, // twitchy fast prey
  sensor: 1.5,    // alert
  spore: 1.0,
  mouth: 0.6,
  chloroplast: 0.8,
  mitochondrion: 0.7,
  stinger: 0.9,   // counter-attacker
  membrane: 0.4,  // sluggish
};
/** Bell fear range — cells inside accelerate away from the bell. */
const FEAR_RANGE_BELL = 110;
/** Predator fear range — cells inside scatter from predators. */
const FEAR_RANGE_PRED = 140;
/** Per-tick acceleration scaling for fear response. */
const FEAR_ACCEL = 0.55;

/** Events the world emits each tick — drained by the React layer. */
export type WorldEvent =
  | "capture"
  | "hit"
  | "lungeHit"
  | "transcend"
  | "death"
  | "lockOn"
  | "telegraph"
  | "combo"
  | "killPred"
  | "killBoss"
  | "bossSpawn"
  | "bossEnrage"
  | "bossWindup"
  | "bossLunge"
  | "phageFire"
  | "editorOpen"
  | "partPlaced"
  | `trait:${string}`
  | `biome:${number}`
  | `evolve:${number}`
  | `devolve:${number}`;

/** A part the player chose to attach to their bell at the editor. */
export interface PlacedPart {
  id: string;
  /** Organelle kind — drives glyph + behaviour hooks (visual only for now). */
  kind: NodeTypeId;
  /** Attachment angle in radians, world-space. -π..π. */
  angle: number;
  /** Tick at placement — used for a brief 'pop in' grow animation. */
  placedAtTickN: number;
}

/** Per-run editor state. Open while the player picks + places a part. */
export interface EditorState {
  open: boolean;
  /** Which kind the player picked from the offerings; null = still picking. */
  selectedKind: NodeTypeId | null;
  /** Three offerings drawn from unplaced types (or any if all placed). */
  offerings: NodeTypeId[];
  /** Stage that triggered this editor — prevents re-trigger. */
  triggeredStage: number;
}

/** Maximum parts the player can attach in a run (one per slot around the bell). */
const MAX_PLACED_PARTS = 8;

/** Capture-combo tuning. */
const COMBO_WINDOW_MS = 2000;
const COMBO_THRESHOLD = 3;
const COMBO_DURATION_MS = 3000;
const COMBO_ACCEL_MUL = 1.4;
const COMBO_RADIUS_BONUS = 8;

/**
 * Captured-count milestones. First three drive the original biome
 * progression (depth 20/40/60); subsequent ones are endless-mode
 * boss spawns that keep the run escalating after transcend.
 */
const BIOME_MILESTONES = [20, 40, 60, 90, 130, 180, 240, 310, 400, 500, 620];

/** Level (1/2/3) per milestone — drives reward type + difficulty. */
const CENTIPEDE_LEVEL_BY_BIOME: Record<number, number> = {
  20: 1,
  40: 2,
  60: 3,
  90: 1,
  130: 2,
  180: 3,
  240: 1,
  310: 2,
  400: 3,
  500: 1,
  620: 2,
};
const BOSS_HEALTH: Record<BossKind, number> = {
  swarmLord: 36,
  tideMaw: 28,
  abyssEye: 40,
  centipede: 24,
  phage: 26,
  ciliate: 30,
};
const BOSS_RADIUS: Record<BossKind, number> = {
  swarmLord: 30,
  tideMaw: 24,
  abyssEye: 28,
  centipede: 22,
  phage: 22,
  ciliate: 26,
};
const BOSS_REWARD_TYPE: Record<BossKind, NodeTypeId> = {
  swarmLord: "spore",
  tideMaw: "stinger",
  abyssEye: "mitochondrion",
  centipede: "membrane",
  phage: "mitochondrion",   // virion injection → mitochondrial drop
  ciliate: "chloroplast",   // food competitor → chloroplast drop
};

/** Phage tuning. */
const PHAGE_DRIFT_SPEED = 0.18;       // very slow (mostly stationary)
const PHAGE_FIRE_INTERVAL_MS = 3000;
const PHAGE_VIRION_SPEED = 4.2;
const PHAGE_VIRION_DAMAGE = 4;
const PHAGE_VIRION_LIFE_MS = 1800;
const PHAGE_PLAYER_DAMAGE_COOLDOWN_TICKS = 50;

/** Ciliate tuning. */
const CILIATE_SPEED = 1.05;            // a touch faster than spirochete head
const CILIATE_PLAYER_DAMAGE = 4;
const CILIATE_PLAYER_DAMAGE_COOLDOWN_TICKS = 55;
const CILIATE_EAT_RANGE = 12;
const BOSS_REWARD_AMOUNT = 5;

/** Hive queen tuning. */
const HIVE_DRONE_COUNT = 6;
const HIVE_DRONE_RADIUS = 9;
const HIVE_DRONE_HEALTH = 4;
const HIVE_ORBIT_RADIUS = 95;
const HIVE_ORBIT_RATE = 0.018;
const HIVE_QUEEN_SPEED = 0.30;       // drifts toward player slowly
const HIVE_QUEEN_DR_WITH_DRONES = 0.85; // damage reduction while drones alive
const HIVE_DRONE_DAMAGE = 2;
const HIVE_QUEEN_DAMAGE = 4;
const HIVE_PLAYER_DAMAGE_COOLDOWN_TICKS = 50;

/** Mirror tuning. */
const MIRROR_SPAWN_DISTANCE = 280;
const MIRROR_MASS_FRACTION = 0.5;     // half player's mass at spawn
const MIRROR_MAX_MASS = 50;
const MIRROR_SPEED = 0.85;            // bit slower than max player vel
const MIRROR_PLAYER_DAMAGE_COOLDOWN_TICKS = 55;

/** Centipede tuning. */
const CENTIPEDE_HEAD_SPEED = 1.1;
const CENTIPEDE_AGGRO_HEALTH_FRAC = 0.4;
const CENTIPEDE_INITIAL_SEGMENTS = 3;
/** First N ticks after spawn the centipede beelines toward the player so it visibly enters the viewport. */
const CENTIPEDE_INTRO_CHASE_TICKS = 240;
const CENTIPEDE_MAX_SEGMENTS = 14;
const CENTIPEDE_SEGMENT_SPACING_TICKS = 6;
const CENTIPEDE_HISTORY_MAX =
  CENTIPEDE_MAX_SEGMENTS * CENTIPEDE_SEGMENT_SPACING_TICKS + 8;
const CENTIPEDE_EAT_RANGE = 18;
const CENTIPEDE_PLAYER_DAMAGE = 5;
const CENTIPEDE_PLAYER_DAMAGE_COOLDOWN_TICKS = 60;
/** Per-milestone reward type override + base level scaling. */
const CENTIPEDE_LEVEL_REWARD: Record<number, NodeTypeId> = {
  1: "chloroplast",
  2: "membrane",
  3: "mitochondrion",
};
/** Breather window between killing one centipede and the next spawning. */
const CENTIPEDE_RESPAWN_DELAY_MS = 3500;
/** Initial spawn delay so player has a moment to orient at run start. */
const CENTIPEDE_INITIAL_SPAWN_DELAY_MS = 2000;

/** Lunge attack — telegraphed strike for the player to dodge. */
const LUNGE_RANGE = 280;
const LUNGE_RANGE_SQ = LUNGE_RANGE * LUNGE_RANGE;
/** wallMs the centipede holds its windup pose before firing. */
const LUNGE_WINDUP_MS = 520;
/** wallMs the lunge motion lasts at boosted speed. */
const LUNGE_DURATION_MS = 280;
/** wallMs of recovery — head crawls slowly, telegraphs vulnerability. */
const LUNGE_RECOVER_MS = 700;
/** wallMs cooldown between lunges in the calm phase. */
const LUNGE_COOLDOWN_MS = 2600;
/** Cooldown shrinks under enrage so the boss attacks back-to-back. */
const LUNGE_COOLDOWN_ENRAGED_MS = 1200;
/** Speed multiplier on the head's normal speed during the strike. */
const LUNGE_SPEED_MUL = 5.2;
/** Speed multiplier during recovery — head almost stalls so player can punish. */
const LUNGE_RECOVER_SPEED_MUL = 0.25;
/** Damage multiplier on lunge contact — connecting hurts much more than a graze. */
const LUNGE_DAMAGE_MUL = 2;

/** Wander steering — small persistent thrust along each cell's
 *  drifting heading so idle motion has intent instead of pure jitter. */
const WANDER_FORCE = 0.06;
const WANDER_HEADING_DRIFT = 0.045;

/** Curiosity — at mid distance to the bell (just outside the fear
 *  ring), some cells drift TOWARD the player to investigate. Fear
 *  still wins at close range. Per-type weights below. */
const CURIOSITY_INNER = 180;  // start of curiosity zone (just outside fear)
const CURIOSITY_OUTER = 320;  // beyond this, cells ignore the player
const CURIOSITY_BY_TYPE: Record<NodeTypeId, number> = {
  core: 0,
  propulsion: 0.30,
  sensor: 0.65,        // sensors investigate — they're literal eyes
  membrane: 0.05,
  mouth: 0.10,
  stinger: 0.18,       // stinger drift in to challenge
  chloroplast: 0.02,   // photosynthesizers don't care
  mitochondrion: 0.20,
  spore: 0.08,
};

/** Per-cell tempo — slow sin pulse on speed scale so cells breathe
 *  in/out at their own personal cadence. */
const TEMPO_AMPLITUDE = 0.35;
const TEMPO_RATE = 0.035;

/** Currents — sum of a slowly-rotating sin/cos vector field over the
 *  arena. Adds organic drift; cells pool in eddies that migrate over
 *  time so no part of the arena stays permanently dead. The player
 *  also feels a fraction of the current. */
const CURRENT_STRENGTH = 0.05;
const CURRENT_SPATIAL = 0.0014;
const CURRENT_TIME = 0.00012;
/** Slow field rotation so eddies migrate across the arena. */
const CURRENT_ROTATION = 0.000018;
/** Fraction of the current the player feels — atmosphere without
 *  fighting the thumbstick. */
const CURRENT_PLAYER_MUL = 0.35;

/** Spawn cradles — visible biological hotspots per arena. New cells
 *  emit from cradles instead of the void, so the arena has geography.
 *  Cradle picks bias TOWARD their preferred type but still roll the
 *  biome distribution often enough to keep depth flavor.  */
const CRADLE_COUNT = 3;
const CRADLE_RADIUS = 56;
/** Probability a cradle spawn uses the cradle's own type vs.
 *  rolling the biome composition. */
const CRADLE_TYPE_LOYALTY = 0.6;

/** Free-cell flocking — boids-style alignment/cohesion/separation.
 *  Same-species cells school; separation applies across all types so
 *  different species don't clip through each other. */
const FLOCK_RADIUS = 64;
const FLOCK_R2 = FLOCK_RADIUS * FLOCK_RADIUS;
const SEPARATION_RADIUS = 22;
const SEP_R2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
/** Cohesion is scaled down because the displacement is in pixels —
 *  this keeps it from yanking cells together too hard. */
const COHESION_SCALE = 0.018;
const FLOCK_WEIGHTS: Record<NodeTypeId, { sep: number; ali: number; coh: number }> = {
  core:           { sep: 0,    ali: 0,    coh: 0    },
  propulsion:     { sep: 0.85, ali: 0.22, coh: 0.16 }, // strong fish school
  sensor:         { sep: 0.70, ali: 0.10, coh: 0.06 },
  membrane:       { sep: 0.55, ali: 0.04, coh: 0.02 }, // solitary
  mouth:          { sep: 0.55, ali: 0.06, coh: 0.04 }, // semi-solitary
  stinger:        { sep: 0.65, ali: 0.05, coh: 0.02 }, // territorial
  chloroplast:    { sep: 0.50, ali: 0.20, coh: 0.05 }, // drifting algal mats
  mitochondrion:  { sep: 0.65, ali: 0.12, coh: 0.07 },
  spore:          { sep: 0.45, ali: 0.08, coh: 0.22 }, // tight clusters
};

/** Free-cell ecology tuning. */
const ECOLOGY_INTERVAL_MS = 4000;
const ECOLOGY_NEIGHBOR_RANGE = 250;
const ECOLOGY_REPRODUCE_MIN = 2;
const ECOLOGY_REPRODUCE_MAX = 5;
const ECOLOGY_DECAY_PROB = 0.05;
const ECOLOGY_REPRO_CAP_PER_TICK = 8;
const ECOLOGY_DECAY_CAP_PER_TICK = 6;
const FREE_POP_MIN = 50;
const FREE_POP_MAX = 250;

/** Stage at which the given totalAbsorbed currently sits. */
export function computeStage(totalAbsorbed: number): number {
  let stage = 0;
  for (let i = 1; i < STAGE_THRESHOLDS.length; i++) {
    if (totalAbsorbed >= STAGE_THRESHOLDS[i]) stage = i;
  }
  return stage;
}

export interface WorldConfig {
  /** Number of free cells to scatter at start. Default 200. */
  freeCount?: number;
  /** Half-extent of the square arena (torus wraps at ±arenaHalf). Default 1500. */
  arenaHalf?: number;
  /** Seed for the world's PRNG. Default 'cytogenesis'. */
  seed?: string;
}

/**
 * World owns the d3-force simulation (for the captured entity graph),
 * the free-cell swarm (custom integrator + quadtree), and the camera
 * transform. d3-force only sees `entityBodies`; `freeBodies` integrate
 * manually so we can scale to hundreds without melting the sim.
 */
export class World {
  /**
   * Entity bodies. Always exactly one entry (the core) — captures no
   * longer extend the graph. Kept as an array for backward-compatible
   * d3.forceSimulation node binding + render iteration.
   */
  entityBodies: Body[];
  /** Free-floating cells — manual integrator. */
  freeBodies: Body[];
  /** Always empty under the absorb-counter model; kept to satisfy d3.forceLink. */
  bonds: Bond[];
  /**
   * Per-NodeTypeId absorbed counts. Drives both visual evolution and
   * the trait engine.
   */
  absorbed: Record<NodeTypeId, number>;
  /** Sum of absorbed counts — drives evolution stage + run win/loss. */
  totalAbsorbed: number;
  /** 0..MAX_STAGE. Crossings emit 'evolve' / 'devolve' events. */
  evolutionStage: number;
  sim: d3.Simulation<Body, Bond>;
  camera: Camera;
  tickN: number;
  arenaHalf: number;
  rng: Rng;
  envCA: EnvCA;
  /** Derived gameplay state — recomputed only when the entity graph mutates. */
  traits: TraitState;
  /** Wallclock ms after which the next lock-on may fire. */
  lockOnReadyAt: number;
  /** Predators attacking the entity. Separate list from free cells. */
  predators: Body[];
  /** Run lifecycle. */
  runStatus: "running" | "transcended" | "dead";
  runStartedAtMs: number;
  runEndedAtMs: number | null;
  /** Highest captured-count reached during the run — surface as score. */
  peakCaptured: number;
  /** Real-time accumulator (ms). Drives spawn cadence + run timer. */
  wallMs: number;
  /** Player-toggled pause. tick early-returns when true. */
  paused: boolean;
  /** Spawn cradles — visible biological hotspots that pulse and emit cells. */
  cradles: { x: number; y: number; type: NodeTypeId; phase: number }[];
  /** Body-editor — open between stages while the player picks/places a part. */
  editor: EditorState;
  /** Parts the player has attached to the bell this run (visible forever). */
  placedParts: PlacedPart[];
  /** tickN at which the player last took damage — drives the hit flash. */
  lastDamageTickN: number;
  /** 0 (surface) → 3 (depth 60). Darkens the bg gradient as you descend. */
  biomeStage: number;
  /** Number of bosses killed this run — surfaced on the run summary. */
  bossesDefeated: number;
  /** Index into BIOME_MILESTONES — only advances when a boss isn't already on the field. */
  private nextMilestoneIndex: number;
  /** Active centipede boss; null between fights. */
  centipede: {
    level: number;
    cycleRound: number;
    head: Body;
    segments: Body[];
    /** Newest position at index 0; segment N reads from index N*SPACING. */
    positionHistory: { x: number; y: number }[];
    /** tickN at which centipede can damage the player again. */
    nextDamageTickN: number;
    /** tickN at spawn — used to force a brief intro chase toward the player so the boss visibly enters the viewport. */
    spawnedAtTickN: number;
    /** Attack state machine — gates the lunge cycle. */
    attackPhase: "idle" | "windup" | "lunge" | "recover";
    /** wallMs at which the current attack phase ends. */
    attackPhaseUntilMs: number;
    /** wallMs at which the next lunge can begin (idle → windup). */
    nextLungeAtMs: number;
    /** Locked unit vector aimed at predicted player position when windup ended. */
    lungeDx: number;
    lungeDy: number;
    /** True once head HP crosses the enrage threshold — used for the one-time transition flash. */
    enragedFlashed: boolean;
    /** Cached max HP at spawn — render uses this for the boss bar fraction. */
    maxHealth: number;
  } | null;
  /** wallMs at which to spawn the next centipede; null = no spawn pending. */
  nextCentipedeAtMs: number | null;
  /** Active hive-queen boss. */
  hiveQueen: {
    body: Body;
    drones: Body[];
    level: number;
    cycleRound: number;
    maxHealth: number;
    spawnedAtTickN: number;
    nextDamageTickN: number;
  } | null;
  /** Active mirror boss. */
  mirror: {
    body: Body;
    level: number;
    cycleRound: number;
    maxHealth: number;
    spawnedAtTickN: number;
    nextDamageTickN: number;
    /** Snapshot of player's absorbed dict at spawn — drives mirror's bell shape. */
    mirroredAbsorbed: Record<NodeTypeId, number>;
    /** Hue shift for visual distinction. */
    hueShift: number;
  } | null;
  /** Active phage boss. */
  phage: {
    body: Body;
    level: number;
    cycleRound: number;
    maxHealth: number;
    spawnedAtTickN: number;
    nextDamageTickN: number;
    /** wallMs of next virion fire. */
    nextFireAtMs: number;
    /** wallMs of last fire — drives tail-contraction animation. */
    lastFiredMs: number;
    /** Active virion projectiles aimed at the player. */
    virions: { x: number; y: number; vx: number; vy: number; bornMs: number }[];
  } | null;
  /** Active ciliate boss. */
  ciliate: {
    body: Body;
    level: number;
    cycleRound: number;
    maxHealth: number;
    spawnedAtTickN: number;
    nextDamageTickN: number;
    /** Cells eaten this fight — for visual growth (cosmetic). */
    cellsEaten: number;
  } | null;
  /** Wallclock at which the next chloroplast regen will fire. */
  private nextRegenAtMs: number;
  /** Wallclock at which the next ecology pass will fire. */
  private nextEcologyAtMs: number;
  /** Viewport in CSS pixels. Camera follow keeps the core at viewport center. */
  viewportWidth: number;
  viewportHeight: number;
  /** Recent core positions for tentacle / wake rendering. */
  coreTrail: { x: number; y: number }[];
  /** Short-lived expanding rings on capture / hit. */
  sparkles: { x: number; y: number; age: number; max: number; hue: string }[];
  /** Stinger-fire tracer lines (line segments that fade over `max` ticks). */
  tracers: { x1: number; y1: number; x2: number; y2: number; age: number; max: number }[];
  /** Pending predator spawns — drawn as edge arrows during the warning window. */
  telegraphs: { x: number; y: number; untilMs: number }[];
  /** Thumbstick UI state (screen-space pixel coords). */
  stickAnchor: { x: number; y: number } | null;
  stickKnob: { x: number; y: number } | null;
  /** Normalized stick output: unit direction + magnitude in [0, 1]. */
  stickInput: { ux: number; uy: number; t: number } | null;
  /** Visual camera shake — random offset applied during applyCamera, decays per tick. */
  shakeIntensity: number;
  /** Per-tick events drained by the React layer (audio, toasts). */
  events: WorldEvent[];
  /** Wallclock until which the capture-combo buff is active. */
  comboActiveUntilMs: number;
  /** Recent capture timestamps (wallMs) — sliding window for combo detection. */
  recentCaptures: number[];
  /** Trait IDs that were active on the previous capture, for first-acquisition toasts. */
  private prevTraitSet: Set<string>;
  /** Accumulator for sub-frame d3 sim ticks during slow-mo. */
  private simAccum: number;
  private nextPredatorSpawnAt: number;
  private linkForce: d3.ForceLink<Body, Bond>;

  constructor(config: WorldConfig = {}) {
    const freeCount = config.freeCount ?? 150;
    // Smaller arena — tighter hunting ground, the centipede is harder
    // to lose, free cells stay denser. 2000×2000 world.
    this.arenaHalf = config.arenaHalf ?? 1000;
    this.rng = rngFromSeed(config.seed ?? "cytogenesis");

    // Env CA must exist before spawnFree can bias toward live zones.
    this.envCA = new EnvCA({ arenaHalf: this.arenaHalf }, this.rng);

    // Always start with the core captured at world origin.
    const core = makeBody("core", "captured", 0, 0);
    this.entityBodies = [core];

    // Scatter free cells across the arena with random initial velocity.
    this.freeBodies = [];
    for (let i = 0; i < freeCount; i++) this.freeBodies.push(this.spawnFree());

    this.bonds = [];
    this.tickN = 0;
    this.absorbed = {
      core: 1,
      propulsion: 0,
      sensor: 0,
      membrane: 0,
      mouth: 0,
      stinger: 0,
      chloroplast: 0,
      mitochondrion: 0,
      spore: 0,
    };
    this.totalAbsorbed = 0;
    this.evolutionStage = 0;
    this.traits = emptyTraitState();
    this.lockOnReadyAt = 0;
    this.predators = [];
    this.runStatus = "running";
    this.runStartedAtMs = 0;
    this.runEndedAtMs = null;
    this.peakCaptured = 0;
    this.wallMs = 0;
    this.paused = false;
    this.editor = {
      open: false,
      selectedKind: null,
      offerings: [],
      triggeredStage: -1,
    };
    this.placedParts = [];
    this.lastDamageTickN = -9999;
    // Seed cradles — random positions inside 70% of the arena so they
    // aren't pinned at the wrap edges. Each gets a preferred type
    // drawn from a small palette of "biological hotspot" archetypes.
    const cradleTypes: NodeTypeId[] = [
      "chloroplast",
      "propulsion",
      "sensor",
      "spore",
    ];
    this.cradles = [];
    for (let i = 0; i < CRADLE_COUNT; i++) {
      this.cradles.push({
        x: this.rng.range(-this.arenaHalf * 0.7, this.arenaHalf * 0.7),
        y: this.rng.range(-this.arenaHalf * 0.7, this.arenaHalf * 0.7),
        type: this.rng.pick(cradleTypes),
        phase: this.rng.range(0, Math.PI * 2),
      });
    }
    this.biomeStage = 0;
    this.bossesDefeated = 0;
    this.nextMilestoneIndex = 0;
    this.centipede = null;
    this.hiveQueen = null;
    this.mirror = null;
    this.phage = null;
    this.ciliate = null;
    // Schedule the first centipede shortly after run start so the
    // player isn't dropped straight into the boss fight.
    this.nextCentipedeAtMs = CENTIPEDE_INITIAL_SPAWN_DELAY_MS;
    this.nextRegenAtMs = 0;
    this.nextEcologyAtMs = 4000;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.coreTrail = [];
    this.sparkles = [];
    this.tracers = [];
    this.telegraphs = [];
    this.stickAnchor = null;
    this.stickKnob = null;
    this.stickInput = null;
    this.shakeIntensity = 0;
    this.events = [];
    this.comboActiveUntilMs = 0;
    this.recentCaptures = [];
    this.prevTraitSet = new Set();
    this.simAccum = 0;
    this.nextPredatorSpawnAt = PREDATOR_FIRST_SPAWN_MS;

    this.linkForce = d3
      .forceLink<Body, Bond>(this.bonds)
      .id((d) => d.id)
      .distance((b) => {
        const s = b.source as Body;
        const t = b.target as Body;
        return (s.radius ?? 8) + (t.radius ?? 8) + 6;
      })
      .strength((b) => b.strength * 0.7);

    this.sim = d3
      .forceSimulation<Body, Bond>(this.entityBodies)
      .force("charge", d3.forceManyBody<Body>().strength(-80))
      // Soft anchor — keeps the entity from drifting infinitely if no
      // prey is around. Autonomous propulsion (Phase 5+) does the real
      // steering when traits.speedMul > 0.
      .force("centerX", d3.forceX<Body>(0).strength(0.005))
      .force("centerY", d3.forceY<Body>(0).strength(0.005))
      // Velocity decay: 0.22 keeps the bell glide-y but stops it
      // firmly when the player lets go of the stick. Combined with
      // applySteerForce's accel=t*1.5 and MAX_VEL=9 this gives ~540
      // wu/sec top speed (5s arena traversal).
      .velocityDecay(0.22)
      .force("collide", d3.forceCollide<Body>((d) => d.radius + 2))
      .force("link", this.linkForce)
      .alphaDecay(0.005)
      .stop();

    // Default k=0.85 gives a wider tactical view so predators are
    // visible earlier; player can still pinch in for precision.
    this.camera = { k: 0.85, x: 0, y: 0 };
  }

  /** Combined view of all bodies — used by render + hitTest. */
  get bodies(): Body[] {
    return [...this.entityBodies, ...this.freeBodies];
  }

  /**
   * Spawn a single free cell.
   *  - default: uniformly across arena
   *  - onEdge:  pick a random arena edge (used by capture respawn so
   *             replacements drift inward, not on top of the player)
   *  - biasToAlive: try to land inside a CA live zone first; if the
   *             grid is mostly dead, fall back to edge spawn
   */
  /** Pick a NodeTypeId from the current biome weights. */
  private pickBiomeType(): NodeTypeId {
    // biomeStage may not yet be initialized when this fires from the
    // constructor's initial scatter loop. Default to stage 0.
    const stage = Math.min(this.biomeStage ?? 0, BIOME_WEIGHTS.length - 1);
    const weights = BIOME_WEIGHTS[stage] ?? BIOME_WEIGHTS[0];
    let total = 0;
    for (const t of FREE_POOL) total += weights[t] ?? 0;
    if (total <= 0) return this.rng.pick(FREE_POOL);
    let r = this.rng.next() * total;
    for (const t of FREE_POOL) {
      r -= weights[t] ?? 0;
      if (r <= 0) return t;
    }
    return FREE_POOL[FREE_POOL.length - 1];
  }

  private spawnFree(opts: { onEdge?: boolean; biasToAlive?: boolean; fromCradle?: boolean } = {}): Body {
    const a = this.arenaHalf;
    let x: number;
    let y: number;
    let type = this.pickBiomeType();

    // Cradle spawn — preferred path during ecology refill so cells
    // emit from visible biological hotspots, not the void.
    const useCradle =
      opts.fromCradle && this.cradles && this.cradles.length > 0;
    if (useCradle) {
      const c = this.rng.pick(this.cradles);
      const angle = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0, CRADLE_RADIUS * 0.85);
      x = c.x + Math.cos(angle) * r;
      y = c.y + Math.sin(angle) * r;
      // Mostly emit the cradle's preferred type; sometimes roll the
      // biome distribution so deeper biomes still vary the soup.
      if (this.rng.next() < CRADLE_TYPE_LOYALTY) type = c.type;
    } else if (opts.biasToAlive) {
      const live = this.envCA?.pickAliveWorldPos(this.rng);
      if (live) {
        x = live.x;
        y = live.y;
      } else {
        // Fall back to edge so the swarm always replenishes somehow.
        return this.spawnFree({ onEdge: true });
      }
    } else if (opts.onEdge) {
      const side = this.rng.int(0, 3);
      const pos = this.rng.range(-a, a);
      if (side === 0) {
        x = -a;
        y = pos;
      } else if (side === 1) {
        x = a;
        y = pos;
      } else if (side === 2) {
        x = pos;
        y = -a;
      } else {
        x = pos;
        y = a;
      }
    } else {
      x = this.rng.range(-a, a);
      y = this.rng.range(-a, a);
    }
    const vx = this.rng.range(-MAX_FREE_SPEED, MAX_FREE_SPEED);
    const vy = this.rng.range(-MAX_FREE_SPEED, MAX_FREE_SPEED);
    return makeBody(type, "free", x, y, vx, vy);
  }

  /**
   * Advance one physics step + drive the env CA by real-time dt.
   * Called from the rAF loop. dtMs defaults to a 60Hz frame so tests
   * that don't pass a value still behave.
   */
  tick(dtMs = 1000 / 60): void {
    if (this.paused) return;
    // Slow-mo lifecycle: when a run ends we keep ticking at scale=0.3
    // for SLOWMO_MS so the player gets a final dramatic beat before
    // the overlay snaps in. Tests that flip runStatus directly without
    // setting runEndedAtMs still see the no-op behavior.
    let scale = 1;
    const SLOWMO_MS = 800;
    if (this.runStatus !== "running") {
      if (this.runEndedAtMs == null) return;
      const elapsed = this.wallMs - this.runEndedAtMs;
      if (elapsed >= SLOWMO_MS) return;
      scale = 0.3;
    }
    this.wallMs += dtMs;
    const scaledDt = dtMs * scale;
    this.envCA.update(scaledDt);
    if (this.runStatus === "running") {
      this.applySteerForce();
      this.maybeRegen();
      this.maybeRunEcology();
      this.maybeRespawnCentipede();
    }
    this.integrateFree(scale);
    this.integrateCentipede(scale);
    this.integrateHiveQueen(scale);
    this.integrateMirror(scale);
    this.integratePhage(scale);
    this.integrateCiliate(scale);
    this.simAccum += scale;
    while (this.simAccum >= 1) {
      this.sim.tick();
      this.simAccum -= 1;
    }
    // Centipede contact damage runs inside integrateCentipede now;
    // resolveHits is no-op (legacy skirmisher/brute system retired).
    this.updateCameraFollow();
    this.updateCoreTrail();
    this.updateSparkles();
    this.decayShake();
    this.tickN += 1;
  }

  /**
   * Read thumbstick input and accelerate the core in that direction.
   * stickInput.t is the stick deflection [0, 1]; acceleration scales
   * linearly with t. Combined with velocityDecay 0.18 the bell glides
   * with weight instead of stop-on-release.
   */
  private applySteerForce(): void {
    const core = this.entityBodies[0];
    if (!core) return;
    // Player feels a fraction of the current at all times — adds
    // atmosphere without overpowering the thumbstick.
    const cur = this.currentAt(core.x ?? 0, core.y ?? 0);
    core.vx = (core.vx ?? 0) + cur.x * CURRENT_PLAYER_MUL;
    core.vy = (core.vy ?? 0) + cur.y * CURRENT_PLAYER_MUL;
    if (!this.stickInput) return;
    const { ux, uy, t } = this.stickInput;
    if (t < 0.05) return;
    core.fx = null;
    core.fy = null;
    const comboMul = this.wallMs < this.comboActiveUntilMs ? COMBO_ACCEL_MUL : 1;
    // Propulsion now boosts INPUT acceleration + max velocity instead
    // of auto-piloting. Each propulsion absorbed = +20% accel, +1
    // max-vel. The player is always in control.
    const propMul = 1 + (this.traits.speedMul ?? 0);
    const accel = t * 1.5 * comboMul * propMul;
    core.vx = (core.vx ?? 0) + ux * accel;
    core.vy = (core.vy ?? 0) + uy * accel;
    const MAX_VEL = (9 + (this.absorbed.propulsion ?? 0) * 0.5) * comboMul;
    const sp = Math.hypot(core.vx ?? 0, core.vy ?? 0);
    if (sp > MAX_VEL) {
      core.vx = (core.vx ?? 0) * (MAX_VEL / sp);
      core.vy = (core.vy ?? 0) * (MAX_VEL / sp);
    }
  }

  /** Decay camera shake exponentially. */
  private decayShake(): void {
    if (this.shakeIntensity <= 0) return;
    this.shakeIntensity *= 0.86;
    if (this.shakeIntensity < 0.15) this.shakeIntensity = 0;
  }

  /** Inject camera shake; intensity is in screen pixels. */
  addShake(strength: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, strength);
  }

  /** Tell the world how big the viewport is. Camera follow uses this. */
  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * Deadzone camera: the bell moves freely on screen while inside a
   * rectangular deadzone centered on the viewport. Only when it tries
   * to exit does the camera shift to keep it inside. Reads as "the
   * creature swims" instead of "the world flows past".
   */
  private updateCameraFollow(): void {
    if (this.viewportWidth === 0 || this.viewportHeight === 0) return;
    const core = this.entityBodies[0];
    if (!core) return;
    const k = this.camera.k;
    const screenX = (core.x ?? 0) * k + this.camera.x;
    const screenY = (core.y ?? 0) * k + this.camera.y;
    const cx = this.viewportWidth / 2;
    const cy = this.viewportHeight / 2;
    // Deadzone half-extents — 25% of viewport in each direction.
    const dzX = this.viewportWidth * 0.25;
    const dzY = this.viewportHeight * 0.25;
    let dCamX = 0;
    let dCamY = 0;
    if (screenX > cx + dzX) dCamX = cx + dzX - screenX;
    else if (screenX < cx - dzX) dCamX = cx - dzX - screenX;
    if (screenY > cy + dzY) dCamY = cy + dzY - screenY;
    else if (screenY < cy - dzY) dCamY = cy - dzY - screenY;
    const lerp = 0.22;
    this.camera.x += dCamX * lerp;
    this.camera.y += dCamY * lerp;
  }

  /** Ring-buffer of recent core positions. Drives the wake/tentacle render. */
  private updateCoreTrail(): void {
    const core = this.entityBodies[0];
    if (!core) return;
    this.coreTrail.push({ x: core.x ?? 0, y: core.y ?? 0 });
    if (this.coreTrail.length > 24) this.coreTrail.shift();
  }

  /** Age sparkles + drop expired ones. */
  private updateSparkles(): void {
    if (this.sparkles.length > 0) {
      for (let i = this.sparkles.length - 1; i >= 0; i--) {
        const s = this.sparkles[i];
        s.age += 1;
        if (s.age >= s.max) this.sparkles.splice(i, 1);
      }
    }
    if (this.tracers.length > 0) {
      for (let i = this.tracers.length - 1; i >= 0; i--) {
        const tr = this.tracers[i];
        tr.age += 1;
        if (tr.age >= tr.max) this.tracers.splice(i, 1);
      }
    }
  }

  emitSparkle(x: number, y: number, hue = "rgba(160, 240, 255,"): void {
    this.sparkles.push({ x, y, age: 0, max: 22, hue });
  }

  /** Endless-mode cycle counter — every CYCLE_LEN absorbed = +1 cycle. */
  private cycleRound(): number {
    return Math.floor(this.totalAbsorbed / CYCLE_LEN);
  }

  /**
   * Fire biome milestones as the player crosses thresholds. Bosses are
   * NO LONGER tied to milestones — the centipede spawns at run start
   * and respawns after each kill, so milestones are now purely
   * cosmetic (biome darken, transcend toast).
   */
  private checkMilestones(): void {
    while (this.nextMilestoneIndex < BIOME_MILESTONES.length) {
      const next = BIOME_MILESTONES[this.nextMilestoneIndex];
      if (this.totalAbsorbed < next) break;
      this.events.push(`biome:${next}` as WorldEvent);
      this.addShake(8);
      this.biomeStage = Math.min(this.biomeStage + 1, 4);
      if (next === TRANSCEND_AT) {
        this.addShake(18);
        this.events.push("transcend");
      }
      this.nextMilestoneIndex += 1;
    }
  }

  /**
   * Difficulty curve: in cycle 0 (pre-transcend) ramps with absorbed
   * count; each cycle past the first squeezes spawn interval further
   * and raises the predator cap. Floor at 800ms so it's still
   * survivable.
   */
  private currentSpawnIntervalMs(): number {
    const factor = Math.min(1, this.totalAbsorbed / 30);
    const base = Math.round(PREDATOR_SPAWN_INTERVAL_MS - factor * 3500);
    const cycle = this.cycleRound();
    return Math.max(800, base - cycle * 500);
  }
  private currentMaxPredators(): number {
    const baseCap = Math.min(8, 2 + Math.floor(this.totalAbsorbed / 8));
    return Math.min(12, baseCap + this.cycleRound());
  }

  /** Time-gated periodic predator spawn, capped by current difficulty. */
  private maybeSpawnPredator(): void {
    if (this.predators.length + this.telegraphs.length >= this.currentMaxPredators()) return;
    if (this.wallMs < this.nextPredatorSpawnAt) return;
    const pos = this.pickPredatorSpawnPosition();
    this.telegraphs.push({
      x: pos.x,
      y: pos.y,
      untilMs: this.wallMs + PREDATOR_TELEGRAPH_MS,
    });
    this.events.push("telegraph");
    this.nextPredatorSpawnAt = this.wallMs + this.currentSpawnIntervalMs();
  }

  /** Materialize predators whose telegraph window has elapsed. */
  private resolveTelegraphs(): void {
    if (this.telegraphs.length === 0) return;
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      if (this.wallMs >= t.untilMs) {
        this.predators.push(this.makePredator(t.x, t.y));
        this.telegraphs.splice(i, 1);
      }
    }
  }

  /** CA dead zone, bumped outward so predators don't appear on top of the bell. */
  private pickPredatorSpawnPosition(): { x: number; y: number } {
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    let pos = this.envCA.pickDeadWorldPos(this.rng);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const len = Math.hypot(dx, dy);
    if (len < PREDATOR_MIN_SPAWN_DISTANCE) {
      const ux = len > 0 ? dx / len : this.rng.range(-1, 1);
      const uy = len > 0 ? dy / len : this.rng.range(-1, 1);
      pos = {
        x: cx + ux * PREDATOR_MIN_SPAWN_DISTANCE,
        y: cy + uy * PREDATOR_MIN_SPAWN_DISTANCE,
      };
    }
    const a = this.arenaHalf;
    pos.x = Math.max(-a, Math.min(a, pos.x));
    pos.y = Math.max(-a, Math.min(a, pos.y));
    return pos;
  }

  private makePredator(x: number, y: number): Body {
    const variant = this.rng.next() < PREDATOR_BRUTE_PROB ? "brute" : "skirmisher";
    const radius = variant === "brute" ? PREDATOR_RADIUS_BRUTE : PREDATOR_RADIUS_SKIRMISHER;
    const health = variant === "brute" ? 4 : 2;
    return {
      id: newId("predator"),
      type: "spore",
      kind: "predator",
      radius,
      x,
      y,
      vx: 0,
      vy: 0,
      variant,
      health,
    };
  }

  /** Count captured nodes of a given type — used for toxic bell + stinger fire. */
  private countCapturedType(type: NodeTypeId): number {
    let n = 0;
    for (const b of this.entityBodies) if (b.type === type) n++;
    return n;
  }

  /** Drop predator with kill event + sparkle + shake. */
  private killPredator(p: Body): void {
    const idx = this.predators.indexOf(p);
    if (idx >= 0) this.predators.splice(idx, 1);
    this.emitSparkle(p.x ?? 0, p.y ?? 0, "rgba(248, 113, 113,");
    if (p.bossKind) {
      // Boss death — bigger shake + scaling reward + special event.
      this.addShake(20);
      this.events.push("killBoss");
      this.bossesDefeated += 1;
      const reward = BOSS_REWARD_TYPE[p.bossKind];
      const cycleMul = cycleScalar(this.cycleRound(), 1.5, 1.08);
      const rewardAmount = Math.round(BOSS_REWARD_AMOUNT * cycleMul);
      for (let i = 0; i < rewardAmount; i++) {
        this.absorbed[reward] += 1;
        this.totalAbsorbed += 1;
      }
      this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
      this.traits = recomputeTraits(this.absorbed);
      // Boss died — any deferred milestones can fire now.
      this.checkMilestones();
    } else {
      this.events.push("killPred");
      this.addShake(p.variant === "brute" ? 9 : 5);
    }
  }

  /**
   * Spawn a centipede boss for the given biome milestone. The
   * centipede is the only boss creature now — head + initial 3
   * segments, eats free cells to grow, dies when its head HP hits 0.
   */
  private spawnBoss(kind: BossKind, milestone: number): void {
    const level = CENTIPEDE_LEVEL_BY_BIOME[milestone] ?? 1;
    if (kind === "swarmLord") this.spawnHiveQueen(level);
    else if (kind === "tideMaw") this.spawnMirror(level);
    else if (kind === "phage") this.spawnPhage(level);
    else if (kind === "ciliate") this.spawnCiliate(level);
    else this.spawnCentipede(level);
  }

  private spawnHiveQueen(level: number): void {
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const angle = this.rng.next() * Math.PI * 2;
    const spawnDist = 240;
    const a = this.arenaHalf;
    const qx = Math.max(-a, Math.min(a, cx + Math.cos(angle) * spawnDist));
    const qy = Math.max(-a, Math.min(a, cy + Math.sin(angle) * spawnDist));
    const cycle = this.cycleRound();
    const cycleMul = cycleScalar(cycle, 1.4, 1.05);
    const levelMul = 1 + (level - 1) * 0.4;
    const bodyRadius = BOSS_RADIUS.swarmLord * cycleRadiusMul(cycle) * (1 + (level - 1) * 0.08);
    const health = Math.round(BOSS_HEALTH.swarmLord * cycleMul * levelMul);
    const body: Body = {
      id: newId("hive-queen"),
      type: "spore",
      kind: "predator",
      radius: bodyRadius,
      x: qx,
      y: qy,
      vx: 0,
      vy: 0,
      variant: "brute",
      health,
      bossKind: "swarmLord",
    };
    this.predators.push(body);

    const drones: Body[] = [];
    for (let i = 0; i < HIVE_DRONE_COUNT; i++) {
      const a = (i / HIVE_DRONE_COUNT) * Math.PI * 2;
      const drone: Body = {
        id: newId("hive-drone"),
        type: "spore",
        kind: "predator",
        radius: HIVE_DRONE_RADIUS * (1 + (level - 1) * 0.1),
        x: qx + Math.cos(a) * HIVE_ORBIT_RADIUS,
        y: qy + Math.sin(a) * HIVE_ORBIT_RADIUS,
        vx: 0,
        vy: 0,
        variant: "skirmisher",
        health: HIVE_DRONE_HEALTH + Math.floor((level - 1) * 1.5),
        bossKind: "swarmLord",
        segmentIndex: i + 1, // drone index (1+); 0 = queen body itself
      };
      drones.push(drone);
      this.predators.push(drone);
    }

    this.hiveQueen = {
      body,
      drones,
      level,
      cycleRound: cycle,
      maxHealth: health,
      spawnedAtTickN: this.tickN,
      nextDamageTickN: 0,
    };
    this.events.push("bossSpawn");
    this.addShake(15);
  }

  private spawnMirror(level: number): void {
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const angle = this.rng.next() * Math.PI * 2;
    const a = this.arenaHalf;
    const mx = Math.max(-a, Math.min(a, cx + Math.cos(angle) * MIRROR_SPAWN_DISTANCE));
    const my = Math.max(-a, Math.min(a, cy + Math.sin(angle) * MIRROR_SPAWN_DISTANCE));
    // Snapshot a fraction of the player's absorbed dict — mirror has
    // half the player's mass at spawn, capped, distributed proportionally.
    const playerTotal = Math.max(1, this.totalAbsorbed);
    const targetMass = Math.min(
      MIRROR_MAX_MASS,
      Math.max(8, Math.floor(playerTotal * MIRROR_MASS_FRACTION)),
    );
    const mirrored: Record<NodeTypeId, number> = {
      core: 1,
      propulsion: 0,
      sensor: 0,
      membrane: 0,
      mouth: 0,
      stinger: 0,
      chloroplast: 0,
      mitochondrion: 0,
      spore: 0,
    };
    let placed = 0;
    if (this.totalAbsorbed > 0) {
      // Proportional copy of player's mix, scaled to targetMass.
      const factor = targetMass / playerTotal;
      for (const k of Object.keys(this.absorbed) as NodeTypeId[]) {
        if (k === "core") continue;
        const n = Math.floor((this.absorbed[k] ?? 0) * factor);
        mirrored[k] = n;
        placed += n;
      }
    }
    // Pad with random types until we hit targetMass so the mirror always
    // has SOMETHING even if the player just spawned.
    const padTypes: NodeTypeId[] = ["propulsion", "sensor", "membrane", "stinger"];
    while (placed < targetMass) {
      const t = this.rng.pick(padTypes);
      mirrored[t] = (mirrored[t] ?? 0) + 1;
      placed++;
    }
    const cycle = this.cycleRound();
    const cycleMul = cycleScalar(cycle, 1.4, 1.05);
    const levelMul = 1 + (level - 1) * 0.3;
    const bodyRadius = BOSS_RADIUS.tideMaw + targetMass * 0.5;
    const health = Math.round(
      (BOSS_HEALTH.tideMaw + targetMass * 0.5) * cycleMul * levelMul,
    );
    const body: Body = {
      id: newId("mirror"),
      type: "core",
      kind: "predator",
      radius: bodyRadius,
      x: mx,
      y: my,
      vx: 0,
      vy: 0,
      variant: "brute",
      health,
      bossKind: "tideMaw",
    };
    this.predators.push(body);
    this.mirror = {
      body,
      level,
      cycleRound: cycle,
      maxHealth: health,
      spawnedAtTickN: this.tickN,
      nextDamageTickN: 0,
      mirroredAbsorbed: mirrored,
      hueShift: this.rng.range(120, 280), // tinted away from cyan
    };
    this.events.push("bossSpawn");
    this.addShake(15);
  }

  private spawnPhage(level: number): void {
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const angle = this.rng.next() * Math.PI * 2;
    const spawnDist = 280;
    const a = this.arenaHalf;
    const px = Math.max(-a, Math.min(a, cx + Math.cos(angle) * spawnDist));
    const py = Math.max(-a, Math.min(a, cy + Math.sin(angle) * spawnDist));
    const cycle = this.cycleRound();
    const cycleMul = cycleScalar(cycle, 1.4, 1.05);
    const levelMul = 1 + (level - 1) * 0.4;
    const radius = BOSS_RADIUS.phage * cycleRadiusMul(cycle) * (1 + (level - 1) * 0.08);
    const health = Math.round(BOSS_HEALTH.phage * cycleMul * levelMul);
    const body: Body = {
      id: newId("phage"),
      type: "spore",
      kind: "predator",
      radius,
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      variant: "brute",
      health,
      bossKind: "phage",
    };
    this.predators.push(body);
    this.phage = {
      body,
      level,
      cycleRound: cycle,
      maxHealth: health,
      spawnedAtTickN: this.tickN,
      nextDamageTickN: 0,
      nextFireAtMs: this.wallMs + 1500,  // brief grace before first shot
      lastFiredMs: -9999,
      virions: [],
    };
    this.events.push("bossSpawn");
    this.addShake(15);
  }

  private spawnCiliate(level: number): void {
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const angle = this.rng.next() * Math.PI * 2;
    const spawnDist = 240;
    const a = this.arenaHalf;
    const cxs = Math.max(-a, Math.min(a, cx + Math.cos(angle) * spawnDist));
    const cys = Math.max(-a, Math.min(a, cy + Math.sin(angle) * spawnDist));
    const cycle = this.cycleRound();
    const cycleMul = cycleScalar(cycle, 1.4, 1.05);
    const levelMul = 1 + (level - 1) * 0.4;
    const radius = BOSS_RADIUS.ciliate * cycleRadiusMul(cycle) * (1 + (level - 1) * 0.08);
    const health = Math.round(BOSS_HEALTH.ciliate * cycleMul * levelMul);
    const body: Body = {
      id: newId("ciliate"),
      type: "spore",
      kind: "predator",
      radius,
      x: cxs,
      y: cys,
      vx: 0,
      vy: 0,
      variant: "brute",
      health,
      bossKind: "ciliate",
    };
    this.predators.push(body);
    this.ciliate = {
      body,
      level,
      cycleRound: cycle,
      maxHealth: health,
      spawnedAtTickN: this.tickN,
      nextDamageTickN: 0,
      cellsEaten: 0,
    };
    this.events.push("bossSpawn");
    this.addShake(15);
  }

  private spawnCentipede(level: number): void {
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const angle = this.rng.next() * Math.PI * 2;
    // Spawn just inside the viewport edge — at default zoom 0.85 a
    // phone viewport is ~470wu wide, so 220 puts the centipede on
    // screen the moment it appears.
    const spawnDist = 220;
    const a = this.arenaHalf;
    const hx = Math.max(-a, Math.min(a, cx + Math.cos(angle) * spawnDist));
    const hy = Math.max(-a, Math.min(a, cy + Math.sin(angle) * spawnDist));
    const cycle = this.cycleRound();
    const cycleMul = cycleScalar(cycle, 1.4, 1.05);
    const levelMul = 1 + (level - 1) * 0.4;
    const headRadius =
      BOSS_RADIUS.centipede * cycleRadiusMul(cycle) * (1 + (level - 1) * 0.08);
    const health = Math.round(BOSS_HEALTH.centipede * cycleMul * levelMul);
    // Inbound facing — head points toward player so the chain trails
    // back away from the player on spawn (visually obvious from frame 0).
    const facingX = cx - hx;
    const facingY = cy - hy;
    const facingLen = Math.hypot(facingX, facingY) || 1;
    const fx = facingX / facingLen;
    const fy = facingY / facingLen;
    const head: Body = {
      id: newId("centipede-head"),
      type: "spore",
      kind: "predator",
      radius: headRadius,
      x: hx,
      y: hy,
      vx: fx * CENTIPEDE_HEAD_SPEED,
      vy: fy * CENTIPEDE_HEAD_SPEED,
      variant: "brute",
      health,
      bossKind: "centipede",
      segmentIndex: 0,
    };
    this.predators.push(head);

    // Pre-spread segments behind the head along -facing so the
    // centipede has visible body length the instant it appears.
    const segGap = headRadius * 1.6;
    const segments: Body[] = [];
    for (let i = 0; i < CENTIPEDE_INITIAL_SEGMENTS; i++) {
      const offset = segGap * (i + 1);
      const seg: Body = {
        id: newId("centipede-seg"),
        type: "spore",
        kind: "predator",
        radius: headRadius * 0.7,
        x: hx - fx * offset,
        y: hy - fy * offset,
        vx: 0,
        vy: 0,
        bossKind: "centipede",
        segmentIndex: i + 1,
      };
      segments.push(seg);
      this.predators.push(seg);
    }

    // Seed position history with the inbound trail so segments resolve
    // to their pre-spread positions on the first tick rather than
    // snapping back onto the head.
    const history: { x: number; y: number }[] = [];
    const totalHistory = CENTIPEDE_HISTORY_MAX;
    const stepSize = segGap / CENTIPEDE_SEGMENT_SPACING_TICKS;
    for (let i = 0; i < totalHistory; i++) {
      history.push({ x: hx - fx * stepSize * i, y: hy - fy * stepSize * i });
    }

    this.centipede = {
      level,
      cycleRound: cycle,
      head,
      segments,
      positionHistory: history,
      nextDamageTickN: 0,
      spawnedAtTickN: this.tickN,
      attackPhase: "idle",
      attackPhaseUntilMs: 0,
      // First lunge is gated by intro chase + a short windup grace.
      nextLungeAtMs: this.wallMs + 2400,
      lungeDx: fx,
      lungeDy: fy,
      enragedFlashed: false,
      maxHealth: health,
    };
    this.events.push("bossSpawn");
    this.addShake(15);
  }

  /**
   * Drive the centipede each tick: head AI (wander toward free-cell
   * cluster, switch to player chase when wounded), eat-on-contact,
   * push position history, position segments along the trail, damage
   * the player on head contact.
   */
  private integrateCentipede(scale: number): void {
    const c = this.centipede;
    if (!c) return;
    const head = c.head;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;

    // ── Enrage transition (one-shot flash + shake) ───────────────────
    const enraged =
      (head.health ?? 0) < BOSS_HEALTH.centipede * CENTIPEDE_AGGRO_HEALTH_FRAC ||
      c.segments.length >= CENTIPEDE_MAX_SEGMENTS;
    if (enraged && !c.enragedFlashed) {
      c.enragedFlashed = true;
      this.events.push("bossEnrage");
      this.addShake(18);
      this.emitSparkle(head.x ?? 0, head.y ?? 0, "rgba(248, 113, 113,");
    }

    // ── Attack state machine ────────────────────────────────────────
    // Drives whether this tick is a normal pursuit, a windup hold,
    // a fast strike, or a slow recovery.
    const introChase =
      this.tickN - c.spawnedAtTickN < CENTIPEDE_INTRO_CHASE_TICKS;
    const distSq =
      (cx - (head.x ?? 0)) ** 2 + (cy - (head.y ?? 0)) ** 2;

    // Phase advancement on timer expiry.
    if (
      c.attackPhase !== "idle" &&
      this.wallMs >= c.attackPhaseUntilMs
    ) {
      if (c.attackPhase === "windup") {
        // Windup ends → strike. Lock the lunge vector aimed at where
        // the player is RIGHT NOW (not predicted) — gives the player
        // the standard fighting-game sidestep window.
        const ldx = cx - (head.x ?? 0);
        const ldy = cy - (head.y ?? 0);
        const ll = Math.hypot(ldx, ldy) || 1;
        c.lungeDx = ldx / ll;
        c.lungeDy = ldy / ll;
        c.attackPhase = "lunge";
        c.attackPhaseUntilMs = this.wallMs + LUNGE_DURATION_MS;
        this.events.push("bossLunge");
        this.addShake(8);
      } else if (c.attackPhase === "lunge") {
        c.attackPhase = "recover";
        c.attackPhaseUntilMs = this.wallMs + LUNGE_RECOVER_MS;
      } else if (c.attackPhase === "recover") {
        c.attackPhase = "idle";
        const cooldown = enraged ? LUNGE_COOLDOWN_ENRAGED_MS : LUNGE_COOLDOWN_MS;
        c.nextLungeAtMs = this.wallMs + cooldown;
      }
    }

    // Idle → windup if in range and off cooldown. Skip while intro is
    // still playing so the entry scene reads cleanly.
    if (
      c.attackPhase === "idle" &&
      !introChase &&
      this.wallMs >= c.nextLungeAtMs &&
      distSq <= LUNGE_RANGE_SQ
    ) {
      c.attackPhase = "windup";
      c.attackPhaseUntilMs = this.wallMs + LUNGE_WINDUP_MS;
      this.events.push("bossWindup");
    }

    // ── Target selection (only used by idle/windup/recover phases) ───
    let tx: number;
    let ty: number;
    if (introChase || enraged) {
      tx = cx;
      ty = cy;
    } else {
      // Find nearest free cell.
      let bestDx = 0;
      let bestDy = 0;
      let bestSq = Infinity;
      for (const f of this.freeBodies) {
        const dx = (f.x ?? 0) - (head.x ?? 0);
        const dy = (f.y ?? 0) - (head.y ?? 0);
        const sq = dx * dx + dy * dy;
        if (sq < bestSq) {
          bestSq = sq;
          bestDx = dx;
          bestDy = dy;
        }
      }
      tx = (head.x ?? 0) + bestDx;
      ty = (head.y ?? 0) + bestDy;
    }

    // ── Move head — speed depends on attack phase ───────────────────
    // Cap cycle speed bonus at +50% (cycle 5+). Without this, lunge
    // displacement at cycle 60+ outran the segment-spacing buffer and
    // stretched the chain across the entire viewport.
    const baseSpeed =
      CENTIPEDE_HEAD_SPEED * (1 + Math.min(c.cycleRound, 5) * 0.1) * (1 + (c.level - 1) * 0.1);
    if (c.attackPhase === "lunge") {
      // Locked direction, boosted speed. Mandibles fly forward.
      const lungeSpeed = baseSpeed * LUNGE_SPEED_MUL;
      head.vx = c.lungeDx * lungeSpeed;
      head.vy = c.lungeDy * lungeSpeed;
    } else if (c.attackPhase === "windup") {
      // Coiled — head almost stops, with a tiny back-step away from the
      // player so the rear-back is visible. Aim still points at player.
      const ldx = cx - (head.x ?? 0);
      const ldy = cy - (head.y ?? 0);
      const ll = Math.hypot(ldx, ldy) || 1;
      head.vx = -(ldx / ll) * baseSpeed * 0.25;
      head.vy = -(ldy / ll) * baseSpeed * 0.25;
    } else {
      // Idle or recover: pursue target at base or recovery speed.
      const dx = tx - (head.x ?? 0);
      const dy = ty - (head.y ?? 0);
      const len = Math.hypot(dx, dy) || 1;
      const speed =
        c.attackPhase === "recover"
          ? baseSpeed * LUNGE_RECOVER_SPEED_MUL
          : baseSpeed;
      head.vx = (dx / len) * speed;
      head.vy = (dy / len) * speed;
    }
    head.x = (head.x ?? 0) + head.vx * scale;
    head.y = (head.y ?? 0) + head.vy * scale;
    // Wrap.
    let hx = head.x ?? 0;
    let hy = head.y ?? 0;
    if (hx > a) hx -= span;
    else if (hx < -a) hx += span;
    if (hy > a) hy -= span;
    else if (hy < -a) hy += span;
    head.x = hx;
    head.y = hy;

    // ── Push history + position segments ─────────────────────────────
    c.positionHistory.unshift({ x: head.x, y: head.y });
    if (c.positionHistory.length > CENTIPEDE_HISTORY_MAX) {
      c.positionHistory.length = CENTIPEDE_HISTORY_MAX;
    }
    for (let i = 0; i < c.segments.length; i++) {
      const idx = (i + 1) * CENTIPEDE_SEGMENT_SPACING_TICKS;
      const p = c.positionHistory[Math.min(idx, c.positionHistory.length - 1)];
      const seg = c.segments[i];
      seg.x = p.x;
      seg.y = p.y;
    }

    // ── Eat free cells on head contact ──────────────────────────────
    if (c.segments.length < CENTIPEDE_MAX_SEGMENTS) {
      for (let i = this.freeBodies.length - 1; i >= 0; i--) {
        const f = this.freeBodies[i];
        const ddx = (f.x ?? 0) - (head.x ?? 0);
        const ddy = (f.y ?? 0) - (head.y ?? 0);
        const r = head.radius + f.radius + CENTIPEDE_EAT_RANGE;
        if (ddx * ddx + ddy * ddy <= r * r) {
          this.freeBodies.splice(i, 1);
          this.appendCentipedeSegment();
          break; // one eat per tick keeps it fair
        }
      }
    }

    // ── Damage player on head contact ───────────────────────────────
    if (this.tickN >= c.nextDamageTickN) {
      const cdx = cx - (head.x ?? 0);
      const cdy = cy - (head.y ?? 0);
      const cr = head.radius + (core?.radius ?? 18);
      if (cdx * cdx + cdy * cdy <= cr * cr) {
        // Lunge connections hurt much more — that's the punishment for
        // failing to dodge. Recovery contact also hurts (the player
        // shouldn't be able to ram the head harmlessly).
        const isLungeHit = c.attackPhase === "lunge";
        const dmgMul = isLungeHit ? LUNGE_DAMAGE_MUL : 1;
        this.damageAbsorbed(CENTIPEDE_PLAYER_DAMAGE * dmgMul);
        this.addShake(isLungeHit ? 22 : 12);
        this.events.push(isLungeHit ? "lungeHit" : "hit");
        this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
        c.nextDamageTickN = this.tickN + CENTIPEDE_PLAYER_DAMAGE_COOLDOWN_TICKS;
        // A lunge that connects ends in immediate recovery — no
        // double-tap into the player.
        if (isLungeHit) {
          c.attackPhase = "recover";
          c.attackPhaseUntilMs = this.wallMs + LUNGE_RECOVER_MS;
        }
        // Toxic-bell counter: stinger absorbs damage the head. Bonus
        // damage during recovery — punish window for the player.
        const stingers = this.absorbed.stinger ?? 0;
        if (stingers > 0 && head.health != null) {
          const stingerDmg =
            c.attackPhase === "recover" ? stingers * 2 : stingers;
          head.health -= stingerDmg;
          if (head.health <= 0) {
            this.killCentipede();
            return;
          }
        }
      }
    }
  }

  private appendCentipedeSegment(): void {
    const c = this.centipede;
    if (!c) return;
    const seg: Body = {
      id: newId("centipede-seg"),
      type: "spore",
      kind: "predator",
      radius: c.head.radius * 0.7,
      x: c.head.x ?? 0,
      y: c.head.y ?? 0,
      vx: 0,
      vy: 0,
      bossKind: "centipede",
      segmentIndex: c.segments.length + 1,
    };
    c.segments.push(seg);
    this.predators.push(seg);
  }

  /**
   * Sever the chain at the given segment index — that segment + every
   * one behind it gets converted back to free cells (the centipede
   * coughs up its meals). Caller is responsible for damaging the head
   * separately if the head was the target.
   */
  severCentipedeAt(segmentIndex: number): void {
    const c = this.centipede;
    if (!c) return;
    if (segmentIndex < 0 || segmentIndex >= c.segments.length) return;
    const cut = c.segments.splice(segmentIndex);
    for (const seg of cut) {
      // Remove from predators.
      const pi = this.predators.indexOf(seg);
      if (pi >= 0) this.predators.splice(pi, 1);
      // Convert back to a free cell — random non-core type.
      const types = FREE_POOL.filter((t) => t !== "core");
      const reborn: Body = {
        id: newId("reborn"),
        type: this.rng.pick(types),
        kind: "free",
        radius: NODE_RADIUS[this.rng.pick(types)] ?? 7,
        x: seg.x ?? 0,
        y: seg.y ?? 0,
        vx: this.rng.range(-MAX_FREE_SPEED, MAX_FREE_SPEED),
        vy: this.rng.range(-MAX_FREE_SPEED, MAX_FREE_SPEED),
      };
      // Keep within population cap.
      if (this.freeBodies.length < FREE_POP_MAX) {
        this.freeBodies.push(reborn);
      }
    }
    this.emitSparkle(c.head.x ?? 0, c.head.y ?? 0, "rgba(248, 113, 113,");
    this.addShake(6);
  }

  /**
   * Kill the centipede entirely: clear head + segments, fire reward,
   * spawn the next one at level cycling 1→2→3→1.
   */
  private killCentipede(): void {
    const c = this.centipede;
    if (!c) return;
    // Remove all centipede bodies from predators.
    this.predators = this.predators.filter((p) => p.bossKind !== "centipede");
    this.emitSparkle(c.head.x ?? 0, c.head.y ?? 0, "rgba(248, 113, 113,");
    this.addShake(20);
    this.events.push("killBoss");
    this.bossesDefeated += 1;
    const rewardType = CENTIPEDE_LEVEL_REWARD[c.level] ?? "membrane";
    const cycleMul = cycleScalar(c.cycleRound, 1.5, 1.08);
    const rewardAmount = Math.round(BOSS_REWARD_AMOUNT * cycleMul);
    for (let i = 0; i < rewardAmount; i++) {
      this.absorbed[rewardType] += 1;
      this.totalAbsorbed += 1;
    }
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
    this.traits = recomputeTraits(this.absorbed);
    this.centipede = null;
    this.checkMilestones();
    // Auto-spawn the next centipede after a brief breather (handled by
    // the tick loop via maybeRespawnCentipede so the player gets a beat
    // to collect the reward + reposition).
    this.nextCentipedeAtMs = this.wallMs + CENTIPEDE_RESPAWN_DELAY_MS;
  }

  /**
   * Hive Queen tick — drones orbit the queen + dive at the player on
   * a slow cadence. Queen drifts toward the player. While ANY drone
   * is alive, queen takes reduced damage (gating logic lives in the
   * fireStinger branch). Contact damage on queen + drones.
   */
  private integrateHiveQueen(scale: number): void {
    const h = this.hiveQueen;
    if (!h) return;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;

    // Queen drift toward player (slow + steady).
    const qx = h.body.x ?? 0;
    const qy = h.body.y ?? 0;
    const dxp = cx - qx;
    const dyp = cy - qy;
    const len = Math.hypot(dxp, dyp) || 1;
    h.body.vx = (dxp / len) * HIVE_QUEEN_SPEED;
    h.body.vy = (dyp / len) * HIVE_QUEEN_SPEED;
    let nx = qx + h.body.vx * scale;
    let ny = qy + h.body.vy * scale;
    if (nx > a) nx -= span;
    else if (nx < -a) nx += span;
    if (ny > a) ny -= span;
    else if (ny < -a) ny += span;
    h.body.x = nx;
    h.body.y = ny;

    // Drones orbit the queen at constant radius + rotation rate.
    const phase = this.tickN * HIVE_ORBIT_RATE;
    for (let i = 0; i < h.drones.length; i++) {
      const d = h.drones[i];
      const a0 = (i / HIVE_DRONE_COUNT) * Math.PI * 2 + phase;
      d.x = (h.body.x ?? 0) + Math.cos(a0) * HIVE_ORBIT_RADIUS;
      d.y = (h.body.y ?? 0) + Math.sin(a0) * HIVE_ORBIT_RADIUS;
      d.vx = -Math.sin(a0) * HIVE_ORBIT_RADIUS * HIVE_ORBIT_RATE;
      d.vy = Math.cos(a0) * HIVE_ORBIT_RADIUS * HIVE_ORBIT_RATE;
    }

    // Damage player on contact (queen body + any drone).
    if (this.tickN >= h.nextDamageTickN) {
      // Queen contact
      const qdx = cx - (h.body.x ?? 0);
      const qdy = cy - (h.body.y ?? 0);
      const qr = h.body.radius + (core?.radius ?? 18);
      if (qdx * qdx + qdy * qdy <= qr * qr) {
        this.damageAbsorbed(HIVE_QUEEN_DAMAGE);
        this.addShake(10);
        this.events.push("hit");
        this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
        h.nextDamageTickN = this.tickN + HIVE_PLAYER_DAMAGE_COOLDOWN_TICKS;
        // Toxic-bell counter — player's stinger count hurts the queen
        // on contact (reduced while drones still shield her).
        const stingers = this.absorbed.stinger ?? 0;
        if (stingers > 0 && h.body.health != null) {
          const dmg = h.drones.length > 0
            ? Math.max(1, Math.round(stingers * (1 - HIVE_QUEEN_DR_WITH_DRONES)))
            : stingers;
          h.body.health -= dmg;
          if (h.body.health <= 0) {
            this.killHiveQueen();
            return;
          }
        }
      } else {
        for (const d of h.drones) {
          const ddx = cx - (d.x ?? 0);
          const ddy = cy - (d.y ?? 0);
          const dr = d.radius + (core?.radius ?? 18);
          if (ddx * ddx + ddy * ddy <= dr * dr) {
            this.damageAbsorbed(HIVE_DRONE_DAMAGE);
            this.addShake(6);
            this.events.push("hit");
            this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
            h.nextDamageTickN = this.tickN + HIVE_PLAYER_DAMAGE_COOLDOWN_TICKS;
            // Toxic-bell counter — kills drones via contact
            const stingers = this.absorbed.stinger ?? 0;
            if (stingers > 0 && d.health != null) {
              d.health -= stingers;
              if (d.health <= 0) {
                h.drones = h.drones.filter((x) => x !== d);
                this.predators = this.predators.filter((p) => p !== d);
                this.emitSparkle(d.x ?? 0, d.y ?? 0, "rgba(255, 200, 120,");
              }
            }
            break;
          }
        }
      }
    }
  }

  /**
   * Mirror tick — chases player at slightly slower than max player
   * speed, deals contact damage scaled by its absorbed stingers.
   */
  private integrateMirror(scale: number): void {
    const m = this.mirror;
    if (!m) return;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const mx = m.body.x ?? 0;
    const my = m.body.y ?? 0;
    const dx = cx - mx;
    const dy = cy - my;
    const len = Math.hypot(dx, dy) || 1;
    const speed = MIRROR_SPEED * (1 + m.cycleRound * 0.1) * (1 + (m.level - 1) * 0.1);
    m.body.vx = (dx / len) * speed;
    m.body.vy = (dy / len) * speed;
    let nx = mx + m.body.vx * scale;
    let ny = my + m.body.vy * scale;
    if (nx > a) nx -= span;
    else if (nx < -a) nx += span;
    if (ny > a) ny -= span;
    else if (ny < -a) ny += span;
    m.body.x = nx;
    m.body.y = ny;

    // Damage player on contact.
    if (this.tickN >= m.nextDamageTickN) {
      const ddx = cx - (m.body.x ?? 0);
      const ddy = cy - (m.body.y ?? 0);
      const dr = m.body.radius + (core?.radius ?? 18);
      if (ddx * ddx + ddy * ddy <= dr * dr) {
        const stingerBite = m.mirroredAbsorbed.stinger ?? 0;
        const damage = 3 + Math.min(6, stingerBite);
        this.damageAbsorbed(damage);
        this.addShake(12);
        this.events.push("hit");
        this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
        m.nextDamageTickN = this.tickN + MIRROR_PLAYER_DAMAGE_COOLDOWN_TICKS;
        // Toxic-bell counter — player's stingers damage mirror on
        // contact. Mirror has no drone shield so this is full damage.
        const stingers = this.absorbed.stinger ?? 0;
        if (stingers > 0 && m.body.health != null) {
          m.body.health -= stingers;
          if (m.body.health <= 0) {
            this.killMirror();
            return;
          }
        }
      }
    }
  }

  /** Hive Queen kill: drop reward + clear from predators array. */
  private killHiveQueen(): void {
    const h = this.hiveQueen;
    if (!h) return;
    this.predators = this.predators.filter((p) => p !== h.body && !h.drones.includes(p));
    this.emitSparkle(h.body.x ?? 0, h.body.y ?? 0, "rgba(255, 200, 100,");
    this.addShake(20);
    this.events.push("killBoss");
    this.bossesDefeated += 1;
    const cycleMul = cycleScalar(h.cycleRound, 1.5, 1.08);
    const rewardAmount = Math.round(BOSS_REWARD_AMOUNT * cycleMul);
    for (let i = 0; i < rewardAmount; i++) {
      this.absorbed.spore += 1;
      this.totalAbsorbed += 1;
    }
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
    this.traits = recomputeTraits(this.absorbed);
    this.hiveQueen = null;
    this.checkMilestones();
    this.nextCentipedeAtMs = this.wallMs + CENTIPEDE_RESPAWN_DELAY_MS;
  }

  /** Mirror kill: drop reward + clear from predators array. */
  private killMirror(): void {
    const m = this.mirror;
    if (!m) return;
    this.predators = this.predators.filter((p) => p !== m.body);
    this.emitSparkle(m.body.x ?? 0, m.body.y ?? 0, "rgba(220, 140, 255,");
    this.addShake(20);
    this.events.push("killBoss");
    this.bossesDefeated += 1;
    const cycleMul = cycleScalar(m.cycleRound, 1.5, 1.08);
    const rewardAmount = Math.round(BOSS_REWARD_AMOUNT * cycleMul);
    for (let i = 0; i < rewardAmount; i++) {
      this.absorbed.stinger += 1;
      this.totalAbsorbed += 1;
    }
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
    this.traits = recomputeTraits(this.absorbed);
    this.mirror = null;
    this.checkMilestones();
    this.nextCentipedeAtMs = this.wallMs + CENTIPEDE_RESPAWN_DELAY_MS;
  }

  /**
   * Phage tick — slow drift toward player + periodic ranged virion
   * attack. Virions are simple linear projectiles that damage on
   * contact, despawn after life elapses.
   */
  private integratePhage(scale: number): void {
    const p = this.phage;
    if (!p) return;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;

    // Slow drift toward player.
    const px = p.body.x ?? 0;
    const py = p.body.y ?? 0;
    const dx = cx - px;
    const dy = cy - py;
    const len = Math.hypot(dx, dy) || 1;
    p.body.vx = (dx / len) * PHAGE_DRIFT_SPEED;
    p.body.vy = (dy / len) * PHAGE_DRIFT_SPEED;
    let nx = px + p.body.vx * scale;
    let ny = py + p.body.vy * scale;
    if (nx > a) nx -= span;
    else if (nx < -a) nx += span;
    if (ny > a) ny -= span;
    else if (ny < -a) ny += span;
    p.body.x = nx;
    p.body.y = ny;

    // Fire a virion at the player periodically.
    if (this.wallMs >= p.nextFireAtMs) {
      const ax = cx - (p.body.x ?? 0);
      const ay = cy - (p.body.y ?? 0);
      const al = Math.hypot(ax, ay) || 1;
      p.virions.push({
        x: p.body.x ?? 0,
        y: p.body.y ?? 0,
        vx: (ax / al) * PHAGE_VIRION_SPEED,
        vy: (ay / al) * PHAGE_VIRION_SPEED,
        bornMs: this.wallMs,
      });
      p.nextFireAtMs = this.wallMs +
        Math.max(1500, PHAGE_FIRE_INTERVAL_MS - p.cycleRound * 300 - (p.level - 1) * 200);
      p.lastFiredMs = this.wallMs;
      this.events.push("phageFire");
    }

    // Advance virions, despawn old, damage on hit.
    for (let i = p.virions.length - 1; i >= 0; i--) {
      const v = p.virions[i];
      v.x += v.vx * scale;
      v.y += v.vy * scale;
      const age = this.wallMs - v.bornMs;
      if (age > PHAGE_VIRION_LIFE_MS) {
        p.virions.splice(i, 1);
        continue;
      }
      // Wrap
      if (v.x > a) v.x -= span;
      else if (v.x < -a) v.x += span;
      if (v.y > a) v.y -= span;
      else if (v.y < -a) v.y += span;
      // Hit-test player
      const hdx = cx - v.x;
      const hdy = cy - v.y;
      const hr = (core?.radius ?? 18) + 5;
      if (hdx * hdx + hdy * hdy <= hr * hr) {
        this.damageAbsorbed(PHAGE_VIRION_DAMAGE);
        this.addShake(10);
        this.events.push("hit");
        this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
        p.virions.splice(i, 1);
      }
    }

    // Bell contact damage (toxic-bell counter — phage takes damage
    // from being rammed by a stinger-laced bell).
    if (this.tickN >= p.nextDamageTickN) {
      const bdx = cx - (p.body.x ?? 0);
      const bdy = cy - (p.body.y ?? 0);
      const br = p.body.radius + (core?.radius ?? 18);
      if (bdx * bdx + bdy * bdy <= br * br) {
        this.damageAbsorbed(3);
        this.addShake(8);
        this.events.push("hit");
        this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
        p.nextDamageTickN = this.tickN + PHAGE_PLAYER_DAMAGE_COOLDOWN_TICKS;
        const stingers = this.absorbed.stinger ?? 0;
        if (stingers > 0 && p.body.health != null) {
          p.body.health -= stingers;
          if (p.body.health <= 0) {
            this.killPhage();
            return;
          }
        }
      }
    }
  }

  /**
   * Ciliate tick — chases player aggressively + eats nearby free
   * cells (steals food from the player). Contact damage on hit.
   */
  private integrateCiliate(scale: number): void {
    const c = this.ciliate;
    if (!c) return;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;

    const bx = c.body.x ?? 0;
    const by = c.body.y ?? 0;
    const dx = cx - bx;
    const dy = cy - by;
    const len = Math.hypot(dx, dy) || 1;
    const speed = CILIATE_SPEED * (1 + c.cycleRound * 0.1) * (1 + (c.level - 1) * 0.1);
    c.body.vx = (dx / len) * speed;
    c.body.vy = (dy / len) * speed;
    let nx = bx + c.body.vx * scale;
    let ny = by + c.body.vy * scale;
    if (nx > a) nx -= span;
    else if (nx < -a) nx += span;
    if (ny > a) ny -= span;
    else if (ny < -a) ny += span;
    c.body.x = nx;
    c.body.y = ny;

    // Eat nearby free cells (food competition with player).
    for (let i = this.freeBodies.length - 1; i >= 0; i--) {
      const f = this.freeBodies[i];
      const ddx = (f.x ?? 0) - (c.body.x ?? 0);
      const ddy = (f.y ?? 0) - (c.body.y ?? 0);
      const r = c.body.radius + f.radius + CILIATE_EAT_RANGE;
      if (ddx * ddx + ddy * ddy <= r * r) {
        this.freeBodies.splice(i, 1);
        c.cellsEaten += 1;
        this.emitSparkle(f.x ?? 0, f.y ?? 0, "rgba(120, 220, 255,");
        break; // one eat per tick keeps the soup from emptying
      }
    }

    // Damage player on contact.
    if (this.tickN >= c.nextDamageTickN) {
      const cdx = cx - (c.body.x ?? 0);
      const cdy = cy - (c.body.y ?? 0);
      const cr = c.body.radius + (core?.radius ?? 18);
      if (cdx * cdx + cdy * cdy <= cr * cr) {
        this.damageAbsorbed(CILIATE_PLAYER_DAMAGE);
        this.addShake(11);
        this.events.push("hit");
        this.emitSparkle(cx, cy, "rgba(248, 113, 113,");
        c.nextDamageTickN = this.tickN + CILIATE_PLAYER_DAMAGE_COOLDOWN_TICKS;
        const stingers = this.absorbed.stinger ?? 0;
        if (stingers > 0 && c.body.health != null) {
          c.body.health -= stingers;
          if (c.body.health <= 0) {
            this.killCiliate();
            return;
          }
        }
      }
    }
  }

  private killPhage(): void {
    const p = this.phage;
    if (!p) return;
    this.predators = this.predators.filter((x) => x !== p.body);
    this.emitSparkle(p.body.x ?? 0, p.body.y ?? 0, "rgba(180, 220, 255,");
    this.addShake(20);
    this.events.push("killBoss");
    this.bossesDefeated += 1;
    const cycleMul = cycleScalar(p.cycleRound, 1.5, 1.08);
    const rewardAmount = Math.round(BOSS_REWARD_AMOUNT * cycleMul);
    for (let i = 0; i < rewardAmount; i++) {
      this.absorbed.mitochondrion += 1;
      this.totalAbsorbed += 1;
    }
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
    this.traits = recomputeTraits(this.absorbed);
    this.phage = null;
    this.checkMilestones();
    this.nextCentipedeAtMs = this.wallMs + CENTIPEDE_RESPAWN_DELAY_MS;
  }

  private killCiliate(): void {
    const c = this.ciliate;
    if (!c) return;
    this.predators = this.predators.filter((x) => x !== c.body);
    this.emitSparkle(c.body.x ?? 0, c.body.y ?? 0, "rgba(140, 240, 200,");
    this.addShake(20);
    this.events.push("killBoss");
    this.bossesDefeated += 1;
    const cycleMul = cycleScalar(c.cycleRound, 1.5, 1.08);
    const rewardAmount = Math.round(BOSS_REWARD_AMOUNT * cycleMul);
    for (let i = 0; i < rewardAmount; i++) {
      this.absorbed.chloroplast += 1;
      this.totalAbsorbed += 1;
    }
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
    this.traits = recomputeTraits(this.absorbed);
    this.ciliate = null;
    this.checkMilestones();
    this.nextCentipedeAtMs = this.wallMs + CENTIPEDE_RESPAWN_DELAY_MS;
  }

  /** Spawn the next boss when the breather window has elapsed.
   *  Cycles spirochete → volvox → amoeba → phage → ciliate → ... */
  private maybeRespawnCentipede(): void {
    if (this.centipede || this.hiveQueen || this.mirror || this.phage || this.ciliate) return;
    if (this.nextCentipedeAtMs == null) return;
    if (this.wallMs < this.nextCentipedeAtMs) return;
    this.nextCentipedeAtMs = null;
    const cycle: BossKind[] = ["centipede", "swarmLord", "tideMaw", "phage", "ciliate"];
    const nextKind = cycle[this.bossesDefeated % cycle.length];
    const nextLevel = (Math.floor(this.bossesDefeated / cycle.length) % 3) + 1;
    if (nextKind === "centipede") this.spawnCentipede(nextLevel);
    else if (nextKind === "swarmLord") this.spawnHiveQueen(nextLevel);
    else if (nextKind === "tideMaw") this.spawnMirror(nextLevel);
    else if (nextKind === "phage") this.spawnPhage(nextLevel);
    else if (nextKind === "ciliate") this.spawnCiliate(nextLevel);
  }

  /**
   * Steer predators toward the core. Recoiling predators drift on
   * existing velocity with friction so the player gets a brief
   * breathing window after a hit.
   */
  private integratePredators(scale = 1): void {
    if (this.predators.length === 0) return;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    for (const p of this.predators) {
      const speed =
        p.variant === "brute" ? PREDATOR_SPEED_BRUTE : PREDATOR_SPEED_SKIRMISHER;
      if (p.recoilUntil != null && p.recoilUntil > this.tickN) {
        p.x = (p.x ?? 0) + (p.vx ?? 0) * scale;
        p.y = (p.y ?? 0) + (p.vy ?? 0) * scale;
        p.vx = (p.vx ?? 0) * 0.92;
        p.vy = (p.vy ?? 0) * 0.92;
      } else {
        const dx = cx - (p.x ?? 0);
        const dy = cy - (p.y ?? 0);
        const len = Math.hypot(dx, dy) || 1;
        p.vx = (dx / len) * speed;
        p.vy = (dy / len) * speed;
        p.x = (p.x ?? 0) + p.vx * scale;
        p.y = (p.y ?? 0) + p.vy * scale;
      }
      let x = p.x ?? 0;
      let y = p.y ?? 0;
      if (x > a) x -= span;
      else if (x < -a) x += span;
      if (y > a) y -= span;
      else if (y < -a) y += span;
      p.x = x;
      p.y = y;
    }
  }

  /**
   * Resolve predator-vs-entity collisions. A predator that overlaps a
   * non-core captured node prunes it from the graph; a predator that
   * overlaps a lone core ends the run. Each predator handles at most
   * one hit per tick, then enters a recoil window so a single contact
   * doesn't strip the player in a few frames.
   */
  private resolveHits(): void {
    if (this.predators.length === 0) return;
    for (const p of this.predators) {
      if (p.recoilUntil != null && p.recoilUntil > this.tickN) continue;
      let hit: Body | null = null;
      const px = p.x ?? 0;
      const py = p.y ?? 0;
      for (const c of this.entityBodies) {
        const dx = (c.x ?? 0) - px;
        const dy = (c.y ?? 0) - py;
        const r = c.radius + p.radius;
        if (dx * dx + dy * dy <= r * r) {
          hit = c;
          break;
        }
      }
      if (!hit) continue;

      const isBrute = p.variant === "brute";
      const damage = isBrute ? HIT_DAMAGE_BRUTE : HIT_DAMAGE_SKIRMISHER;
      this.damageAbsorbed(damage);
      this.addShake(isBrute ? 14 : 8);
      this.events.push("hit");

      if (this.runStatus === "dead") return; // damageAbsorbed killed us

      this.emitSparkle(hit.x ?? 0, hit.y ?? 0, "rgba(248, 113, 113,");

      // Toxic bell — stinger absorbed counts as counter-damage.
      const stingers = this.absorbed.stinger ?? 0;
      if (stingers > 0 && p.health != null) {
        p.health -= stingers;
        if (p.health <= 0) {
          this.killPredator(p);
          continue;
        }
      }

      p.recoilUntil = this.tickN + PREDATOR_RECOIL_TICKS;
      const dx = (hit.x ?? 0) - px;
      const dy = (hit.y ?? 0) - py;
      const len = Math.hypot(dx, dy) || 1;
      p.vx = (-dx / len) * 2.0;
      p.vy = (-dy / len) * 2.0;
    }
  }

  /**
   * Take damage. Drains absorbed counts (random non-zero types first),
   * recomputes the stage, emits devolve / death events as needed.
   * Replaces the legacy pruneFromGraph in the absorb-counter model.
   */
  damageAbsorbed(amount: number): void {
    // Mark damage tick — render uses this for bell hit-flash.
    this.lastDamageTickN = this.tickN;
    // Membrane armor: each absorbed membrane reduces incoming damage
    // by 1, with a floor of 1 so you always feel the hit.
    const armor = this.absorbed.membrane ?? 0;
    let remaining = Math.max(1, amount - armor);
    while (remaining > 0 && this.totalAbsorbed > 0) {
      // Pick a random non-zero absorbed type to drain.
      const candidates: NodeTypeId[] = [];
      for (const k of Object.keys(this.absorbed) as NodeTypeId[]) {
        if (k === "core") continue;
        if ((this.absorbed[k] ?? 0) > 0) candidates.push(k);
      }
      if (candidates.length === 0) break;
      const pick = candidates[this.rng.int(0, candidates.length - 1)];
      this.absorbed[pick] -= 1;
      this.totalAbsorbed -= 1;
      remaining -= 1;
    }

    // Recompute traits (some may have dropped out).
    this.traits = recomputeTraits(this.absorbed);
    // Note: prevTraitSet untouched — devolution doesn't re-fire trait
    // unlock toasts on the way back up.

    // Stage may have dropped.
    const newStage = computeStage(this.totalAbsorbed);
    if (newStage < this.evolutionStage) {
      this.evolutionStage = newStage;
      this.events.push(`devolve:${newStage}` as WorldEvent);
    }

    // Shrink the core's physics radius back down.
    const core = this.entityBodies[0];
    if (core) {
      core.radius = 18 + Math.min(this.totalAbsorbed / 5, 22);
    }

    // Death: completely drained AND we still owed damage we couldn't pay.
    if (this.totalAbsorbed <= 0 && remaining > 0 && this.runStatus === "running") {
      this.runStatus = "dead";
      this.runEndedAtMs = this.wallMs;
      this.addShake(24);
      this.events.push("death");
    }
  }

  /** Legacy entry point; kept for back-compat with any external callers. */
  pruneFromGraph(_target: Body): void {
    /* no-op under absorb-counter model */
  }

  /** BFS from core; returns the set of captured-body ids reachable via bonds. */
  private connectedToCore(): Set<string> {
    if (this.entityBodies.length === 0) return new Set();
    const adj = new Map<string, Set<string>>();
    for (const b of this.entityBodies) adj.set(b.id, new Set());
    for (const bond of this.bonds) {
      const sId = typeof bond.source === "string" ? bond.source : (bond.source as Body).id;
      const tId = typeof bond.target === "string" ? bond.target : (bond.target as Body).id;
      adj.get(sId)?.add(tId);
      adj.get(tId)?.add(sId);
    }
    const coreId = this.entityBodies[0].id;
    const visited = new Set<string>([coreId]);
    const queue: string[] = [coreId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    return visited;
  }

  /**
   * Trait-driven motion: nudge the core's velocity toward the nearest
   * free cell each frame. The d3 sim's velocityDecay damps it so the
   * entity drifts at an equilibrium speed scaled by speedMul. Skipped
   * while the player is dragging the core (fx pin overrides motion).
   */
  private applyAutonomousSwim(): void {
    const mul = this.traits.speedMul;
    if (mul <= 0) return;
    const core = this.entityBodies[0];
    if (!core || core.fx != null) return;
    if (this.freeBodies.length === 0) return;
    const cx = core.x ?? 0;
    const cy = core.y ?? 0;
    let best: Body | null = null;
    let bestSq = Infinity;
    for (const f of this.freeBodies) {
      const dx = (f.x ?? 0) - cx;
      const dy = (f.y ?? 0) - cy;
      const d = dx * dx + dy * dy;
      if (d < bestSq) {
        bestSq = d;
        best = f;
      }
    }
    if (!best) return;
    const dx = (best.x ?? 0) - cx;
    const dy = (best.y ?? 0) - cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const accel = 0.5 * mul;
    core.vx = (core.vx ?? 0) + (dx / len) * accel;
    core.vy = (core.vy ?? 0) + (dy / len) * accel;
  }

  /**
   * Integrate free cells: jitter velocity, clamp speed, advance
   * position, torus-wrap at arena edges. O(n) per frame. Magnetized
   * cells (lock-on targets) bypass jitter / speed-clamp / torus and
   * home toward the core at fixed speed — they get captured on
   * arrival via the normal contact sweep.
   */
  /**
   * Return the current vector at world position (x, y). The field is
   * the sum of two slowly-rotating sin/cos waves; the rotation makes
   * eddies migrate so cells don't pool permanently.
   */
  currentAt(x: number, y: number): { x: number; y: number } {
    const t = this.wallMs;
    const rot = t * CURRENT_ROTATION;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    // Rotate the sample coords so the field itself rotates over time.
    const xr = x * cosR - y * sinR;
    const yr = x * sinR + y * cosR;
    const cx =
      Math.sin(xr * CURRENT_SPATIAL + t * CURRENT_TIME) * CURRENT_STRENGTH;
    const cy =
      Math.cos(yr * CURRENT_SPATIAL * 0.7 + t * CURRENT_TIME * 0.6) *
      CURRENT_STRENGTH;
    return { x: cx, y: cy };
  }

  private integrateFree(scale = 1): void {
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const FEAR_R2_BELL = FEAR_RANGE_BELL * FEAR_RANGE_BELL;
    const FEAR_R2_PRED = FEAR_RANGE_PRED * FEAR_RANGE_PRED;
    // Build a single quadtree this tick for boids neighbor lookups.
    // Re-used across every body — O(N log N) total instead of O(N²).
    const flockQt = this.freeBodies.length > 1
      ? buildQuadtree(this.freeBodies)
      : null;
    for (const b of this.freeBodies) {
      let vx = b.vx ?? 0;
      let vy = b.vy ?? 0;

      // ── Current ──────────────────────────────────────────────────
      // Slow rotating field — every cell catches a fraction of the
      // tide. Eddies form and migrate; barren stretches don't stay.
      const cur = this.currentAt(b.x ?? 0, b.y ?? 0);
      vx += cur.x;
      vy += cur.y;

      // ── Wander steering ──────────────────────────────────────────
      // Each cell carries a slow-drifting heading. Apply a small
      // persistent thrust along it. Gives idle motion intent — cells
      // pick a direction and commit briefly instead of pure jitter.
      if (b.wanderAngle == null) b.wanderAngle = this.rng.range(-Math.PI, Math.PI);
      b.wanderAngle += this.rng.range(-WANDER_HEADING_DRIFT, WANDER_HEADING_DRIFT);
      vx += Math.cos(b.wanderAngle) * WANDER_FORCE;
      vy += Math.sin(b.wanderAngle) * WANDER_FORCE;

      // Reduced jitter — wander handles most of the directional noise.
      vx += (this.rng.next() - 0.5) * JITTER * 0.4;
      vy += (this.rng.next() - 0.5) * JITTER * 0.4;

      // ── Boids flocking ─────────────────────────────────────────────
      // Separation against all neighbors (any type), alignment +
      // cohesion only against same-type schoolmates. Per-type weights
      // give each species a different feel — propulsion fish school
      // tightly, spores clump, membranes are solitary.
      if (flockQt) {
        const w = FLOCK_WEIGHTS[b.type];
        const bx = b.x ?? 0;
        const by = b.y ?? 0;
        let sepX = 0;
        let sepY = 0;
        let sumVx = 0;
        let sumVy = 0;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        rangeQuery(flockQt, bx, by, FLOCK_RADIUS, (other) => {
          if (other === b) return;
          if (other.kind !== "free") return;
          const dx = (other.x ?? 0) - bx;
          const dy = (other.y ?? 0) - by;
          const d2 = dx * dx + dy * dy;
          if (d2 > FLOCK_R2 || d2 < 0.25) return;
          // Separation — push away when too close (any type)
          if (d2 < SEP_R2) {
            const d = Math.sqrt(d2);
            const f = 1 - d / SEPARATION_RADIUS;
            sepX -= (dx / d) * f;
            sepY -= (dy / d) * f;
          }
          // Alignment + cohesion — same species only
          if (other.type === b.type) {
            sumVx += other.vx ?? 0;
            sumVy += other.vy ?? 0;
            sumX += other.x ?? 0;
            sumY += other.y ?? 0;
            count++;
          }
        });
        vx += sepX * w.sep;
        vy += sepY * w.sep;
        if (count > 0) {
          // Alignment — steer toward neighbors' avg velocity
          vx += (sumVx / count - vx) * w.ali;
          vy += (sumVy / count - vy) * w.ali;
          // Cohesion — drift toward neighbors' centroid
          const dxc = sumX / count - bx;
          const dyc = sumY / count - by;
          vx += dxc * w.coh * COHESION_SCALE;
          vy += dyc * w.coh * COHESION_SCALE;
        }
      }

      // Fear response — accelerate AWAY from the bell + nearby
      // predators if within range, scaled by per-type skittishness.
      const fearMul = FEAR_BY_TYPE[b.type] ?? 1;
      if (fearMul > 0) {
        const bx = b.x ?? 0;
        const by = b.y ?? 0;
        // Bell fear
        const dxb = bx - cx;
        const dyb = by - cy;
        const d2b = dxb * dxb + dyb * dyb;
        if (d2b < FEAR_R2_BELL && d2b > 0.5) {
          const d = Math.sqrt(d2b);
          const t = 1 - d / FEAR_RANGE_BELL;
          vx += (dxb / d) * FEAR_ACCEL * t * fearMul;
          vy += (dyb / d) * FEAR_ACCEL * t * fearMul;
        }
        // Predator fear (scan all predators — list is small).
        for (const p of this.predators) {
          const dxp = bx - (p.x ?? 0);
          const dyp = by - (p.y ?? 0);
          const d2p = dxp * dxp + dyp * dyp;
          if (d2p < FEAR_R2_PRED && d2p > 0.5) {
            const d = Math.sqrt(d2p);
            const t = 1 - d / FEAR_RANGE_PRED;
            vx += (dxp / d) * FEAR_ACCEL * t * fearMul * 0.8;
            vy += (dyp / d) * FEAR_ACCEL * t * fearMul * 0.8;
          }
        }
      }

      // ── Curiosity ────────────────────────────────────────────────
      // At medium distance to the bell — outside the fear zone but
      // close enough to notice — some species drift TOWARD it. Sensors
      // investigate, propulsion cells circle, others largely ignore.
      const curMul = CURIOSITY_BY_TYPE[b.type] ?? 0;
      if (curMul > 0) {
        const bx = b.x ?? 0;
        const by = b.y ?? 0;
        const dxc = cx - bx;
        const dyc = cy - by;
        const d = Math.hypot(dxc, dyc);
        if (d > CURIOSITY_INNER && d < CURIOSITY_OUTER) {
          // Triangular curve: peaks midway through the curiosity band.
          const mid = (CURIOSITY_INNER + CURIOSITY_OUTER) / 2;
          const peak = (CURIOSITY_OUTER - CURIOSITY_INNER) / 2;
          const t = 1 - Math.abs(d - mid) / peak;
          if (t > 0) {
            vx += (dxc / d) * 0.07 * t * curMul;
            vy += (dyc / d) * 0.07 * t * curMul;
          }
        }
      }

      // ── Tempo pulse ──────────────────────────────────────────────
      // Each cell breathes — speed scales by a slow personal sin wave.
      // Different cells are out of phase so the population doesn't
      // pulse in unison.
      if (b.tempoPhase == null) b.tempoPhase = this.rng.range(0, Math.PI * 2);
      const tempo = 1 + Math.sin(this.tickN * TEMPO_RATE + b.tempoPhase) * TEMPO_AMPLITUDE;
      vx *= tempo;
      vy *= tempo;

      const sp = Math.hypot(vx, vy);
      // Cells can briefly exceed MAX_FREE_SPEED when fleeing —
      // gives a real "panic flutter" feel.
      const maxNow = MAX_FREE_SPEED * 1.6;
      if (sp > maxNow) {
        vx = (vx / sp) * maxNow;
        vy = (vy / sp) * maxNow;
      }
      let x = (b.x ?? 0) + vx * scale;
      let y = (b.y ?? 0) + vy * scale;
      if (x > a) x -= span;
      else if (x < -a) x += span;
      if (y > a) y -= span;
      else if (y < -a) y += span;
      b.x = x;
      b.y = y;
      b.vx = vx;
      b.vy = vy;
    }
  }

  /**
   * Player input: fire a stinger at the nearest in-range predator.
   * Used by the on-screen attack button — keeps swim input free of
   * tap-to-shoot interruptions. Returns true on hit.
   */
  fireNearestStinger(nowMs: number): boolean {
    if (this.traits.lockOnRange <= 0) return false;
    if (nowMs < this.lockOnReadyAt) return false;
    if (this.entityBodies.length === 0) return false;
    const core = this.entityBodies[0];
    const cx = core.x ?? 0;
    const cy = core.y ?? 0;
    let nearest: Body | null = null;
    let nearestDistSq = this.traits.lockOnRange * this.traits.lockOnRange;
    for (const p of this.predators) {
      const dx = (p.x ?? 0) - cx;
      const dy = (p.y ?? 0) - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDistSq) {
        nearest = p;
        nearestDistSq = d2;
      }
    }
    if (!nearest) return false;
    return this.fireStinger(nearest, nowMs);
  }

  /**
   * Player input: fire a stinger projectile at a predator. Reuses the
   * lock-on trait + cooldown. Damage = stinger count. Hit is instant
   * (raycast), with a brief tracer pushed for the visual flash.
   */
  fireStinger(predator: Body, nowMs: number): boolean {
    if (predator.kind !== "predator") return false;
    if (this.traits.lockOnRange <= 0) return false;
    if (nowMs < this.lockOnReadyAt) return false;
    if (this.entityBodies.length === 0) return false;
    const stingers = this.countCapturedType("stinger");
    if (stingers <= 0) return false;
    const core = this.entityBodies[0];
    const dx = (predator.x ?? 0) - (core.x ?? 0);
    const dy = (predator.y ?? 0) - (core.y ?? 0);
    if (Math.hypot(dx, dy) > this.traits.lockOnRange) return false;

    // Push a tracer regardless of target type for the visual flash.
    this.tracers.push({
      x1: core.x ?? 0,
      y1: core.y ?? 0,
      x2: predator.x ?? 0,
      y2: predator.y ?? 0,
      age: 0,
      max: 14,
    });
    this.lockOnReadyAt = nowMs + this.traits.lockOnCooldownMs;
    this.events.push("lockOn");

    // Centipede-specific: head takes damage; segments sever the chain.
    if (predator.bossKind === "centipede") {
      const c = this.centipede;
      if (!c) return true;
      if (predator === c.head) {
        if (c.head.health == null) return true;
        // Recovery is the punish window — ranged hits do double during it.
        const dmg = c.attackPhase === "recover" ? stingers * 2 : stingers;
        c.head.health -= dmg;
        if (c.head.health <= 0) this.killCentipede();
      } else {
        const segIdx = c.segments.indexOf(predator);
        if (segIdx >= 0) this.severCentipedeAt(segIdx);
      }
      return true;
    }

    // Hive Queen: drones take damage first (they shield the queen).
    // Once all drones are dead, queen body becomes hittable.
    if (predator.bossKind === "swarmLord") {
      const h = this.hiveQueen;
      if (!h) return true;
      if (predator === h.body) {
        // Direct hit on queen body — reduced damage while drones alive.
        if (predator.health == null) return true;
        const dmg = h.drones.length > 0
          ? Math.max(1, Math.round(stingers * (1 - HIVE_QUEEN_DR_WITH_DRONES)))
          : stingers;
        predator.health -= dmg;
        if (predator.health <= 0) this.killHiveQueen();
      } else {
        // Drone — full damage. Killing it removes from chain.
        if (predator.health == null) return true;
        predator.health -= stingers;
        if (predator.health <= 0) {
          h.drones = h.drones.filter((d) => d !== predator);
          this.predators = this.predators.filter((p) => p !== predator);
          this.emitSparkle(predator.x ?? 0, predator.y ?? 0, "rgba(255, 200, 100,");
        }
      }
      return true;
    }

    // Mirror: single body, full damage. Once HP gone the mirror dies.
    if (predator.bossKind === "tideMaw") {
      const m = this.mirror;
      if (!m) return true;
      if (predator.health == null) return true;
      predator.health -= stingers;
      if (predator.health <= 0) this.killMirror();
      return true;
    }

    // Phage: single body, full stinger damage.
    if (predator.bossKind === "phage") {
      const p = this.phage;
      if (!p) return true;
      if (predator.health == null) return true;
      predator.health -= stingers;
      if (predator.health <= 0) this.killPhage();
      return true;
    }

    // Ciliate: single body, full stinger damage.
    if (predator.bossKind === "ciliate") {
      const c = this.ciliate;
      if (!c) return true;
      if (predator.health == null) return true;
      predator.health -= stingers;
      if (predator.health <= 0) this.killCiliate();
      return true;
    }

    // Generic predator damage (legacy path; unused with boss-only).
    if (predator.health == null) return true;
    predator.health -= stingers;
    if (predator.health <= 0) this.killPredator(predator);
    return true;
  }

  /**
   * Chloroplast regen — every (8000 / chloroplastCount) ms, restore 1
   * to the lowest-count non-core absorbed type. No-op without
   * chloroplasts. Skips if entity is already at peak (transcend).
   */
  private maybeRegen(): void {
    const chloros = this.absorbed.chloroplast ?? 0;
    if (chloros <= 0) return;
    if (this.wallMs < this.nextRegenAtMs) return;
    if (this.totalAbsorbed >= TRANSCEND_AT) return;
    this.nextRegenAtMs = this.wallMs + Math.max(800, 8000 / chloros);
    // Find the type with lowest non-zero count to top up. Falls back
    // to membrane (the structural baseline) if everything is at 0.
    let lowestType: NodeTypeId = "membrane";
    let lowestN = Infinity;
    for (const k of Object.keys(this.absorbed) as NodeTypeId[]) {
      if (k === "core") continue;
      const n = this.absorbed[k] ?? 0;
      if (n > 0 && n < lowestN) {
        lowestN = n;
        lowestType = k;
      }
    }
    this.absorbed[lowestType] = (this.absorbed[lowestType] ?? 0) + 1;
    this.totalAbsorbed += 1;
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);
    this.traits = recomputeTraits(this.absorbed);
  }

  /**
   * Free-cell ecology tick. Cells reproduce in moderate-density
   * neighborhoods (2–5 neighbors within ECOLOGY_NEIGHBOR_RANGE);
   * isolated cells (0 neighbors) decay with low probability. Bounded
   * by FREE_POP_MIN/MAX so the ecosystem stays playable.
   */
  private maybeRunEcology(): void {
    if (this.wallMs < this.nextEcologyAtMs) return;
    this.nextEcologyAtMs = this.wallMs + ECOLOGY_INTERVAL_MS;

    const qt = buildQuadtree(this.freeBodies);
    const reproduce: Body[] = [];
    const decay: Body[] = [];
    for (const b of this.freeBodies) {
      let n = 0;
      rangeQuery(qt, b.x ?? 0, b.y ?? 0, ECOLOGY_NEIGHBOR_RANGE, (other) => {
        if (other !== b) n++;
      });
      if (
        n >= ECOLOGY_REPRODUCE_MIN &&
        n <= ECOLOGY_REPRODUCE_MAX &&
        this.freeBodies.length + reproduce.length < FREE_POP_MAX
      ) {
        reproduce.push(b);
      } else if (n === 0 && this.rng.next() < ECOLOGY_DECAY_PROB) {
        decay.push(b);
      }
    }

    // Cap mutations per tick so populations move smoothly.
    for (const parent of reproduce.slice(0, ECOLOGY_REPRO_CAP_PER_TICK)) {
      const child = makeBody(
        parent.type,
        "free",
        (parent.x ?? 0) + this.rng.range(-30, 30),
        (parent.y ?? 0) + this.rng.range(-30, 30),
        this.rng.range(-MAX_FREE_SPEED, MAX_FREE_SPEED),
        this.rng.range(-MAX_FREE_SPEED, MAX_FREE_SPEED),
      );
      this.freeBodies.push(child);
    }
    for (const dead of decay.slice(0, ECOLOGY_DECAY_CAP_PER_TICK)) {
      const i = this.freeBodies.indexOf(dead);
      if (i >= 0) this.freeBodies.splice(i, 1);
    }

    // Population-floor safeguard so the arena never goes barren —
    // refill from cradles so geographic identity is preserved.
    while (this.freeBodies.length < FREE_POP_MIN) {
      this.freeBodies.push(this.spawnFree({ fromCradle: true }));
    }
  }

  /** Reheat the sim so a drag has springy follow-through. */
  reheat(target = 0.3): void {
    this.sim.alpha(Math.max(this.sim.alpha(), target));
  }

  /**
   * Bond a free body into the entity graph, linking it to the nearest
   * existing captured body. Mutates entityBodies / freeBodies and
   * re-hands the new node array to d3.forceSimulation.
   */
  /**
   * Absorb a free cell into the blob. Under the absorb-counter model
   * captures don't extend the entity graph — they bump per-type counts
   * + total. The bell evolves visually based on those counts.
   *
   * Returns null (legacy Bond return retained for API compat with the
   * captureNearby caller).
   */
  capture(free: Body): Bond | null {
    if (free.kind === "captured") return null;
    if (this.entityBodies.length === 0) return null;

    // Pull from free pool. Cell vanishes — no graph node added.
    const i = this.freeBodies.indexOf(free);
    if (i >= 0) this.freeBodies.splice(i, 1);
    free.kind = "captured";

    // Bump absorb counters.
    this.absorbed[free.type] = (this.absorbed[free.type] ?? 0) + 1;
    this.totalAbsorbed += 1;
    this.peakCaptured = Math.max(this.peakCaptured, this.totalAbsorbed);

    // Trait recompute — reads from absorb counts.
    this.traits = recomputeTraits(this.absorbed);
    for (const id of this.traits.active) {
      if (!this.prevTraitSet.has(id)) {
        this.events.push(`trait:${id}` as WorldEvent);
      }
    }
    this.prevTraitSet = new Set(this.traits.active);

    // Grow the core's physics radius with stage so the capture surface
    // scales as the blob evolves.
    const core = this.entityBodies[0];
    if (core) {
      core.radius = 18 + Math.min(this.totalAbsorbed / 5, 22);
    }
    this.events.push("capture");

    // Stage advancement.
    const newStage = computeStage(this.totalAbsorbed);
    if (newStage > this.evolutionStage) {
      this.evolutionStage = newStage;
      this.events.push(`evolve:${newStage}` as WorldEvent);
      this.addShake(10);
      // Open the body editor — Spore-style. Player picks + places one
      // organelle on the bell. World pauses until they do or skip.
      this.openEditor(newStage);
    }

    // Combo detection.
    this.recentCaptures.push(this.wallMs);
    this.recentCaptures = this.recentCaptures.filter(
      (t) => this.wallMs - t <= COMBO_WINDOW_MS,
    );
    if (
      this.recentCaptures.length >= COMBO_THRESHOLD &&
      this.wallMs > this.comboActiveUntilMs
    ) {
      this.comboActiveUntilMs = this.wallMs + COMBO_DURATION_MS;
      this.events.push("combo");
      this.recentCaptures = [];
    }

    // Biome milestones — fire ONLY when the next-unfired threshold is
    // met AND no boss is currently on the field. Otherwise queue. The
    // player has to finish the current boss before the next biome
    // event (and its boss) triggers.
    this.checkMilestones();

    // Transcend event is now folded into checkMilestones() so it's
    // gated on boss-clear like every other biome milestone.

    this.emitSparkle(free.x ?? 0, free.y ?? 0, "rgba(160, 240, 255,");
    this.reheat(0.4);
    return null;
  }

  /**
   * Open the body editor. Picks 3 part offerings (preferring kinds the
   * player hasn't placed yet so each pick adds new flavor), pauses the
   * world, and waits for the player to select + place or skip.
   */
  private openEditor(stage: number): void {
    if (this.placedParts.length >= MAX_PLACED_PARTS) return;
    if (this.editor.open) return;
    const all: NodeTypeId[] = [
      "propulsion",
      "sensor",
      "membrane",
      "mouth",
      "stinger",
      "chloroplast",
      "mitochondrion",
      "spore",
    ];
    const placedKinds = new Set(this.placedParts.map((p) => p.kind));
    const unplaced = all.filter((k) => !placedKinds.has(k));
    const pool = unplaced.length >= 3 ? unplaced : all;
    const local = [...pool];
    const offerings: NodeTypeId[] = [];
    for (let i = 0; i < 3 && local.length > 0; i++) {
      const idx = Math.floor(this.rng.next() * local.length);
      offerings.push(local.splice(idx, 1)[0]);
    }
    this.editor = {
      open: true,
      selectedKind: null,
      offerings,
      triggeredStage: stage,
    };
    this.paused = true;
    this.events.push("editorOpen");
  }

  /**
   * Player picked an offering. Auto-place at the next free slot around
   * the bell — Spore-style one-tap placement. Slots cycle around 8
   * cardinal directions starting from the front (0 rad) and stepping
   * by π/4. This keeps the placement flow to a single tap and removes
   * the failure modes of a separate canvas-tap placement step.
   */
  selectEditorPart(kind: NodeTypeId): void {
    if (!this.editor.open) return;
    if (!this.editor.offerings.includes(kind)) return;
    const slotIndex = this.placedParts.length % 8;
    // Slot 0 is the front, then alternate front-right, front-left, etc.
    // so early parts spread evenly instead of bunching.
    const slotOrder = [0, 4, 2, 6, 1, 5, 3, 7];
    const ord = slotOrder[slotIndex] ?? slotIndex;
    const angle = (ord / 8) * Math.PI * 2 - Math.PI;
    this.placedParts.push({
      id: newId("part"),
      kind,
      angle,
      placedAtTickN: this.tickN,
    });
    this.events.push("partPlaced");
    this.closeEditor();
  }

  /**
   * Legacy explicit-position placement — kept for tests / future drag
   * UI. Not wired to the canvas-tap flow anymore.
   */
  placeSelectedPart(worldX: number, worldY: number): void {
    if (!this.editor.open) return;
    const kind = this.editor.selectedKind;
    if (kind == null) return;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const angle = Math.atan2(worldY - cy, worldX - cx);
    this.placedParts.push({
      id: newId("part"),
      kind,
      angle,
      placedAtTickN: this.tickN,
    });
    this.events.push("partPlaced");
    this.closeEditor();
  }

  /** Skip the editor without placing anything. */
  closeEditor(): void {
    this.editor = {
      open: false,
      selectedKind: null,
      offerings: [],
      triggeredStage: -1,
    };
    this.paused = false;
    // Clear any latched thumbstick input so the bell doesn't snap
    // sideways the moment the world resumes.
    this.stickInput = null;
  }

  /**
   * Sweep free cells against the entity graph using a single quadtree
   * built once over the free pool. For each captured node we range-
   * query for free cells whose center sits within capture-radius +
   * pad, then verify with the precise contact threshold.
   *
   * Each capture also spawns a replacement free cell on the arena edge
   * so the swarm density stays steady.
   */
  captureNearby(): Bond[] {
    if (this.paused) return [];
    if (this.entityBodies.length === 0 || this.freeBodies.length === 0) return [];
    // Worst-case capture radius accounts for the largest free-cell type.
    const maxFreeR = Math.max(...this.freeBodies.map((b) => b.radius));
    const qt: BodyQuadtree = buildQuadtree(this.freeBodies);
    const formed: Bond[] = [];
    // Spore aura — every absorbed spore extends the capture surface.
    const spores = this.absorbed.spore ?? 0;
    const sporeBonus = spores * 6;

    for (const c of this.entityBodies) {
      if (c.type !== "core" && c.type !== "mouth") continue;
      const cx = c.x ?? 0;
      const cy = c.y ?? 0;
      const comboBonus = this.wallMs < this.comboActiveUntilMs ? COMBO_RADIUS_BONUS : 0;
      const bonus = this.traits.captureRadiusBonus + comboBonus + sporeBonus;
      const searchR = c.radius + maxFreeR + CAPTURE_PAD + bonus;
      rangeQuery(qt, cx, cy, searchR, (free) => {
        if (free.kind !== "free") return;
        const dx = (free.x ?? 0) - cx;
        const dy = (free.y ?? 0) - cy;
        const r = c.radius + free.radius + CAPTURE_PAD + bonus;
        if (dx * dx + dy * dy <= r * r) {
          const bond = this.capture(free);
          if (bond) formed.push(bond);
        }
      });
    }

    // No auto-respawn here — free-cell ecology handles replenishment.
    return formed;
  }

  /**
   * Convert a screen-space point (canvas pixel coords) to world coords
   * using the current camera transform. Mirrors d3.zoomTransform.invert.
   */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.camera.x) / this.camera.k,
      y: (sy - this.camera.y) / this.camera.k,
    };
  }

  /** Convert a world-space point back to canvas pixels. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.camera.k + this.camera.x,
      y: wy * this.camera.k + this.camera.y,
    };
  }

  /**
   * Find the topmost body whose disk contains the given world point.
   * Iterates back-to-front; bodies drawn later (entityBodies after
   * freeBodies in the combined view) take precedence.
   * Free cells go through the quadtree; entity bodies are tiny, scan
   * linear. O(log n) for the swarm.
   */
  hitTest(wx: number, wy: number): Body | null {
    // Scan entity bodies first, but reversed — last drawn = topmost.
    for (let i = this.entityBodies.length - 1; i >= 0; i--) {
      const b = this.entityBodies[i];
      const dx = (b.x ?? 0) - wx;
      const dy = (b.y ?? 0) - wy;
      if (dx * dx + dy * dy <= b.radius * b.radius) return b;
    }
    // Then predators — they're tap-targets for stinger fire.
    for (const p of this.predators) {
      const dx = (p.x ?? 0) - wx;
      const dy = (p.y ?? 0) - wy;
      if (dx * dx + dy * dy <= p.radius * p.radius) return p;
    }
    // Then free cells via quadtree.
    if (this.freeBodies.length === 0) return null;
    const maxR = Math.max(...this.freeBodies.map((b) => b.radius));
    const qt = buildQuadtree(this.freeBodies);
    let hit: Body | null = null;
    rangeQuery(qt, wx, wy, maxR, (b) => {
      if (hit) return;
      const dx = (b.x ?? 0) - wx;
      const dy = (b.y ?? 0) - wy;
      if (dx * dx + dy * dy <= b.radius * b.radius) hit = b;
    });
    return hit;
  }

  countByKind(): { captured: number; free: number } {
    return { captured: this.entityBodies.length, free: this.freeBodies.length };
  }

  /** Current combo chain length (entries within the sliding window). */
  comboChain(): number {
    let n = 0;
    for (const t of this.recentCaptures) {
      if (this.wallMs - t <= COMBO_WINDOW_MS) n++;
    }
    return n;
  }

  dispose(): void {
    this.sim.stop();
  }
}
