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
/** Captured-node count that ends the run as a transcend (win). */
const TRANSCEND_AT = 80;
/** Predator config. */
const PREDATOR_RADIUS = 14;
const PREDATOR_SPEED = 0.6;
const PREDATOR_RECOIL_TICKS = 30;
const PREDATOR_FIRST_SPAWN_MS = 8000;
const PREDATOR_SPAWN_INTERVAL_MS = 5000;
const PREDATOR_MIN_SPAWN_DISTANCE = 400;
const MAX_PREDATORS = 5;
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
  /** Captured nodes — in d3.forceSimulation. */
  entityBodies: Body[];
  /** Free-floating cells — manual integrator. */
  freeBodies: Body[];
  bonds: Bond[];
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
  /** Viewport in CSS pixels. Camera follow keeps the core at viewport center. */
  viewportWidth: number;
  viewportHeight: number;
  /** Recent core positions for tentacle / wake rendering. */
  coreTrail: { x: number; y: number }[];
  /** Short-lived expanding rings on capture / hit. */
  sparkles: { x: number; y: number; age: number; max: number; hue: string }[];
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
    this.traits = emptyTraitState();
    this.lockOnReadyAt = 0;
    this.predators = [];
    this.runStatus = "running";
    this.runStartedAtMs = 0;
    this.runEndedAtMs = null;
    this.peakCaptured = 1;
    this.wallMs = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.coreTrail = [];
    this.sparkles = [];
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
      .force("collide", d3.forceCollide<Body>((d) => d.radius + 2))
      .force("link", this.linkForce)
      .alphaDecay(0.005)
      .stop();

    this.camera = { k: 1, x: 0, y: 0 };
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
    if (this.runStatus !== "running") return;
    this.wallMs += dtMs;
    this.envCA.update(dtMs);
    this.maybeSpawnPredator();
    this.applyAutonomousSwim();
    this.integrateFree();
    this.integratePredators();
    this.sim.tick();
    this.resolveHits();
    this.updateCameraFollow();
    this.updateCoreTrail();
    this.updateSparkles();
    this.tickN += 1;
  }

  /** Tell the world how big the viewport is. Camera follow uses this. */
  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * Lerp camera so the core sits near viewport center. Stays in screen
   * pixels (not world units) — d3.zoom's transform shape. Skipped if
   * viewport hasn't been set (tests).
   */
  private updateCameraFollow(): void {
    if (this.viewportWidth === 0 || this.viewportHeight === 0) return;
    const core = this.entityBodies[0];
    if (!core) return;
    const targetX = this.viewportWidth / 2 - (core.x ?? 0) * this.camera.k;
    const targetY = this.viewportHeight / 2 - (core.y ?? 0) * this.camera.k;
    // 0.18 ≈ ~150ms time-constant at 60fps. Smooth without rubber-banding.
    const lerp = 0.18;
    this.camera.x += (targetX - this.camera.x) * lerp;
    this.camera.y += (targetY - this.camera.y) * lerp;
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
    if (this.sparkles.length === 0) return;
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.age += 1;
      if (s.age >= s.max) this.sparkles.splice(i, 1);
    }
  }

  emitSparkle(x: number, y: number, hue = "rgba(160, 240, 255,"): void {
    this.sparkles.push({ x, y, age: 0, max: 22, hue });
  }

  /** Time-gated periodic predator spawn, capped at MAX_PREDATORS. */
  private maybeSpawnPredator(): void {
    if (this.predators.length >= MAX_PREDATORS) return;
    if (this.wallMs < this.nextPredatorSpawnAt) return;
    this.predators.push(this.spawnPredator());
    this.nextPredatorSpawnAt = this.wallMs + PREDATOR_SPAWN_INTERVAL_MS;
  }

  /**
   * Build a predator at a CA dead zone, bumped outward to keep it from
   * appearing inside the entity. Velocity starts at 0 — the integrator
   * picks it up and steers toward the core next tick.
   */
  private spawnPredator(): Body {
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
    return {
      id: newId("predator"),
      type: "spore", // placeholder — predator render path doesn't read NODE_COLOR
      kind: "predator",
      radius: PREDATOR_RADIUS,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
    };
  }

  /**
   * Steer predators toward the core. Recoiling predators drift on
   * existing velocity with friction so the player gets a brief
   * breathing window after a hit.
   */
  private integratePredators(): void {
    if (this.predators.length === 0) return;
    const a = this.arenaHalf;
    const span = a * 2;
    const core = this.entityBodies[0];
    const cx = core?.x ?? 0;
    const cy = core?.y ?? 0;
    for (const p of this.predators) {
      if (p.recoilUntil != null && p.recoilUntil > this.tickN) {
        p.x = (p.x ?? 0) + (p.vx ?? 0);
        p.y = (p.y ?? 0) + (p.vy ?? 0);
        p.vx = (p.vx ?? 0) * 0.92;
        p.vy = (p.vy ?? 0) * 0.92;
      } else {
        const dx = cx - (p.x ?? 0);
        const dy = cy - (p.y ?? 0);
        const len = Math.hypot(dx, dy) || 1;
        p.vx = (dx / len) * PREDATOR_SPEED;
        p.vy = (dy / len) * PREDATOR_SPEED;
        p.x = (p.x ?? 0) + p.vx;
        p.y = (p.y ?? 0) + p.vy;
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

      const isCore = hit === this.entityBodies[0];
      if (isCore) {
        if (this.entityBodies.length === 1) {
          this.runStatus = "dead";
          this.runEndedAtMs = this.wallMs;
          return;
        }
        // Glancing blow on core while shielded by other captured nodes — recoil only.
      } else {
        this.pruneFromGraph(hit);
      }

      this.emitSparkle(hit.x ?? 0, hit.y ?? 0, "rgba(248, 113, 113,");
      p.recoilUntil = this.tickN + PREDATOR_RECOIL_TICKS;
      const dx = (hit.x ?? 0) - px;
      const dy = (hit.y ?? 0) - py;
      const len = Math.hypot(dx, dy) || 1;
      p.vx = (-dx / len) * 2.0;
      p.vy = (-dy / len) * 2.0;
    }
  }

  /**
   * Remove `target` from the entity graph and drop it back into the
   * free pool. Cascade: any captured nodes whose only path to the core
   * went through `target` are also released — keeps the entity always
   * connected.
   */
  pruneFromGraph(target: Body): void {
    if (this.entityBodies.length === 0) return;
    if (target === this.entityBodies[0]) return;

    const removeBondsTouching = (id: string) => {
      this.bonds = this.bonds.filter((b) => {
        const sId = typeof b.source === "string" ? b.source : (b.source as Body).id;
        const tId = typeof b.target === "string" ? b.target : (b.target as Body).id;
        return sId !== id && tId !== id;
      });
    };
    const removeFromEntity = (b: Body) => {
      const i = this.entityBodies.indexOf(b);
      if (i >= 0) this.entityBodies.splice(i, 1);
      b.kind = "free";
      b.magnetized = false;
      this.freeBodies.push(b);
    };

    removeBondsTouching(target.id);
    removeFromEntity(target);

    // Cascade: anything no longer reachable from the core also goes free.
    const reachable = this.connectedToCore();
    const orphans: Body[] = [];
    for (const b of this.entityBodies) {
      if (b === this.entityBodies[0]) continue;
      if (!reachable.has(b.id)) orphans.push(b);
    }
    for (const o of orphans) {
      removeBondsTouching(o.id);
      removeFromEntity(o);
    }

    this.sim.nodes(this.entityBodies);
    this.linkForce.links(this.bonds);
    this.traits = recomputeTraits(this.entityBodies, this.bonds);
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
  private integrateFree(): void {
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
        b.x = (b.x ?? 0) + (b.vx ?? 0);
        b.y = (b.y ?? 0) + (b.vy ?? 0);
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
      let x = (b.x ?? 0) + vx;
      let y = (b.y ?? 0) + vy;
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
  capture(free: Body): Bond | null {
    if (free.kind === "captured") return null;
    if (this.entityBodies.length === 0) return null;

    let nearest = this.entityBodies[0];
    let bestSq = Infinity;
    const fx = free.x ?? 0;
    const fy = free.y ?? 0;
    for (const c of this.entityBodies) {
      const dx = (c.x ?? 0) - fx;
      const dy = (c.y ?? 0) - fy;
      const d = dx * dx + dy * dy;
      if (d < bestSq) {
        bestSq = d;
        nearest = c;
      }
    }

    // Move from free pool → entity graph.
    const i = this.freeBodies.indexOf(free);
    if (i >= 0) this.freeBodies.splice(i, 1);
    free.kind = "captured";
    this.entityBodies.push(free);
    // Hand the updated node array to d3 so charge/collide/link include it.
    this.sim.nodes(this.entityBodies);

    const bond: Bond = {
      id: newId("bond"),
      source: free.id,
      target: nearest.id,
      strength: 1,
      formedAt: this.tickN,
    };
    this.bonds.push(bond);
    this.linkForce.links(this.bonds);
    // Graph-mutation hook: refresh derived gameplay state once.
    this.traits = recomputeTraits(this.entityBodies, this.bonds);
    // Captured cell rejoins the swarm-free pool only on death; clear
    // any in-flight lock-on bias.
    free.magnetized = false;
    this.peakCaptured = Math.max(this.peakCaptured, this.entityBodies.length);
    if (this.entityBodies.length >= TRANSCEND_AT && this.runStatus === "running") {
      this.runStatus = "transcended";
      this.runEndedAtMs = this.wallMs;
    }
    this.emitSparkle(free.x ?? 0, free.y ?? 0, "rgba(160, 240, 255,");
    this.reheat(0.4);
    return bond;
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
      const cx = c.x ?? 0;
      const cy = c.y ?? 0;
      const bonus = this.traits.captureRadiusBonus;
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

  dispose(): void {
    this.sim.stop();
  }
}
