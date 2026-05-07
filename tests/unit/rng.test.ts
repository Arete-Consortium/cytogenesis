import { describe, expect, it } from "vitest";
import { hashSeed, mulberry32, rngFromSeed } from "@/lib/rng";

describe("rng", () => {
  it("same seed → same sequence", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });

  it("different seeds diverge", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let same = 0;
    for (let i = 0; i < 50; i++) if (a.next() === b.next()) same++;
    expect(same).toBeLessThan(5);
  });

  it("range stays in [min, max)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = r.range(-10, 10);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThan(10);
    }
  });

  it("int returns integers in [min, max] inclusive", () => {
    const r = mulberry32(7);
    let lo = false;
    let hi = false;
    for (let i = 0; i < 500; i++) {
      const v = r.int(0, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
      if (v === 0) lo = true;
      if (v === 3) hi = true;
    }
    expect(lo && hi).toBe(true);
  });

  it("pick returns an element of the array", () => {
    const r = mulberry32(7);
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 30; i++) expect(arr).toContain(r.pick(arr));
  });

  it("string-seeded RNG is deterministic via hashSeed", () => {
    const a = rngFromSeed("cytogenesis");
    const b = mulberry32(hashSeed("cytogenesis"));
    expect(a.next()).toBe(b.next());
  });
});
