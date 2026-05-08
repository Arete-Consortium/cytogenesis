/**
 * Evolution v2 — composed-part renderers. Each function draws one
 * appendage that an active trait grants. Per the spec, only the 3
 * most-recently-activated part-traits render at once (read from
 * `world.traitActivationOrder`). Drawing functions are pure: no
 * mutation, no audio.
 */

import type { World } from "./world";

const PART_TRAITS = [
  "spines",
  "pincers",
  "barbed_tail",
  "chloroshield",
  "regen",
  "surge",
] as const;
type PartTraitId = (typeof PART_TRAITS)[number];
const PART_TRAIT_SET = new Set<PartTraitId>(PART_TRAITS);

/**
 * Pick the up-to-3 most-recently-activated part-traits. Filters
 * `traitActivationOrder` (which contains all traits in activation order)
 * down to part-traits, then takes the tail.
 */
export function visiblePartTraits(world: World): PartTraitId[] {
  const out: PartTraitId[] = [];
  for (let i = world.traitActivationOrder.length - 1; i >= 0; i--) {
    const id = world.traitActivationOrder[i] as PartTraitId;
    if (PART_TRAIT_SET.has(id) && world.traits.active.has(id)) {
      out.push(id);
      if (out.length === 3) break;
    }
  }
  return out.reverse();
}

/**
 * Top-level dispatch — call from drawBodies. Z-order: chloroshield (under)
 * → tail → bell (drawn elsewhere) → spines (rim) → pincers (over) →
 * surge wake (over body).
 */
export function drawComposedPartsUnder(ctx: CanvasRenderingContext2D, world: World): void {
  const visible = visiblePartTraits(world);
  if (visible.includes("chloroshield")) drawChloroshield(ctx, world);
  if (visible.includes("barbed_tail")) drawBarbedTail(ctx, world);
}

export function drawComposedPartsOver(ctx: CanvasRenderingContext2D, world: World): void {
  const visible = visiblePartTraits(world);
  if (visible.includes("spines")) drawSpines(ctx, world);
  if (visible.includes("pincers")) drawPincers(ctx, world);
  if (visible.includes("regen")) drawRegenGlow(ctx, world);
  if (visible.includes("surge")) drawSurgeWake(ctx, world);
}

// ── Individual parts ─────────────────────────────────────────────────

function getCore(world: World): { x: number; y: number; r: number; vx: number; vy: number } | null {
  const core = world.entityBodies[0];
  if (!core) return null;
  return {
    x: core.x ?? 0,
    y: core.y ?? 0,
    r: core.radius,
    vx: core.vx ?? 0,
    vy: core.vy ?? 0,
  };
}

/** Translucent green halo behind the bell. */
function drawChloroshield(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const t = world.tickN;
  const lvl = world.traits.levels.chloroshield;
  const radius = c.r * (2.0 + Math.min(lvl - 1, 4) * 0.1);
  const pulse = 0.55 + 0.15 * Math.sin(t * 0.06);
  const grad = ctx.createRadialGradient(c.x, c.y, c.r * 1.1, c.x, c.y, radius);
  grad.addColorStop(0, `rgba(110, 220, 140, ${(0.18 * pulse).toFixed(3)})`);
  grad.addColorStop(0.7, `rgba(80, 200, 130, ${(0.08 * pulse).toFixed(3)})`);
  grad.addColorStop(1, "rgba(80, 200, 130, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(140, 240, 170, ${(0.35 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius * 0.94, 0, Math.PI * 2);
  ctx.stroke();
}

/** Trailing barb behind motion vector — shaft + barb hooks. */
function drawBarbedTail(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.05) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const len = world.traits.tailLength;
  const tipX = c.x + ux * len;
  const tipY = c.y + uy * len;

  // Shaft
  ctx.strokeStyle = "rgba(220, 200, 160, 0.65)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(c.x + ux * c.r * 0.9, c.y + uy * c.r * 0.9);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Barb hooks at three points along the tail
  const pxn = -uy;
  const pyn = ux;
  ctx.strokeStyle = "rgba(255, 220, 180, 0.85)";
  ctx.lineWidth = 2;
  for (const f of [0.45, 0.7, 0.95]) {
    const bx = c.x + ux * len * f;
    const by = c.y + uy * len * f;
    const hookLen = 8 + (1 - f) * 4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + pxn * hookLen - ux * 4, by + pyn * hookLen - uy * 4);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - pxn * hookLen - ux * 4, by - pyn * hookLen - uy * 4);
    ctx.stroke();
  }

  // Sharp tip
  ctx.fillStyle = "rgba(255, 240, 200, 0.95)";
  ctx.beginPath();
  ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Radial spikes around the bell rim. */
function drawSpines(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const lvl = world.traits.levels.spines;
  const count = Math.min(16, 8 + lvl);
  const inner = c.r * 1.05;
  const outer = c.r * 1.55;
  ctx.strokeStyle = "rgba(255, 200, 150, 0.85)";
  ctx.fillStyle = "rgba(255, 230, 180, 0.95)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(c.x + cosA * inner, c.y + sinA * inner);
    ctx.lineTo(c.x + cosA * outer, c.y + sinA * outer);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x + cosA * outer, c.y + sinA * outer, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Two flanking pincers that snap when a capture has just occurred. */
function drawPincers(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const t = world.tickN;
  // Snap animation: open mouth normally, close briefly after a capture.
  // We don't have a per-event tickN to read, so approximate via a slow
  // open/close cycle keyed off tickN.
  const cycle = (t % 90) / 90;
  const opening = cycle < 0.3 ? cycle / 0.3 : 1; // close→open during last 70%
  const angle = 0.35 + opening * 0.25;
  // Pincers face the direction of motion.
  const speed = Math.hypot(c.vx, c.vy);
  const facing = speed > 0.05 ? Math.atan2(c.vy, c.vx) : 0;
  const dist = c.r * 1.35;
  for (const side of [-1, 1]) {
    const sa = facing + side * 0.6;
    const baseX = c.x + Math.cos(sa) * dist;
    const baseY = c.y + Math.sin(sa) * dist;
    const upper = facing + side * (0.6 - angle);
    const lower = facing + side * (0.6 + angle);
    ctx.strokeStyle = "rgba(220, 180, 140, 0.9)";
    ctx.fillStyle = "rgba(180, 140, 100, 0.7)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const a of [upper, lower]) {
      const tipX = baseX + Math.cos(a) * c.r * 0.9;
      const tipY = baseY + Math.sin(a) * c.r * 0.9;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Pulsing green ring whose intensity reads regenBuffer fullness. */
function drawRegenGlow(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const cap = Math.max(1, world.traits.levels.regen * 3);
  const fullness = Math.min(1, world.regenBuffer / cap);
  const t = world.tickN;
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.1);
  ctx.strokeStyle = `rgba(160, 240, 200, ${(0.5 * fullness * pulse).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r * 1.25, 0, Math.PI * 2);
  ctx.stroke();
}

/** Streaming wake particles behind the bell when surge is active. */
function drawSurgeWake(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.1) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const t = world.tickN;
  const lvl = world.traits.levels.surge;
  const trails = Math.min(6, 3 + lvl);
  for (let i = 0; i < trails; i++) {
    const f = (i + (t * 0.04) % 1) / trails;
    const along = c.r * 1.2 + f * c.r * 1.6;
    const offset = Math.sin(t * 0.15 + i * 1.7) * c.r * 0.4;
    const px = -uy;
    const py = ux;
    const x = c.x + ux * along + px * offset;
    const y = c.y + uy * along + py * offset;
    const alpha = (1 - f) * 0.6;
    ctx.fillStyle = `rgba(140, 220, 255, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (1 - f) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
