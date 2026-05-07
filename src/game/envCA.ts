import type { Rng } from "@/lib/rng";

/**
 * Cell states. Two-state Conway (B3/S23) — 0 = dead, 1 = alive.
 * Phase 9 may upgrade this to Lenia (continuous values 0..1).
 */
const DEAD = 0;
const ALIVE = 1;

export interface EnvCAConfig {
  width?: number;
  height?: number;
  /** Half-extent of the world arena the grid maps onto. */
  arenaHalf: number;
  /** Logical tick rate. CLAUDE.md fixes this at 4 Hz. */
  hz?: number;
  /** Initial fraction of cells set ALIVE on construction. */
  initialDensity?: number;
  /** Sprinkle this many random ALIVE cells every `perturbEvery` steps. */
  perturbEvery?: number;
  perturbCount?: number;
}

/**
 * Environmental cellular automaton. Conway B3/S23 with periodic random
 * perturbation so activity doesn't die out — the player needs the
 * grid to "breathe" continuously, not stabilize. Toroidal boundary
 * matches the arena's torus topology.
 *
 * Owns its own time accumulator: pass real dt (ms) into update() and
 * the CA steps as many times as needed to catch up. This keeps the
 * 4 Hz logical rate independent of render fps.
 */
export class EnvCA {
  readonly width: number;
  readonly height: number;
  readonly arenaHalf: number;
  readonly tickIntervalMs: number;
  cells: Uint8Array;
  next: Uint8Array;
  /** Set true on every step(); cleared by the renderer once it consumes. */
  dirty: boolean;
  /** Logical step counter — drives perturbation cadence + tests. */
  steps: number;
  private msSinceTick: number;
  private rng: Rng;
  private perturbEvery: number;
  private perturbCount: number;

  constructor(config: EnvCAConfig, rng: Rng) {
    this.width = config.width ?? 128;
    this.height = config.height ?? 128;
    this.arenaHalf = config.arenaHalf;
    this.tickIntervalMs = 1000 / (config.hz ?? 4);
    this.perturbEvery = config.perturbEvery ?? 30;
    this.perturbCount = config.perturbCount ?? 8;
    this.rng = rng;

    const n = this.width * this.height;
    this.cells = new Uint8Array(n);
    this.next = new Uint8Array(n);

    const density = config.initialDensity ?? 0.18;
    for (let i = 0; i < n; i++) {
      this.cells[i] = rng.next() < density ? ALIVE : DEAD;
    }
    this.dirty = true;
    this.steps = 0;
    this.msSinceTick = 0;
  }

  /**
   * Advance physical time. Steps the CA every `tickIntervalMs` of
   * accumulated real time — independent of the caller's frame rate.
   */
  update(dtMs: number): number {
    this.msSinceTick += dtMs;
    let stepped = 0;
    // Cap the catch-up so a long pause / hidden tab doesn't run away.
    const maxSteps = 6;
    while (this.msSinceTick >= this.tickIntervalMs && stepped < maxSteps) {
      this.msSinceTick -= this.tickIntervalMs;
      this.step();
      stepped++;
    }
    if (stepped === maxSteps && this.msSinceTick > this.tickIntervalMs) {
      // Drop the backlog — we've already done six in a row.
      this.msSinceTick = 0;
    }
    return stepped;
  }

  /** One Conway B3/S23 step with toroidal wrap + periodic perturbation. */
  step(): void {
    const w = this.width;
    const h = this.height;
    const c = this.cells;
    const n = this.next;
    for (let y = 0; y < h; y++) {
      const yPrev = (y - 1 + h) % h;
      const yNext = (y + 1) % h;
      const rowBase = y * w;
      const rowPrev = yPrev * w;
      const rowNext = yNext * w;
      for (let x = 0; x < w; x++) {
        const xPrev = (x - 1 + w) % w;
        const xNext = (x + 1) % w;
        const live =
          c[rowPrev + xPrev] +
          c[rowPrev + x] +
          c[rowPrev + xNext] +
          c[rowBase + xPrev] +
          c[rowBase + xNext] +
          c[rowNext + xPrev] +
          c[rowNext + x] +
          c[rowNext + xNext];
        const cur = c[rowBase + x];
        // B3/S23
        n[rowBase + x] =
          cur === ALIVE ? (live === 2 || live === 3 ? ALIVE : DEAD) : live === 3 ? ALIVE : DEAD;
      }
    }
    // Swap buffers — keeps both Uint8Arrays alive for reuse.
    const tmp = this.cells;
    this.cells = this.next;
    this.next = tmp;
    this.steps += 1;

    // Periodic perturbation keeps the grid lively. Without this the
    // population usually relaxes into a few oscillators within a couple
    // hundred steps and the "breathing" stops.
    if (this.steps % this.perturbEvery === 0) {
      for (let i = 0; i < this.perturbCount; i++) {
        const idx = this.rng.int(0, this.cells.length - 1);
        this.cells[idx] = ALIVE;
      }
    }
    this.dirty = true;
  }

  /** World-coord → grid cell value (0 or 1). Out-of-bounds → 0. */
  densityAt(wx: number, wy: number): number {
    const cellSize = (this.arenaHalf * 2) / this.width;
    const cx = Math.floor((wx + this.arenaHalf) / cellSize);
    const cy = Math.floor((wy + this.arenaHalf) / cellSize);
    if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) return 0;
    return this.cells[cy * this.width + cx];
  }

  /**
   * Sample an ALIVE cell (rejection-sampled) and return a random world
   * point inside it. Returns null if the grid is currently mostly dead
   * — caller should fall back to edge spawn.
   */
  pickAliveWorldPos(rng: Rng): { x: number; y: number } | null {
    const w = this.width;
    const h = this.height;
    const cellSize = (this.arenaHalf * 2) / w;
    const tries = 60;
    for (let i = 0; i < tries; i++) {
      const idx = rng.int(0, this.cells.length - 1);
      if (this.cells[idx] !== ALIVE) continue;
      const cx = idx % w;
      const cy = Math.floor(idx / w);
      const wx = -this.arenaHalf + (cx + rng.next()) * cellSize;
      const wy = -this.arenaHalf + (cy + rng.next()) * cellSize;
      // Ignore the y-extent mismatch when w !== h (we keep them equal anyway).
      void h;
      return { x: wx, y: wy };
    }
    return null;
  }

  /**
   * Sample a DEAD cell and return a random world point inside it.
   * Used by predator spawn — they emerge from low-density "dark" zones.
   * Falls back to a random arena point if every sampled cell is alive.
   */
  pickDeadWorldPos(rng: Rng): { x: number; y: number } {
    const w = this.width;
    const cellSize = (this.arenaHalf * 2) / w;
    for (let i = 0; i < 60; i++) {
      const idx = rng.int(0, this.cells.length - 1);
      if (this.cells[idx] !== DEAD) continue;
      const cx = idx % w;
      const cy = Math.floor(idx / w);
      return {
        x: -this.arenaHalf + (cx + rng.next()) * cellSize,
        y: -this.arenaHalf + (cy + rng.next()) * cellSize,
      };
    }
    return {
      x: rng.range(-this.arenaHalf, this.arenaHalf),
      y: rng.range(-this.arenaHalf, this.arenaHalf),
    };
  }

  /** Live-cell fraction — useful for HUD readout. */
  liveFraction(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === ALIVE) n++;
    return n / this.cells.length;
  }
}
