import { describe, expect, it, beforeEach } from "vitest";
import { THEMES, setTheme, currentTheme } from "@/data/themes";
import { World } from "@/game/world";

function stubCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "createRadialGradient" || prop === "createLinearGradient") {
          return () => grad;
        }
        return noop;
      },
      set() {
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe("theme registry", () => {
  beforeEach(() => setTheme("aquatic"));

  it("exposes both themes with required fields", () => {
    expect(THEMES.aquatic.id).toBe("aquatic");
    expect(THEMES.galactic.id).toBe("galactic");
    expect(THEMES.aquatic.tutorial.swim).toBeTypeOf("string");
    expect(THEMES.galactic.tutorial.swim).toBeTypeOf("string");
    expect(THEMES.aquatic.previewSvg).toMatch(/<svg/);
    expect(THEMES.galactic.previewSvg).toMatch(/<svg/);
  });

  it("setTheme switches the active theme", () => {
    setTheme("galactic");
    expect(currentTheme().id).toBe("galactic");
    setTheme("aquatic");
    expect(currentTheme().id).toBe("aquatic");
  });

  it("aquatic provides override functions for the v1 surface", () => {
    const ov = THEMES.aquatic.overrides;
    expect(ov).toBeDefined();
    expect(ov?.drawCore).toBeTypeOf("function");
    expect(ov?.drawSpines).toBeTypeOf("function");
    expect(ov?.drawPincers).toBeTypeOf("function");
    expect(ov?.drawBarbedTail).toBeTypeOf("function");
    expect(ov?.drawChloroshield).toBeTypeOf("function");
    expect(ov?.drawRegenGlow).toBeTypeOf("function");
    expect(ov?.drawSurgeWake).toBeTypeOf("function");
    expect(ov?.drawSkirmisher).toBeTypeOf("function");
    expect(ov?.drawCentipede).toBeTypeOf("function");
  });
});

describe("galactic overrides — smoke", () => {
  it("every override runs without throwing on a populated world", () => {
    const w = new World();
    const core = w.entityBodies[0];
    if (core) {
      core.vx = 0.6;
      core.vy = 0.4;
    }
    const traits = ["spines", "pincers", "barbed_tail", "chloroshield", "regen", "surge"] as const;
    for (const id of traits) {
      (w.traits.active as Set<string>).add(id);
      w.traits.levels[id] = 3;
    }
    w.traits.tailLength = 80;
    w.traits.tailDamage = 1;
    w.traitActivationOrder = [...traits];
    w.regenBuffer = 5;

    const ov = THEMES.galactic.overrides;
    if (!ov) throw new Error("galactic overrides missing");
    const ctx = stubCtx();

    expect(() => ov.drawCore?.(ctx, w, core!)).not.toThrow();
    expect(() => ov.drawSpines?.(ctx, w)).not.toThrow();
    expect(() => ov.drawPincers?.(ctx, w)).not.toThrow();
    expect(() => ov.drawBarbedTail?.(ctx, w)).not.toThrow();
    expect(() => ov.drawChloroshield?.(ctx, w)).not.toThrow();
    expect(() => ov.drawRegenGlow?.(ctx, w)).not.toThrow();
    expect(() => ov.drawSurgeWake?.(ctx, w)).not.toThrow();
    expect(() => ov.drawCentipede?.(ctx, w)).not.toThrow();

    const fakePred = {
      id: "fake-1",
      type: "spore" as const,
      kind: "predator" as const,
      radius: 12,
      x: 0,
      y: 0,
      vx: 0.5,
      vy: 0.2,
    };
    expect(() => ov.drawSkirmisher?.(ctx, fakePred, 0)).not.toThrow();
  });
});

describe("aquatic overrides — smoke", () => {
  it("every override runs without throwing on a populated world", () => {
    const w = new World();
    const core = w.entityBodies[0];
    if (core) {
      core.vx = 0.6;
      core.vy = 0.4;
    }
    // Activate every part trait so the renderers exercise their full state.
    const traits = ["spines", "pincers", "barbed_tail", "chloroshield", "regen", "surge"] as const;
    for (const id of traits) {
      (w.traits.active as Set<string>).add(id);
      w.traits.levels[id] = 3;
    }
    w.traits.tailLength = 80;
    w.traits.tailDamage = 1;
    w.traitActivationOrder = [...traits];
    w.regenBuffer = 5;

    const ov = THEMES.aquatic.overrides;
    if (!ov) throw new Error("aquatic overrides missing");
    const ctx = stubCtx();

    expect(() => ov.drawCore?.(ctx, w, core!)).not.toThrow();
    expect(() => ov.drawSpines?.(ctx, w)).not.toThrow();
    expect(() => ov.drawPincers?.(ctx, w)).not.toThrow();
    expect(() => ov.drawBarbedTail?.(ctx, w)).not.toThrow();
    expect(() => ov.drawChloroshield?.(ctx, w)).not.toThrow();
    expect(() => ov.drawRegenGlow?.(ctx, w)).not.toThrow();
    expect(() => ov.drawSurgeWake?.(ctx, w)).not.toThrow();
    expect(() => ov.drawCentipede?.(ctx, w)).not.toThrow();

    // Skirmisher needs a synthesized predator body.
    const fakePred = {
      id: "fake-1",
      type: "spore" as const,
      kind: "predator" as const,
      radius: 12,
      x: 0,
      y: 0,
      vx: 0.5,
      vy: 0.2,
    };
    expect(() => ov.drawSkirmisher?.(ctx, fakePred, 0)).not.toThrow();
  });
});
