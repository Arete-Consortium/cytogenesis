import { describe, expect, it } from "vitest";
import { World } from "@/game/world";

describe("World", () => {
  it("seeds with one core + freeCount free cells", () => {
    const w = new World({ freeCount: 5 });
    expect(w.bodies).toHaveLength(6);
    const cores = w.bodies.filter((b) => b.type === "core");
    const free = w.bodies.filter((b) => b.kind === "free");
    expect(cores).toHaveLength(1);
    expect(free).toHaveLength(5);
    expect(cores[0].kind).toBe("captured");
  });

  it("default freeCount scatters ~200 free cells", () => {
    const w = new World();
    const counts = w.countByKind();
    expect(counts.captured).toBe(1);
    expect(counts.free).toBe(200);
  });

  it("camera transform round-trips screen ⇄ world", () => {
    const w = new World({ freeCount: 0 });
    w.camera = { k: 1.5, x: 200, y: 150 };
    const world = w.screenToWorld(350, 300);
    const screen = w.worldToScreen(world.x, world.y);
    expect(screen.x).toBeCloseTo(350);
    expect(screen.y).toBeCloseTo(300);
  });

  it("hitTest finds the core when point falls inside its disk", () => {
    const w = new World({ freeCount: 0 });
    const core = w.entityBodies[0];
    core.x = 100;
    core.y = 100;
    expect(w.hitTest(100, 100)?.id).toBe(core.id);
  });

  it("hitTest finds a free body via the quadtree path", () => {
    const w = new World({ freeCount: 5 });
    w.entityBodies[0].x = 5000;
    w.entityBodies[0].y = 5000;
    for (let i = 0; i < w.freeBodies.length - 1; i++) {
      w.freeBodies[i].x = 5000;
      w.freeBodies[i].y = 5000;
    }
    const target = w.freeBodies[w.freeBodies.length - 1];
    target.x = 200;
    target.y = 200;
    expect(w.hitTest(200, 200)?.id).toBe(target.id);
  });

  it("hitTest returns null when nothing is in range", () => {
    const w = new World({ freeCount: 5 });
    for (const b of w.bodies) {
      b.x = 10000;
      b.y = 10000;
    }
    expect(w.hitTest(0, 0)).toBeNull();
  });

  it("dispose stops the simulation cleanly", () => {
    const w = new World({ freeCount: 0 });
    expect(() => w.dispose()).not.toThrow();
  });

  it("integrator advances free cells across multiple ticks", () => {
    const w = new World({ freeCount: 3, seed: "integrator-test" });
    const before = w.freeBodies.map((b) => ({ x: b.x, y: b.y }));
    for (let i = 0; i < 30; i++) w.tick();
    const after = w.freeBodies.map((b) => ({ x: b.x, y: b.y }));
    let moved = 0;
    for (let i = 0; i < before.length; i++) {
      const dx = (after[i].x ?? 0) - (before[i].x ?? 0);
      const dy = (after[i].y ?? 0) - (before[i].y ?? 0);
      if (Math.hypot(dx, dy) > 1) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("torus wrap brings a body that crosses +arenaHalf back from −arenaHalf", () => {
    const w = new World({ freeCount: 1, arenaHalf: 100 });
    const b = w.freeBodies[0];
    b.x = 99;
    b.y = 0;
    b.vx = 5;
    b.vy = 0;
    w.tick();
    expect(b.x).toBeLessThan(-50);
    expect(b.x).toBeGreaterThan(-100);
  });

  it("seed determinism: same seed → same scatter", () => {
    const a = new World({ freeCount: 10, seed: "abc" });
    const b = new World({ freeCount: 10, seed: "abc" });
    for (let i = 0; i < 10; i++) {
      expect(a.freeBodies[i].x).toBe(b.freeBodies[i].x);
      expect(a.freeBodies[i].y).toBe(b.freeBodies[i].y);
      expect(a.freeBodies[i].type).toBe(b.freeBodies[i].type);
    }
  });
});
