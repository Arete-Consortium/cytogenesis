// QA pass: capture each skin in two states (no traits / all traits) so
// every override surface is exercised. Uses the World debug hook.
//
//   node scripts/qa-skins.mjs

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://cytogenesis.vercel.app";
const OUT = resolve("public/qa");
const SETTLE_MS = 3500;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(theme, label) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  // Pre-seed the theme in localStorage before the play page mounts.
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("cytogenesis:theme", t);
      // Mark tutorial as seen so the overlay doesn't dominate the frame.
      localStorage.setItem("cytogenesis:tutorial", "1");
    } catch {}
  }, theme);
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { state: "visible" });
  await page.waitForTimeout(SETTLE_MS);
  const path = resolve(OUT, `${theme}-${label}.png`);
  await page.screenshot({ path, type: "png", fullPage: false });
  console.log(`saved ${path}`);
  await ctx.close();
}

await shot("aquatic", "fresh");
await shot("galactic", "fresh");

await browser.close();
