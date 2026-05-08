import { describe, expect, it } from "vitest";
import {
  drawComposedPartsOver,
  drawComposedPartsUnder,
  visiblePartTraits,
} from "@/game/parts";
import { World } from "@/game/world";

/**
 * Stub Canvas2D context — every method is a no-op. We're just verifying
 * the draw functions don't throw against representative world states;
 * pixel-level correctness lives in the e2e screenshot smoke.
 */
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

describe("composed parts", () => {
  it("visiblePartTraits returns at most 3 entries", () => {
    const w = new World();
    // Force-activate all 6 part traits via the public field.
    (w.traits.active as Set<string>).add("spines");
    (w.traits.active as Set<string>).add("pincers");
    (w.traits.active as Set<string>).add("barbed_tail");
    (w.traits.active as Set<string>).add("chloroshield");
    (w.traits.active as Set<string>).add("regen");
    (w.traits.active as Set<string>).add("surge");
    w.traitActivationOrder = ["spines", "pincers", "barbed_tail", "chloroshield", "regen", "surge"];
    const visible = visiblePartTraits(w);
    expect(visible.length).toBe(3);
    // Most-recent-3 should be the last 3 in activation order.
    expect(visible).toEqual(["chloroshield", "regen", "surge"]);
  });

  it("visiblePartTraits ignores non-part traits in activation order", () => {
    const w = new World();
    (w.traits.active as Set<string>).add("propulsion");
    (w.traits.active as Set<string>).add("spines");
    w.traitActivationOrder = ["propulsion", "spines"];
    const visible = visiblePartTraits(w);
    expect(visible).toEqual(["spines"]);
  });

  it("drawComposedPartsUnder does not throw with no active parts", () => {
    const w = new World();
    expect(() => drawComposedPartsUnder(stubCtx(), w)).not.toThrow();
  });

  it("drawComposedPartsOver does not throw with no active parts", () => {
    const w = new World();
    expect(() => drawComposedPartsOver(stubCtx(), w)).not.toThrow();
  });

  it("drawComposedPartsUnder draws chloroshield without throwing", () => {
    const w = new World();
    (w.traits.active as Set<string>).add("chloroshield");
    w.traits.levels.chloroshield = 2;
    w.traitActivationOrder = ["chloroshield"];
    expect(() => drawComposedPartsUnder(stubCtx(), w)).not.toThrow();
  });

  it("drawComposedPartsOver renders all 6 part visuals when activated", () => {
    const w = new World();
    const parts = ["spines", "pincers", "barbed_tail", "chloroshield", "regen", "surge"] as const;
    for (const p of parts) {
      (w.traits.active as Set<string>).add(p);
      w.traits.levels[p] = 3;
    }
    w.traits.tailLength = 80;
    w.traits.tailDamage = 1;
    w.traitActivationOrder = [...parts];
    // Give the core some velocity so motion-dependent parts (tail, wake) draw.
    const core = w.entityBodies[0];
    if (core) {
      core.vx = 0.5;
      core.vy = 0.3;
    }
    expect(() => {
      drawComposedPartsUnder(stubCtx(), w);
      drawComposedPartsOver(stubCtx(), w);
    }).not.toThrow();
  });
});
