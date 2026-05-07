import { describe, expect, it } from "vitest";
import { EnvCA } from "@/game/envCA";
import { mulberry32 } from "@/lib/rng";

const blank = (size: number) =>
  new EnvCA(
    {
      width: size,
      height: size,
      arenaHalf: 100,
      hz: 4,
      initialDensity: 0,
      perturbEvery: 1_000_000, // disable for deterministic Conway-rule tests
      perturbCount: 0,
    },
    mulberry32(1),
  );

const setLive = (ca: EnvCA, ...coords: [number, number][]) => {
  for (const [x, y] of coords) ca.cells[y * ca.width + x] = 1;
};

describe("EnvCA — Conway B3/S23", () => {
  it("blinker oscillates with period 2", () => {
    const ca = blank(8);
    // Vertical blinker at x=3, y=2..4
    setLive(ca, [3, 2], [3, 3], [3, 4]);
    ca.step();
    // After one step it's horizontal: y=3, x=2..4
    expect(ca.cells[3 * 8 + 2]).toBe(1);
    expect(ca.cells[3 * 8 + 3]).toBe(1);
    expect(ca.cells[3 * 8 + 4]).toBe(1);
    expect(ca.cells[2 * 8 + 3]).toBe(0);
    ca.step();
    // Back to vertical
    expect(ca.cells[2 * 8 + 3]).toBe(1);
    expect(ca.cells[3 * 8 + 3]).toBe(1);
    expect(ca.cells[4 * 8 + 3]).toBe(1);
  });

  it("block is a still life", () => {
    const ca = blank(8);
    setLive(ca, [2, 2], [2, 3], [3, 2], [3, 3]);
    const before = Array.from(ca.cells);
    ca.step();
    expect(Array.from(ca.cells)).toEqual(before);
  });

  it("birth on exactly 3 alive neighbors", () => {
    const ca = blank(8);
    // Three alive cells around (1,1) → it should be born
    setLive(ca, [0, 0], [0, 1], [1, 0]);
    ca.step();
    expect(ca.cells[1 * 8 + 1]).toBe(1);
  });

  it("dies under 2 alive neighbors", () => {
    const ca = blank(8);
    setLive(ca, [3, 3]); // lonely cell
    ca.step();
    expect(ca.cells[3 * 8 + 3]).toBe(0);
  });

  it("dies over 3 alive neighbors", () => {
    const ca = blank(8);
    // 5 cells around (3, 3): plus-shape = 4 neighbors → over-population
    setLive(ca, [3, 3], [2, 3], [4, 3], [3, 2], [3, 4]);
    ca.step();
    expect(ca.cells[3 * 8 + 3]).toBe(0);
  });
});

describe("EnvCA — time + density", () => {
  it("update(dt) ticks at the configured Hz", () => {
    const ca = new EnvCA(
      {
        width: 8,
        height: 8,
        arenaHalf: 100,
        hz: 4, // 250ms per step
        initialDensity: 0,
        perturbEvery: 1_000_000,
      },
      mulberry32(1),
    );
    expect(ca.update(100)).toBe(0); // not enough time
    expect(ca.update(200)).toBe(1); // 100+200 = 300ms → one step + 50ms remainder
    expect(ca.update(700)).toBe(3); // 50+700 = 750ms → exactly three steps
  });

  it("update caps catch-up to avoid runaway after a long pause", () => {
    const ca = blank(8);
    const stepped = ca.update(60_000); // a full minute pause
    expect(stepped).toBeLessThanOrEqual(6);
  });

  it("densityAt maps world coords to cell value", () => {
    const ca = blank(4); // arenaHalf=100, 4×4 grid → cellSize 50
    // Cell (2, 2) covers x ∈ [0, 50), y ∈ [0, 50)
    setLive(ca, [2, 2]);
    expect(ca.densityAt(25, 25)).toBe(1);
    expect(ca.densityAt(-25, -25)).toBe(0);
  });

  it("pickAliveWorldPos returns null on a dead grid", () => {
    const ca = blank(8);
    expect(ca.pickAliveWorldPos(mulberry32(1))).toBeNull();
  });

  it("pickAliveWorldPos returns a coord inside an alive cell", () => {
    const ca = blank(4); // arenaHalf=100, cellSize 50
    setLive(ca, [2, 2]); // covers x ∈ [0, 50), y ∈ [0, 50)
    const pos = ca.pickAliveWorldPos(mulberry32(1))!;
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeLessThan(50);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeLessThan(50);
  });

  it("seed determinism: same seed → same initial population", () => {
    const a = new EnvCA({ arenaHalf: 100, width: 32, height: 32 }, mulberry32(7));
    const b = new EnvCA({ arenaHalf: 100, width: 32, height: 32 }, mulberry32(7));
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
  });
});
