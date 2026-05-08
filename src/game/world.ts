import * as d3 from "d3";
import type { Body, Bond, Camera, NodeTypeId } from "./types";
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
/** Total absorbed count that ends the run as a transcend (win). */
const TRANSCEND_AT = 80;
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
const MAX_PREDATORS = 5;
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

/** Events the world emits each tick — drained by the React layer. */
export type WorldEvent =
  | "capture"
  | "hit"
  | "transcend"
  | "death"
  | "lockOn"
  | "telegraph"
  | "combo"
  | "killPred"
  | `trait:${string}`
  | `biome:${number}`
  | `evolve:${number}`
  | `devolve:${number}`;

/** Capture-combo tuning. */
const COMBO_WINDOW_MS = 2000;
const COMBO_THRESHOLD = 3;
const COMBO_DURATION_MS = 3000;
const COMBO_ACCEL_MUL = 1.4;
const COMBO_RADIUS_BONUS = 8;

/** Captured-count milestones that trigger a biome flourish. */
const BIOME_MILESTONES = [20, 40, 60];

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
  /** 0 (surface) → 3 (depth 60). Darkens the bg gradient as you descend. */
  biomeStage: number;
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
    const freeCount = config.freeCount ?? 200;
    this.arenaHalf = config.arenaHalf ?? 1500;
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
    this.biomeStage = 0;
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
  private spawnFree(opts: { onEdge?: boolean; biasToAlive?: boolean } = {}): Body {
    const type = this.rng.pick(FREE_POOL);
    const a = this.arenaHalf;
    let x: number;
    let y: number;

    if (opts.biasToAlive) {
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
      this.maybeSpawnPredator();
      this.resolveTelegraphs();
      this.applySteerForce();
      this.applyAutonomousSwim();
    }
    this.integrateFree(scale);
    this.integratePredators(scale);
    this.simAccum += scale;
    while (this.simAccum >= 1) {
      this.sim.tick();
      this.simAccum -= 1;
    }
    if (this.runStatus === "running") this.resolveHits();
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
    if (!this.stickInput) return;
    const core = this.entityBodies[0];
    if (!core) return;
    const { ux, uy, t } = this.stickInput;
    if (t < 0.05) return;
    core.fx = null;
    core.fy = null;
    const comboMul = this.wallMs < this.comboActiveUntilMs ? COMBO_ACCEL_MUL : 1;
    const accel = t * 1.5 * comboMul;
    core.vx = (core.vx ?? 0) + ux * accel;
    core.vy = (core.vy ?? 0) + uy * accel;
    const MAX_VEL = 9 * comboMul;
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

  /**
   * Difficulty curve: as the entity grows, predators spawn faster and
   * the cap rises. Both saturate around captured=30 so a transcend run
   * doesn't get unwinnable.
   */
  private currentSpawnIntervalMs(): number {
    const captured = this.entityBodies.length;
    const factor = Math.min(1, captured / 30);
    return Math.round(PREDATOR_SPAWN_INTERVAL_MS - factor * 3500);
  }
  private currentMaxPredators(): number {
    const captured = this.entityBodies.length;
    return Math.min(8, 2 + Math.floor(captured / 8));
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
    this.events.push("killPred");
    this.addShake(p.variant === "brute" ? 9 : 5);
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
    let remaining = amount;
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
      if (f.magnetized) continue;
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
  private integrateFree(scale = 1): void {
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    const PULL_SPEED = 6;
    for (const b of this.freeBodies) {
      if (b.magnetized) {
        const dx = cx - (b.x ?? 0);
        const dy = cy - (b.y ?? 0);
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          b.vx = (dx / len) * PULL_SPEED;
          b.vy = (dy / len) * PULL_SPEED;
        }
        b.x = (b.x ?? 0) + (b.vx ?? 0) * scale;
        b.y = (b.y ?? 0) + (b.vy ?? 0) * scale;
        continue;
      }
      let vx = b.vx ?? 0;
      let vy = b.vy ?? 0;
      vx += (this.rng.next() - 0.5) * JITTER;
      vy += (this.rng.next() - 0.5) * JITTER;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_FREE_SPEED) {
        vx = (vx / sp) * MAX_FREE_SPEED;
        vy = (vy / sp) * MAX_FREE_SPEED;
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
   * Player input: try to magnetize a free cell into the entity. Honors
   * lock-on range and cooldown. Returns true if the request was
   * accepted. Capture itself happens later when the magnetized cell
   * arrives at the core (via integrator → captureNearby).
   */
  lockOn(target: Body, nowMs: number): boolean {
    if (this.traits.lockOnRange <= 0) return false;
    if (target.kind !== "free") return false;
    if (target.magnetized) return false;
    if (nowMs < this.lockOnReadyAt) return false;
    if (this.entityBodies.length === 0) return false;
    const core = this.entityBodies[0];
    const dx = (target.x ?? 0) - (core.x ?? 0);
    const dy = (target.y ?? 0) - (core.y ?? 0);
    if (Math.hypot(dx, dy) > this.traits.lockOnRange) return false;
    target.magnetized = true;
    this.lockOnReadyAt = nowMs + this.traits.lockOnCooldownMs;
    this.events.push("lockOn");
    return true;
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
    if (predator.health == null) return false;
    predator.health -= stingers;
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
    if (predator.health <= 0) this.killPredator(predator);
    return true;
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
    free.magnetized = false;

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

    // Biome milestones based on totalAbsorbed.
    for (let m = 0; m < BIOME_MILESTONES.length; m++) {
      const t = BIOME_MILESTONES[m];
      if (this.totalAbsorbed === t) {
        this.events.push(`biome:${t}` as WorldEvent);
        this.addShake(8);
        this.biomeStage = m + 1;
      }
    }

    if (this.totalAbsorbed >= TRANSCEND_AT && this.runStatus === "running") {
      this.runStatus = "transcended";
      this.runEndedAtMs = this.wallMs;
      this.addShake(15);
      this.events.push("transcend");
    }

    this.emitSparkle(free.x ?? 0, free.y ?? 0, "rgba(160, 240, 255,");
    this.reheat(0.4);
    return null;
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
    if (this.entityBodies.length === 0 || this.freeBodies.length === 0) return [];
    // Worst-case capture radius accounts for the largest free-cell type.
    const maxFreeR = Math.max(...this.freeBodies.map((b) => b.radius));
    const qt: BodyQuadtree = buildQuadtree(this.freeBodies);
    const formed: Bond[] = [];
    const toSpawn: Body[] = [];

    for (const c of this.entityBodies) {
      // Only the bell + mouth organelles eat. Other captured cells are
      // ride-along — the player has to actually steer prey into the
      // capture surface, which makes mouths tactically meaningful.
      if (c.type !== "core" && c.type !== "mouth") continue;
      const cx = c.x ?? 0;
      const cy = c.y ?? 0;
      const comboBonus = this.wallMs < this.comboActiveUntilMs ? COMBO_RADIUS_BONUS : 0;
      const bonus = this.traits.captureRadiusBonus + comboBonus;
      const searchR = c.radius + maxFreeR + CAPTURE_PAD + bonus;
      rangeQuery(qt, cx, cy, searchR, (free) => {
        // The body might have been captured this same sweep; skip.
        if (free.kind !== "free") return;
        const dx = (free.x ?? 0) - cx;
        const dy = (free.y ?? 0) - cy;
        const r = c.radius + free.radius + CAPTURE_PAD + bonus;
        if (dx * dx + dy * dy <= r * r) {
          const bond = this.capture(free);
          if (bond) {
            formed.push(bond);
            // Bias respawns toward CA live zones — that's where the
            // "prey grows" — falling back to edge if grid is dead.
            toSpawn.push(this.spawnFree({ biasToAlive: true }));
          }
        }
      });
    }

    if (toSpawn.length) this.freeBodies.push(...toSpawn);
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
