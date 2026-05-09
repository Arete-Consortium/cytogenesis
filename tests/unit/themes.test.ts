import { describe, expect, it, beforeEach } from "vitest";
import { THEMES, setTheme, currentTheme, type ThemeId } from "@/data/themes";
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

const ALL_THEMES: ThemeId[] = ["aquatic", "galactic", "sushi", "yokai"];

describe("theme registry", () => {
  beforeEach(() => setTheme("aquatic"));

  it("exposes all four themes with required fields", () => {
    for (const id of ALL_THEMES) {
      expect(THEMES[id].id).toBe(id);
      expect(THEMES[id].tutorial.swim).toBeTypeOf("string");
      expect(THEMES[id].previewSvg).toMatch(/<svg/);
      expect(THEMES[id].bossLabels.centipede).toBeTypeOf("string");
      expect(THEMES[id].bossLabels.swarmLord).toBeTypeOf("string");
      expect(THEMES[id].bossLabels.tideMaw).toBeTypeOf("string");
      expect(THEMES[id].bossLabels.phage).toBeTypeOf("string");
      expect(THEMES[id].bossLabels.ciliate).toBeTypeOf("string");
    }
  });

  it("setTheme switches the active theme across all four slots", () => {
    for (const id of ALL_THEMES) {
      setTheme(id);
      expect(currentTheme().id).toBe(id);
    }
  });

  it("aquatic uses default visuals (no overrides), microbe boss labels", () => {
    expect(THEMES.aquatic.overrides).toBeUndefined();
    expect(THEMES.aquatic.bossLabels.centipede).toBe("SPIROCHETE");
    expect(THEMES.aquatic.bossLabels.swarmLord).toBe("VOLVOX");
  });

  it("sushi provides full v1 override surface", () => {
    const ov = THEMES.sushi.overrides;
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

  it("galactic provides full v1 override surface", () => {
    const ov = THEMES.galactic.overrides;
    expect(ov?.drawCore).toBeTypeOf("function");
    expect(ov?.drawSkirmisher).toBeTypeOf("function");
    expect(ov?.drawCentipede).toBeTypeOf("function");
  });

  it("yokai provides full v1 override surface PLUS folklore free-cell glyphs", () => {
    const ov = THEMES.yokai.overrides;
    expect(ov?.drawCore).toBeTypeOf("function");
    expect(ov?.drawSkirmisher).toBeTypeOf("function");
    expect(ov?.drawCentipede).toBeTypeOf("function");
    expect(ov?.drawFreeCellShape).toBeTypeOf("function");
  });
});

function smokeTheme(themeId: Exclude<ThemeId, "aquatic">): void {
  describe(`${themeId} overrides — smoke`, () => {
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

      const ov = THEMES[themeId].overrides;
      if (!ov) throw new Error(`${themeId} overrides missing`);
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

      // Yokai also exercises drawFreeCellShape across all 9 NodeTypeIds.
      if (ov.drawFreeCellShape) {
        const types = ["core", "propulsion", "sensor", "membrane", "mouth", "stinger", "chloroplast", "mitochondrion", "spore"] as const;
        for (const ty of types) {
          const fakeFree = { ...fakePred, id: `f-${ty}`, type: ty, kind: "free" as const };
          expect(() => ov.drawFreeCellShape!(ctx, fakeFree, 0)).not.toThrow();
        }
      }
    });
  });
}

smokeTheme("galactic");
smokeTheme("sushi");
smokeTheme("yokai");
