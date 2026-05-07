/**
 * Seeded PRNG. mulberry32 — small, fast, ~2^32 period, good enough for
 * gameplay reproducibility (seed-share, replay, deterministic tests).
 * NOT cryptographic.
 *
 * Per CLAUDE.md: every random call in game logic goes through here.
 * Math.random is OK in test scaffolding only.
 */

export interface Rng {
  /** Uniform [0, 1). */
  next(): number;
  /** Uniform [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick one element of `arr`. */
  pick<T>(arr: readonly T[]): T;
  /** Snapshot the current state for save / debug surfacing. */
  state(): number;
}

/** Hash a string seed into a 32-bit integer. xmur3 from PCG / mulberry refs. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(seedInt: number): Rng {
  let s = seedInt >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    state: () => s,
  };
  return rng;
}

/** Convenience: build a fresh RNG from a string seed. */
export function rngFromSeed(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}
