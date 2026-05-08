import { test, expect } from "@playwright/test";

test.describe("cytogenesis smoke", () => {
  test("landing renders and links to /play", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Cytogenesis/);
    await expect(page.getByRole("heading", { level: 1, name: "Cytogenesis" })).toBeVisible();

    const begin = page.getByRole("link", { name: /Begin/ });
    await expect(begin).toBeVisible();
    await begin.click();
    await expect(page).toHaveURL(/\/play$/);
  });

  test("/play mounts canvas and the rAF loop draws frames", async ({ page }) => {
    await page.goto("/play");

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);

    // Let the rAF loop tick a few frames, then sample pixels to confirm the
    // canvas isn't a blank rectangle. This catches "page renders but game
    // engine never starts" regressions.
    await page.waitForTimeout(1500);

    const nonBlank = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      if (!ctx) return false;
      const w = Math.min(el.width, 200);
      const h = Math.min(el.height, 200);
      const data = ctx.getImageData(0, 0, w, h).data;
      // Look for any pixel with non-zero alpha and a non-background color.
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 0 && (r > 5 || g > 5 || b > 5)) return true;
      }
      return false;
    });
    expect(nonBlank).toBe(true);
  });

  test("pause button toggles aria-label", async ({ page }) => {
    await page.goto("/play");

    const pauseBtn = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();

    await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  });

  test("security headers are applied", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});
