import { describe, expect, it } from "vitest";
import { World } from "@/game/world";
import type { Body } from "@/game/types";

const place = (b: Body, x: number, y: number) => {
  b.x = x;
  b.y = y;
};

/**
 * Force a sensor+stinger bonded pair so lock_on becomes active. Uses
 * tight placements that stay inside the contact threshold (sensor
 * radius 8 + stinger radius 8 + pad 2 = 18 units max separation).
 */
function withLockOn(world: World): World {
  // Park every other free cell far away so they don't get swept in.
  for (const b of world.freeBodies) place(b, 9000, 9000);

  place(world.entityBodies[0], 0, 0); // core radius 18
  const sensor = world.freeBodies[0];
  sensor.type = "sensor";
  place(sensor, 20, 0); // distance 20 < 18+8+2 = 28 → captured by core
  world.captureNearby();

  // After capture, freeBodies has shifted (one removed + one respawned).
  // Pick the next still-free cell and convert it to stinger.
  const stinger = world.freeBodies.find((b) => Math.abs(b.x ?? 0) < 5000)
    ?? world.freeBodies[0];
  stinger.type = "stinger";
  place(stinger, 33, 0); // distance 13 from sensor → captured, bonds to sensor
  world.captureNearby();

  return world;
}

describe("World.lockOn", () => {
  it("rejects when lock_on trait is not active", () => {
    const w = new World({ freeCount: 5, seed: "lockon-no-trait" });
    const target = w.freeBodies[0];
    expect(w.lockOn(target, 0)).toBe(false);
  });

  it("accepts a free target within range when trait is active", () => {
    const w = new World({ freeCount: 10, seed: "lockon-in-range" });
    withLockOn(w);
    expect(w.traits.active.has("lock_on")).toBe(true);

    const target = w.freeBodies[0];
    place(target, 50, 50); // well inside lockOnRange (≥330)
    target.magnetized = false;

    const accepted = w.lockOn(target, performance.now());
    expect(accepted).toBe(true);
    expect(target.magnetized).toBe(true);
  });

  it("rejects targets beyond lockOnRange", () => {
    const w = new World({ freeCount: 10, seed: "lockon-out-of-range" });
    withLockOn(w);
    const target = w.freeBodies[0];
    place(target, 5000, 0);
    expect(w.lockOn(target, performance.now())).toBe(false);
    expect(target.magnetized).toBeFalsy();
  });

  it("respects cooldown after firing", () => {
    const w = new World({ freeCount: 10, seed: "lockon-cooldown" });
    withLockOn(w);
    const t1 = w.freeBodies[0];
    const t2 = w.freeBodies[1];
    place(t1, 50, 50);
    place(t2, 60, 50);
    const now = 1000;
    expect(w.lockOn(t1, now)).toBe(true);
    // Same instant, second target should be denied by cooldown.
    expect(w.lockOn(t2, now)).toBe(false);
    // After cooldown elapses, second target accepted.
    expect(w.lockOn(t2, now + w.traits.lockOnCooldownMs + 1)).toBe(true);
  });

  it("rejects already-magnetized targets", () => {
    const w = new World({ freeCount: 10, seed: "lockon-double" });
    withLockOn(w);
    const target = w.freeBodies[0];
    place(target, 50, 50);
    target.magnetized = true;
    expect(w.lockOn(target, performance.now())).toBe(false);
  });
});

describe("magnetized integrator path", () => {
  it("moves a magnetized cell toward the core each tick", () => {
    const w = new World({ freeCount: 1, seed: "magnetized-path" });
    place(w.entityBodies[0], 0, 0);
    const cell = w.freeBodies[0];
    place(cell, 200, 0);
    cell.magnetized = true;
    const before = cell.x ?? 0;
    w.tick();
    const after = cell.x ?? 0;
    // Should have moved closer to origin (the core).
    expect(after).toBeLessThan(before);
  });
});
