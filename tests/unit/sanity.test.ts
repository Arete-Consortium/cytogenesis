import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("jsdom is available", () => {
    expect(typeof document).toBe("object");
    const el = document.createElement("canvas");
    expect(el.tagName).toBe("CANVAS");
  });
});
