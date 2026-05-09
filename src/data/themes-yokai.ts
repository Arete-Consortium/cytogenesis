/**
 * Yokai skin v1 — Hitodama spirit-flame collecting offerings vs.
 * yokai. Night-time supernatural palette: deep purple void, pale
 * cyan/white spirit glow, vermillion accents (oni / torii). Same
 * 9-override surface as the other skins.
 */

import type { Body } from "@/game/types";
import type { World } from "@/game/world";
import type { ThemeOverrides } from "./themes";

let cachedSpiritAngle = 0;

// ── Hitodama spirit core ─────────────────────────────────────────────

function drawSpiritCore(ctx: CanvasRenderingContext2D, world: World, core: Body): void {
  const x = core.x ?? 0;
  const y = core.y ?? 0;
  const r = core.radius;
  const t = world.tickN;
  const vx = core.vx ?? 0;
  const vy = core.vy ?? 0;
  const sp = Math.hypot(vx, vy);
  if (sp > 0.4) {
    const target = Math.atan2(vy, vx);
    let delta = target - cachedSpiritAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    cachedSpiritAngle += delta * 0.18;
  }

  // Outer wisp halo
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
  halo.addColorStop(0, "rgba(220, 240, 255, 0.45)");
  halo.addColorStop(0.5, "rgba(180, 210, 255, 0.18)");
  halo.addColorStop(1, "rgba(180, 210, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(cachedSpiritAngle + Math.PI / 2);

  // Flame body — droplet shape with wavering tail
  const wave = Math.sin(t * 0.18) * r * 0.18;
  const tailWave = Math.sin(t * 0.12) * r * 0.25;
  const flame = ctx.createLinearGradient(0, -r * 1.4, 0, r * 1.0);
  flame.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  flame.addColorStop(0.4, "rgba(180, 240, 255, 0.85)");
  flame.addColorStop(1, "rgba(80, 140, 220, 0.4)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.4);
  ctx.bezierCurveTo(r * 0.95 + wave, -r * 0.6, r * 0.85, r * 0.5, tailWave, r * 1.05);
  ctx.bezierCurveTo(-r * 0.85, r * 0.5, -r * 0.95 + wave, -r * 0.6, 0, -r * 1.4);
  ctx.closePath();
  ctx.fill();

  // Inner core highlight
  const inner = ctx.createRadialGradient(0, -r * 0.2, 0, 0, -r * 0.2, r * 0.7);
  inner.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  inner.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Shadowy face inside the flame — two hollow eye sockets + a wide mouth
  ctx.fillStyle = "rgba(40, 30, 80, 0.85)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * r * 0.22, -r * 0.25, r * 0.12, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r * 0.28, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Trailing wisp embers
  for (let i = 0; i < 3; i++) {
    const f = (i + (t * 0.04) % 1) / 3;
    const ang = cachedSpiritAngle + Math.PI + Math.sin(t * 0.1 + i) * 0.4;
    const ex = x + Math.cos(ang) * r * (1.6 + f * 1.2);
    const ey = y + Math.sin(ang) * r * (1.6 + f * 1.2);
    const alpha = (1 - f) * 0.6;
    ctx.fillStyle = `rgba(220, 240, 255, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.4 + (1 - f) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Kasa-obake (umbrella yokai) skirmisher ──────────────────────────

function drawKasaObake(ctx: CanvasRenderingContext2D, p: Body, t: number): void {
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  // Crimson hostile aura
  const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.0);
  halo.addColorStop(0, "rgba(200, 40, 60, 0.42)");
  halo.addColorStop(1, "rgba(200, 40, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);

  // Umbrella canopy — vermillion semicircle
  ctx.fillStyle = "#a31525";
  ctx.strokeStyle = "rgba(40, 10, 20, 0.85)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 0.95, Math.PI, 0, false);
  ctx.lineTo(r * 0.95, -r * 0.1);
  ctx.lineTo(-r * 0.95, -r * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Canopy ribs — bone-white radial lines
  ctx.strokeStyle = "rgba(240, 220, 200, 0.55)";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    const a = Math.PI + (i / 4) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.1);
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95 - r * 0.1);
    ctx.stroke();
  }

  // Tongue lolling out the bottom
  ctx.fillStyle = "#ff6b8a";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.55, r * 0.22, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(80, 20, 40, 0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // One large eye centered on the canopy
  ctx.fillStyle = "rgba(255, 245, 230, 0.95)";
  ctx.beginPath();
  ctx.arc(0, -r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 10, 20, 0.85)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Pupil
  const pupilWobble = Math.sin(t * 0.1) * r * 0.06;
  ctx.fillStyle = "#1a0810";
  ctx.beginPath();
  ctx.arc(pupilWobble, -r * 0.35, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  // Single leg with geta (wooden sandal)
  ctx.strokeStyle = "rgba(120, 80, 40, 0.85)";
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = "round";
  const legSwing = Math.sin(t * 0.25) * r * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.05);
  ctx.lineTo(legSwing, r * 0.95);
  ctx.stroke();
  // Geta
  ctx.fillStyle = "#5c3a1a";
  ctx.fillRect(legSwing - r * 0.28, r * 0.95, r * 0.56, r * 0.13);

  ctx.restore();
}

// ── Hyakki yagyou centipede (chained yokai parade) ──────────────────

function drawHyakkiYagyou(ctx: CanvasRenderingContext2D, world: World): void {
  const c = world.centipede;
  if (!c) return;
  const head = c.head;
  const segs = c.segments;
  const all = [head, ...segs];
  const t = world.tickN;
  const isEnraged = c.enragedFlashed;

  // Smoky red haze under the procession
  const haloFill = isEnraged ? "rgba(220, 60, 40, 0.32)" : "rgba(160, 30, 70, 0.32)";
  for (const b of all) {
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const grad = ctx.createRadialGradient(x, y, b.radius * 0.4, x, y, b.radius * 1.9);
    grad.addColorStop(0, haloFill);
    grad.addColorStop(1, "rgba(160, 30, 70, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, b.radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Smoke trail connecting heads (instead of solid spine — more ghostly)
  ctx.strokeStyle = isEnraged ? "rgba(220, 60, 40, 0.45)" : "rgba(180, 90, 130, 0.45)";
  ctx.lineWidth = head.radius * 0.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(head.x ?? 0, head.y ?? 0);
  for (const s of segs) {
    ctx.lineTo(s.x ?? 0, s.y ?? 0);
  }
  ctx.stroke();
  // Inner smoldering line
  ctx.strokeStyle = isEnraged ? "rgba(255, 150, 100, 0.7)" : "rgba(255, 200, 220, 0.4)";
  ctx.lineWidth = head.radius * 0.18;
  ctx.beginPath();
  ctx.moveTo(head.x ?? 0, head.y ?? 0);
  for (const s of segs) {
    ctx.lineTo(s.x ?? 0, s.y ?? 0);
  }
  ctx.stroke();

  // Each segment as an oni mask
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const r = b.radius;
    const segAngle = Math.atan2(b.vy ?? 0, b.vx ?? 0) || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(segAngle + Math.PI / 2);

    // Oni face — vermillion mask shape
    const maskGrad = ctx.createRadialGradient(0, -r * 0.2, 0, 0, 0, r);
    maskGrad.addColorStop(0, isEnraged ? "#dc2626" : "#a31525");
    maskGrad.addColorStop(1, isEnraged ? "#5a0608" : "#3a0810");
    ctx.fillStyle = maskGrad;
    ctx.strokeStyle = "rgba(20, 5, 10, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.85, -r * 0.6, r * 0.85, r * 0.4, 0, r);
    ctx.bezierCurveTo(-r * 0.85, r * 0.4, -r * 0.85, -r * 0.6, 0, -r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Two horns
    ctx.fillStyle = "rgba(245, 230, 200, 0.95)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.45, -r * 0.6);
      ctx.lineTo(side * r * 0.7, -r * 1.1);
      ctx.lineTo(side * r * 0.55, -r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Yellow glaring eyes
    ctx.fillStyle = isEnraged ? "rgba(255, 220, 100, 0.95)" : "rgba(251, 191, 36, 0.95)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.3, -r * 0.2, r * 0.16, r * 0.1, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fanged grin
    ctx.fillStyle = "rgba(245, 230, 200, 0.9)";
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, r * 0.25);
    ctx.lineTo(0, r * 0.55);
    ctx.lineTo(r * 0.3, r * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a0810";
    for (let f = -1; f <= 1; f += 1) {
      ctx.beginPath();
      ctx.moveTo(f * r * 0.15, r * 0.25);
      ctx.lineTo(f * r * 0.15 + r * 0.05, r * 0.45);
      ctx.lineTo(f * r * 0.15 - r * 0.05, r * 0.45);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // Head pulse — extra ofuda (paper talisman) flutter at head
  const hx = head.x ?? 0;
  const hy = head.y ?? 0;
  const hr = head.radius;
  const flutter = Math.sin(t * 0.2) * 4;
  ctx.save();
  ctx.translate(hx, hy - hr * 1.4);
  ctx.rotate(Math.sin(t * 0.1) * 0.15);
  ctx.fillStyle = "rgba(245, 230, 200, 0.85)";
  ctx.fillRect(-6, -10 + flutter, 12, 20);
  ctx.fillStyle = "rgba(120, 30, 30, 0.85)";
  ctx.fillRect(-2, -8 + flutter, 4, 16);
  ctx.restore();
}

// ── Composed-part overrides ──────────────────────────────────────────

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

/** Spirit flames flickering radially when spines is active. */
function drawSpiritFlames(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const lvl = world.traits.levels.spines;
  const count = Math.min(12, 6 + lvl);
  const t = world.tickN;
  const inner = c.r * 1.0;
  const outer = c.r * 1.55;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + t * 0.02;
    const flicker = 1 + Math.sin(t * 0.3 + i * 1.7) * 0.18;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const ix = c.x + cosA * inner;
    const iy = c.y + sinA * inner;
    const ox = c.x + cosA * outer * flicker;
    const oy = c.y + sinA * outer * flicker;
    const grad = ctx.createLinearGradient(ix, iy, ox, oy);
    grad.addColorStop(0, "rgba(255, 200, 120, 0.85)");
    grad.addColorStop(1, "rgba(255, 80, 60, 0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ox, oy);
    ctx.stroke();
  }
}

/** Oni-horn pincers flank the spirit. */
function drawOniHorns(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  const facing = speed > 0.05 ? Math.atan2(c.vy, c.vx) : 0;
  const ux = Math.cos(facing);
  const uy = Math.sin(facing);
  const px = -uy;
  const py = ux;
  const baseDist = c.r * 1.0;
  const hornLen = c.r * 0.8;
  for (const side of [-1, 1]) {
    const baseX = c.x + ux * baseDist + px * side * c.r * 0.45;
    const baseY = c.y + uy * baseDist + py * side * c.r * 0.45;
    const tipX = baseX + ux * hornLen + px * side * c.r * 0.25;
    const tipY = baseY + uy * hornLen + py * side * c.r * 0.25;
    ctx.fillStyle = "rgba(245, 230, 200, 0.95)";
    ctx.strokeStyle = "rgba(80, 20, 30, 0.85)";
    ctx.lineWidth = 1.4;
    const innerX = baseX + ux * hornLen * 0.6 + px * side * c.r * 0.05;
    const innerY = baseY + uy * hornLen * 0.6 + py * side * c.r * 0.05;
    ctx.beginPath();
    ctx.moveTo(baseX + px * side * c.r * 0.18, baseY + py * side * c.r * 0.18);
    ctx.quadraticCurveTo(innerX, innerY, tipX, tipY);
    ctx.lineTo(baseX - px * side * c.r * 0.05, baseY - py * side * c.r * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Ridge stripes on horn
    ctx.strokeStyle = "rgba(80, 20, 30, 0.55)";
    ctx.lineWidth = 0.8;
    for (let s = 0.3; s < 1; s += 0.3) {
      const sx = baseX + ux * hornLen * s + px * side * c.r * (0.12 - 0.08 * s);
      const sy = baseY + uy * hornLen * s + py * side * c.r * (0.12 - 0.08 * s);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + px * side * 4, sy + py * side * 4);
      ctx.stroke();
    }
  }
}

/** Shimenawa rope tail with paper streamers (replaces barbed_tail). */
function drawShimenawaTail(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.05) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const len = world.traits.tailLength;
  const px = -uy;
  const py = ux;
  const t = world.tickN;
  const tipX = c.x + ux * len;
  const tipY = c.y + uy * len;

  // Twisted rope — two interleaved sin lines
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    ctx.strokeStyle = side > 0 ? "rgba(245, 230, 200, 0.85)" : "rgba(180, 150, 90, 0.75)";
    ctx.beginPath();
    for (let f = 0; f <= 1; f += 0.05) {
      const wobble = Math.sin(f * Math.PI * 6 + t * 0.1) * 4 * side;
      const wx = c.x + ux * len * f + px * wobble;
      const wy = c.y + uy * len * f + py * wobble;
      if (f === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
  }

  // Paper shide streamers at three points along the rope
  ctx.fillStyle = "rgba(245, 240, 230, 0.92)";
  ctx.strokeStyle = "rgba(80, 60, 40, 0.7)";
  ctx.lineWidth = 0.8;
  for (const f of [0.35, 0.65, 0.95]) {
    const sx = c.x + ux * len * f;
    const sy = c.y + uy * len * f;
    const flutter = Math.sin(t * 0.2 + f * 5) * 3;
    ctx.save();
    ctx.translate(sx + flutter, sy);
    ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
    // Zigzag paper strip
    ctx.beginPath();
    ctx.moveTo(-3, -8);
    ctx.lineTo(3, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(3, 4);
    ctx.lineTo(-3, 8);
    ctx.lineTo(-3, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Tip bell-knot
  ctx.fillStyle = "rgba(220, 80, 60, 0.95)";
  ctx.beginPath();
  ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Paper talisman barrier for chloroshield. */
function drawTalismanBarrier(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const t = world.tickN;
  const lvl = world.traits.levels.chloroshield;
  const radius = c.r * (1.95 + Math.min(lvl - 1, 4) * 0.1);
  const pulse = 0.55 + 0.18 * Math.sin(t * 0.06);
  // Barrier glow
  const grad = ctx.createRadialGradient(c.x, c.y, c.r * 1.05, c.x, c.y, radius);
  grad.addColorStop(0, `rgba(245, 230, 200, ${(0.18 * pulse).toFixed(3)})`);
  grad.addColorStop(0.7, `rgba(180, 60, 60, ${(0.08 * pulse).toFixed(3)})`);
  grad.addColorStop(1, "rgba(180, 60, 60, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Talismans orbiting around the barrier
  const slips = 5;
  for (let i = 0; i < slips; i++) {
    const a = (i / slips) * Math.PI * 2 + t * 0.025;
    const sx = c.x + Math.cos(a) * radius * 0.92;
    const sy = c.y + Math.sin(a) * radius * 0.92;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = `rgba(245, 230, 200, ${(0.92 * pulse).toFixed(3)})`;
    ctx.fillRect(-3, -7, 6, 14);
    ctx.fillStyle = `rgba(180, 30, 30, ${(0.92 * pulse).toFixed(3)})`;
    ctx.fillRect(-1, -5, 2, 10);
    ctx.restore();
  }
}

/** Omikuji prayer-slip ring for regen. */
function drawOmikujiRing(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const cap = Math.max(1, world.traits.levels.regen * 3);
  const fullness = Math.min(1, world.regenBuffer / cap);
  const t = world.tickN;
  const radius = c.r * 1.22;
  // Base ring
  ctx.strokeStyle = `rgba(245, 230, 200, ${(0.5 * fullness).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Tied paper slips
  const slips = 4;
  for (let i = 0; i < slips; i++) {
    const a = (i / slips) * Math.PI * 2 + t * 0.04;
    const sx = c.x + Math.cos(a) * radius;
    const sy = c.y + Math.sin(a) * radius;
    const flutter = Math.sin(t * 0.18 + i * 1.3) * 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a + Math.PI / 2 + flutter * 0.05);
    ctx.fillStyle = `rgba(245, 240, 230, ${(0.92 * fullness).toFixed(3)})`;
    ctx.fillRect(-2.4 + flutter, -5, 4.8, 10);
    ctx.fillStyle = `rgba(80, 60, 40, ${(0.85 * fullness).toFixed(3)})`;
    ctx.fillRect(-0.6 + flutter, -3, 1.2, 6);
    ctx.restore();
  }
}

/** Cherry-blossom petal wake for surge. */
function drawSakuraWake(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.1) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const t = world.tickN;
  const lvl = world.traits.levels.surge;
  const petals = Math.min(7, 4 + lvl);
  const px = -uy;
  const py = ux;
  for (let i = 0; i < petals; i++) {
    const f = (i + (t * 0.05) % 1) / petals;
    const along = c.r * 1.4 + f * c.r * 2.4;
    const offset = Math.sin(t * 0.18 + i * 1.7) * c.r * 0.6;
    const x = c.x + ux * along + px * offset;
    const y = c.y + uy * along + py * offset;
    const alpha = (1 - f) * 0.85;
    const rot = t * 0.05 + i;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = `rgba(255, 200, 220, ${alpha.toFixed(3)})`;
    // Five-lobed petal
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 2, Math.sin(a) * 2, 1.6, 3, a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255, 240, 250, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Folklore-themed free-cell glyphs ────────────────────────────────
// Each NodeTypeId becomes an artifact tied to yokai/spirit folklore.

function drawYokaiFreeCell(ctx: CanvasRenderingContext2D, body: Body, t: number): void {
  const x = body.x ?? 0;
  const y = body.y ?? 0;
  const r = body.radius;
  ctx.save();
  ctx.translate(x, y);
  switch (body.type) {
    case "propulsion": {
      // Geta (wooden sandal) — dark wood block with two teeth
      ctx.rotate(Math.sin(t * 0.05 + x * 0.01) * 0.2);
      ctx.fillStyle = "#5c3a1a";
      ctx.strokeStyle = "rgba(40, 20, 10, 0.85)";
      ctx.lineWidth = 1;
      ctx.fillRect(-r * 0.85, -r * 0.4, r * 1.7, r * 0.5);
      ctx.strokeRect(-r * 0.85, -r * 0.4, r * 1.7, r * 0.5);
      ctx.fillStyle = "#3a230d";
      ctx.fillRect(-r * 0.6, r * 0.1, r * 0.25, r * 0.35);
      ctx.fillRect(r * 0.35, r * 0.1, r * 0.25, r * 0.35);
      // Hanao strap
      ctx.strokeStyle = "rgba(220, 30, 30, 0.85)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(-r * 0.3, -r * 0.05);
      ctx.moveTo(0, -r * 0.4);
      ctx.lineTo(r * 0.3, -r * 0.05);
      ctx.stroke();
      break;
    }
    case "sensor": {
      // Magatama (curved jewel) — comma-shaped pearl
      const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      grad.addColorStop(0, "#dceeff");
      grad.addColorStop(0.5, "#5fa8e0");
      grad.addColorStop(1, "#1a4a7a");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(20, 40, 80, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(r * 0.6, -r * 0.4);
      ctx.bezierCurveTo(r * 0.9, r * 0.3, -r * 0.3, r * 0.7, -r * 0.4, 0);
      ctx.bezierCurveTo(-r * 0.5, -r * 0.5, r * 0.2, -r * 0.7, r * 0.6, -r * 0.4);
      ctx.fill();
      ctx.stroke();
      // Drilled hole
      ctx.fillStyle = "rgba(20, 40, 80, 0.7)";
      ctx.beginPath();
      ctx.arc(r * 0.4, -r * 0.3, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "membrane": {
      // Ofuda (paper talisman) — vertical strip with red column
      ctx.rotate(Math.sin(t * 0.04 + x * 0.01) * 0.12);
      ctx.fillStyle = "#f5e8c8";
      ctx.strokeStyle = "rgba(60, 40, 20, 0.85)";
      ctx.lineWidth = 1;
      ctx.fillRect(-r * 0.4, -r, r * 0.8, r * 2);
      ctx.strokeRect(-r * 0.4, -r, r * 0.8, r * 2);
      // Red kanji column
      ctx.fillStyle = "#a31525";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(-r * 0.15, -r * 0.7 + i * r * 0.5, r * 0.3, r * 0.18);
      }
      break;
    }
    case "mouth": {
      // Mochi (rice cake) — round white pillow
      const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.7, "#f0e8d8");
      grad.addColorStop(1, "#c8b888");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(120, 90, 50, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Highlight blush
      ctx.fillStyle = "rgba(255, 200, 200, 0.6)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.15, r * 0.2, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "stinger": {
      // Tanto (short blade) — pointed steel + wrapped grip
      ctx.rotate(Math.atan2(body.vy ?? 0, body.vx ?? 0) || 0);
      ctx.fillStyle = "#d4d8e0";
      ctx.strokeStyle = "rgba(20, 30, 50, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r * 0.95, 0);
      ctx.lineTo(-r * 0.2, r * 0.18);
      ctx.lineTo(-r * 0.2, -r * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Tsuba (guard)
      ctx.fillStyle = "#9a7030";
      ctx.fillRect(-r * 0.3, -r * 0.32, r * 0.15, r * 0.64);
      // Wrapped grip
      ctx.fillStyle = "#3a1a1a";
      ctx.fillRect(-r * 0.85, -r * 0.18, r * 0.55, r * 0.36);
      ctx.strokeStyle = "rgba(220, 200, 80, 0.6)";
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 3; i++) {
        const gx = -r * 0.78 + i * r * 0.18;
        ctx.beginPath();
        ctx.moveTo(gx, -r * 0.18);
        ctx.lineTo(gx + r * 0.05, r * 0.18);
        ctx.stroke();
      }
      break;
    }
    case "chloroplast": {
      // Sakaki branch — small evergreen sprig
      ctx.rotate(Math.sin(t * 0.03 + x * 0.01) * 0.15);
      ctx.strokeStyle = "#4a3018";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.9);
      ctx.lineTo(0, -r * 0.4);
      ctx.stroke();
      ctx.fillStyle = "#3d7a3d";
      ctx.strokeStyle = "rgba(30, 60, 30, 0.85)";
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        const ly = -r * 0.4 + i * r * 0.4;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(side * r * 0.35, ly, r * 0.35, r * 0.18, side * Math.PI * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    }
    case "mitochondrion": {
      // Koban (gold coin) — oval gold ingot
      ctx.rotate(Math.sin(t * 0.06 + x * 0.01) * 0.25);
      const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, 0, r);
      grad.addColorStop(0, "#fff5c2");
      grad.addColorStop(0.6, "#f5c648");
      grad.addColorStop(1, "#a0750e");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(80, 50, 0, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.0, r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Stamped center
      ctx.fillStyle = "rgba(80, 50, 0, 0.65)";
      ctx.fillRect(-r * 0.15, -r * 0.3, r * 0.3, r * 0.6);
      ctx.fillStyle = "rgba(255, 245, 200, 0.9)";
      ctx.fillRect(-r * 0.1, -r * 0.22, r * 0.2, r * 0.1);
      ctx.fillRect(-r * 0.1, -r * 0.05, r * 0.2, r * 0.08);
      break;
    }
    case "spore": {
      // Kitsune-bi (fox-fire) — small blue-purple flame
      const flicker = 1 + Math.sin(t * 0.3 + x * 0.02) * 0.18;
      const grad = ctx.createLinearGradient(0, -r, 0, r * 0.8);
      grad.addColorStop(0, "rgba(255, 220, 250, 0.9)");
      grad.addColorStop(0.4, "rgba(200, 140, 255, 0.85)");
      grad.addColorStop(1, "rgba(120, 60, 180, 0.4)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -r * flicker);
      ctx.bezierCurveTo(r * 0.7, -r * 0.4, r * 0.7, r * 0.5, 0, r * 0.85);
      ctx.bezierCurveTo(-r * 0.7, r * 0.5, -r * 0.7, -r * 0.4, 0, -r * flicker);
      ctx.closePath();
      ctx.fill();
      // Inner core
      ctx.fillStyle = "rgba(255, 240, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "core":
    default: {
      // Fallback — pale offering bowl
      ctx.fillStyle = "rgba(220, 200, 180, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ── Bundle ───────────────────────────────────────────────────────────

export const yokaiOverrides: ThemeOverrides = {
  drawCore: drawSpiritCore,
  drawSpines: drawSpiritFlames,
  drawPincers: drawOniHorns,
  drawBarbedTail: drawShimenawaTail,
  drawChloroshield: drawTalismanBarrier,
  drawRegenGlow: drawOmikujiRing,
  drawSurgeWake: drawSakuraWake,
  drawSkirmisher: drawKasaObake,
  drawCentipede: drawHyakkiYagyou,
  drawFreeCellShape: drawYokaiFreeCell,
};

export const yokaiPreviewSvg = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="y-flame" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#b4d8ff" />
      <stop offset="100%" stop-color="#5070b8" />
    </linearGradient>
  </defs>
  <path d="M 16 4 C 22 12, 22 18, 18 24 C 14 26, 10 22, 10 18 C 10 14, 14 10, 16 4 Z" fill="url(#y-flame)" stroke="#3050a0" stroke-width="0.6" />
  <ellipse cx="14" cy="14" rx="1.2" ry="2" fill="#283050" />
  <ellipse cx="18" cy="14" rx="1.2" ry="2" fill="#283050" />
  <ellipse cx="16" cy="18.5" rx="2.5" ry="0.9" fill="#283050" />
  <circle cx="6" cy="22" r="1" fill="#dceeff" opacity="0.7" />
  <circle cx="26" cy="20" r="0.8" fill="#dceeff" opacity="0.6" />
  <circle cx="9" cy="6" r="0.6" fill="#dceeff" opacity="0.5" />
</svg>`.trim();
