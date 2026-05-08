// Capture a hero screenshot of the live game for the README.
// Runs against PLAYWRIGHT_BASE_URL or the prod deploy by default.
//
//   node scripts/screenshot.mjs              # → public/screenshot.png
//   node scripts/screenshot.mjs --out=foo.png

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://cytogenesis.vercel.app";
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outPath = resolve(outArg?.slice("--out=".length) ?? "public/screenshot.png");
const settleMs = Number(process.env.SETTLE_MS ?? 4000);

await mkdir(dirname(outPath), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();

await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
await page.waitForSelector("canvas", { state: "visible" });

// Dismiss the first-visit tutorial overlay so it doesn't dominate the
// frame. A single pointerdown is enough.
await page.locator("canvas").first().click({ position: { x: 640, y: 360 } });

// Let the rAF loop tick free agents + env CA into a visually rich state.
await page.waitForTimeout(settleMs);

await page.screenshot({ path: outPath, type: "png", fullPage: false });
console.log(`saved ${outPath}`);

await browser.close();
