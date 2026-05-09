/**
 * Sushi skin v1 — Maneki-neko (lucky cat) collecting sushi vs.
 * octopus predators. All draw functions are pure: no mutation, no
 * audio. They replace the default bell + parts + skirmisher + centipede
 * via Theme.overrides; everything else (brute, hive, mirror, free
 * cells) falls back to defaults that respect the aquatic palette.
 */

import type { Body } from "@/game/types";
import type { World } from "@/game/world";
import type { ThemeOverrides } from "./themes";

// ── Maneki-neko core ─────────────────────────────────────────────────

let cachedCatAngle = 0;

function drawCatCore(ctx: CanvasRenderingContext2D, world: World, core: Body): void {
  const x = core.x ?? 0;
  const y = core.y ?? 0;
  const t = world.tickN;
  const r = core.radius;
  const vx = core.vx ?? 0;
  const vy = core.vy ?? 0;
  const sp = Math.hypot(vx, vy);
  // Subtle face tilt toward motion direction. Damped so course corrections
  // don't snap. Reduced amplitude vs. old impl so the silhouette stays
  // upright and recognizable as a face.
  if (sp > 0.4) {
    const target = Math.atan2(vy, vx) * 0.22;
    let delta = target - cachedCatAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    cachedCatAngle += delta * 0.12;
  }

  ctx.save();
  ctx.translate(x, y);

  // Soft golden halo so the white face still pops on dark backgrounds.
  const halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.2);
  halo.addColorStop(0, "rgba(255, 225, 150, 0.35)");
  halo.addColorStop(1, "rgba(255, 225, 150, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(cachedCatAngle);

  // ── Maneki-neko face — fills the full core radius ───────────────
  // Scale everything to head fills the arena radius so the cat reads
  // at game-distance. No body, no paw, no tail — face + ears + collar.
  const headR = r * 1.2; // intentionally larger than core radius
  const earBaseY = -headR * 0.45;

  // Ears — drawn first so the head outline overlaps the ear bases cleanly.
  ctx.fillStyle = "#fff5d6";
  ctx.strokeStyle = "rgba(120, 70, 20, 0.85)";
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    const earBaseInner = side * headR * 0.32;
    const earBaseOuter = side * headR * 0.78;
    const earTipX = side * headR * 0.6;
    const earTipY = -headR * 1.18;
    ctx.beginPath();
    ctx.moveTo(earBaseInner, earBaseY);
    ctx.lineTo(earTipX, earTipY);
    ctx.lineTo(earBaseOuter, earBaseY + headR * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Inner-ear pink
  ctx.fillStyle = "#ffb7c5";
  for (const side of [-1, 1]) {
    const tipX = side * headR * 0.52;
    const tipY = -headR * 1.0;
    ctx.beginPath();
    ctx.moveTo(side * headR * 0.36, earBaseY + headR * 0.08);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(side * headR * 0.62, earBaseY + headR * 0.05);
    ctx.closePath();
    ctx.fill();
  }

  // Head — main circle
  ctx.fillStyle = "#fff5d6";
  ctx.strokeStyle = "rgba(120, 70, 20, 0.9)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes — large round, with blink animation. Closed half the time
  // gives the iconic squinty maneki look.
  const blink = (t % 200) < 14;
  const eyeY = -headR * 0.05;
  const eyeOffset = headR * 0.34;
  for (const side of [-1, 1]) {
    const ex = side * eyeOffset;
    if (blink) {
      ctx.strokeStyle = "#1a1308";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ex - headR * 0.13, eyeY);
      ctx.quadraticCurveTo(ex, eyeY - headR * 0.05, ex + headR * 0.13, eyeY);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else {
      ctx.fillStyle = "#1a1308";
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, headR * 0.11, headR * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      // Catchlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(ex - headR * 0.04, eyeY - headR * 0.06, headR * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pink cheek blush — reinforces the kawaii read
  ctx.fillStyle = "rgba(255, 150, 170, 0.4)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * headR * 0.55, headR * 0.18, headR * 0.13, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Triangle nose
  ctx.fillStyle = "#d96b8a";
  ctx.strokeStyle = "rgba(140, 30, 60, 0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.07, headR * 0.18);
  ctx.lineTo(headR * 0.07, headR * 0.18);
  ctx.lineTo(0, headR * 0.27);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mouth — small w-curve under the nose
  ctx.strokeStyle = "#1a1308";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, headR * 0.27);
  ctx.lineTo(0, headR * 0.32);
  ctx.moveTo(0, headR * 0.32);
  ctx.quadraticCurveTo(-headR * 0.08, headR * 0.42, -headR * 0.16, headR * 0.34);
  ctx.moveTo(0, headR * 0.32);
  ctx.quadraticCurveTo(headR * 0.08, headR * 0.42, headR * 0.16, headR * 0.34);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Whiskers — 3 per side, fan slightly
  ctx.strokeStyle = "rgba(80, 50, 20, 0.7)";
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const baseY = headR * 0.22 + i * headR * 0.1;
      ctx.beginPath();
      ctx.moveTo(side * headR * 0.32, baseY);
      ctx.lineTo(side * headR * 0.95, baseY + (i - 1) * headR * 0.05);
      ctx.stroke();
    }
  }

  // Red ribbon collar across the bottom of the head
  ctx.fillStyle = "#dc2626";
  ctx.strokeStyle = "rgba(110, 15, 15, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, headR * 0.78, headR * 0.78, headR * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Gold bell hanging at the bottom of the collar
  const bellCY = headR * 0.92;
  const bellR = headR * 0.18;
  const bellGrad = ctx.createRadialGradient(-bellR * 0.3, bellCY - bellR * 0.3, 0, 0, bellCY, bellR);
  bellGrad.addColorStop(0, "#fff7c2");
  bellGrad.addColorStop(0.6, "#f5c648");
  bellGrad.addColorStop(1, "#a0750e");
  ctx.fillStyle = bellGrad;
  ctx.strokeStyle = "rgba(80, 50, 0, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, bellCY, bellR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Bell horizontal seam
  ctx.strokeStyle = "rgba(80, 50, 0, 0.65)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-bellR * 0.85, bellCY + bellR * 0.05);
  ctx.lineTo(bellR * 0.85, bellCY + bellR * 0.05);
  ctx.stroke();
  // Bell vertical slit
  ctx.beginPath();
  ctx.moveTo(0, bellCY);
  ctx.lineTo(0, bellCY + bellR * 0.7);
  ctx.stroke();

  ctx.restore();
}

// ── Octopus skirmisher ───────────────────────────────────────────────

function drawOctopus(ctx: CanvasRenderingContext2D, p: Body, t: number): void {
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  // Danger halo
  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.0);
  halo.addColorStop(0, "rgba(120, 40, 60, 0.4)");
  halo.addColorStop(1, "rgba(120, 40, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 8 tentacles waving (sin-driven undulation behind the body)
  const tentacleCount = 8;
  ctx.strokeStyle = "rgba(80, 30, 50, 0.85)";
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = "round";
  for (let i = 0; i < tentacleCount; i++) {
    const a = (i / tentacleCount - 0.5) * Math.PI * 1.4 + Math.PI;
    const baseX = Math.cos(a) * r * 0.7;
    const baseY = Math.sin(a) * r * 0.7;
    const wave = Math.sin(t * 0.18 + i * 0.7) * r * 0.4;
    const tipX = Math.cos(a) * r * 1.8 + wave * 0.3;
    const tipY = Math.sin(a) * r * 1.8 + wave;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(
      Math.cos(a) * r * 1.3 + wave * 0.5,
      Math.sin(a) * r * 1.3 + wave * 0.7,
      tipX,
      tipY,
    );
    ctx.stroke();
  }

  // Mantle (head bulb)
  const bodyGrad = ctx.createRadialGradient(0, -r * 0.2, 0, 0, 0, r * 1.1);
  bodyGrad.addColorStop(0, "#a23054");
  bodyGrad.addColorStop(1, "#5a1230");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.1, r * 0.95, r * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 15, 35, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes (two pearls)
  ctx.fillStyle = "rgba(255, 240, 240, 0.95)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.32, -r * 0.4, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a1308";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.34, -r * 0.4, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Tako-renji centipede (chained octopus) ───────────────────────────

function drawTakoRenji(ctx: CanvasRenderingContext2D, world: World): void {
  const c = world.centipede;
  if (!c) return;
  const head = c.head;
  const segs = c.segments;
  const all = [head, ...segs];
  const t = world.tickN;
  const isEnraged = c.enragedFlashed;

  // Soft halo under each segment
  const haloFill = isEnraged ? "rgba(220, 60, 40, 0.32)" : "rgba(120, 40, 60, 0.32)";
  for (const b of all) {
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const grad = ctx.createRadialGradient(x, y, b.radius * 0.4, x, y, b.radius * 1.8);
    grad.addColorStop(0, haloFill);
    grad.addColorStop(1, "rgba(120, 40, 60, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, b.radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Connecting tentacle ribbon between segments
  ctx.strokeStyle = isEnraged ? "rgba(220, 60, 40, 0.6)" : "rgba(140, 50, 80, 0.6)";
  ctx.lineWidth = head.radius * 0.55;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(head.x ?? 0, head.y ?? 0);
  for (const s of segs) {
    ctx.lineTo(s.x ?? 0, s.y ?? 0);
  }
  ctx.stroke();

  // Suckers running along the ribbon
  ctx.fillStyle = "rgba(255, 200, 220, 0.6)";
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i];
    const b = all[i + 1];
    const ax = a.x ?? 0;
    const ay = a.y ?? 0;
    const bx = b.x ?? 0;
    const by = b.y ?? 0;
    for (let k = 1; k < 4; k++) {
      const f = k / 4;
      const sx = ax + (bx - ax) * f;
      const sy = ay + (by - ay) * f;
      ctx.beginPath();
      ctx.arc(sx, sy, head.radius * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Each segment as an octopus blob
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const r = b.radius;
    const grad = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
    grad.addColorStop(0, isEnraged ? "#c83048" : "#a23054");
    grad.addColorStop(1, isEnraged ? "#481018" : "#5a1230");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(40, 10, 25, 0.75)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Head — bigger eyes and a beak
  const hx = head.x ?? 0;
  const hy = head.y ?? 0;
  const hr = head.radius;
  const hAngle = Math.atan2(head.vy ?? 0, head.vx ?? 0) || 0;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hAngle);
  ctx.fillStyle = "rgba(255, 240, 240, 0.95)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hr * 0.1, side * hr * 0.4, hr * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a1308";
  const pupilWobble = Math.sin(t * 0.1) * hr * 0.04;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hr * 0.12 + pupilWobble, side * hr * 0.4, hr * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Beak — central dark wedge
  ctx.fillStyle = "#1a0810";
  ctx.beginPath();
  ctx.moveTo(hr * 0.7, 0);
  ctx.lineTo(hr * 0.4, -hr * 0.18);
  ctx.lineTo(hr * 0.4, hr * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Composed-part overrides ─────────────────────────────────────────

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

/** Cat claws extend radially when spines is active. */
function drawCatClaws(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const lvl = world.traits.levels.spines;
  const count = Math.min(12, 6 + lvl);
  const inner = c.r * 1.0;
  const outer = c.r * 1.45;
  ctx.strokeStyle = "rgba(255, 240, 220, 0.95)";
  ctx.fillStyle = "#fff8e5";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const ix = c.x + cosA * inner;
    const iy = c.y + sinA * inner;
    const ox = c.x + cosA * outer;
    const oy = c.y + sinA * outer;
    // Curved claw shape (slight side offset for sickle look)
    const px = -sinA * 2;
    const py = cosA * 2;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.quadraticCurveTo(
      (ix + ox) / 2 + px,
      (iy + oy) / 2 + py,
      ox,
      oy,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cat fangs flank the mouth when pincers is active. */
function drawCatFangs(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  const facing = speed > 0.05 ? Math.atan2(c.vy, c.vx) : 0;
  const ux = Math.cos(facing);
  const uy = Math.sin(facing);
  const px = -uy;
  const py = ux;
  const baseDist = c.r * 1.05;
  const fangLen = c.r * 0.55;
  const fangWidth = c.r * 0.16;
  for (const side of [-1, 1]) {
    const baseX = c.x + ux * baseDist + px * side * c.r * 0.3;
    const baseY = c.y + uy * baseDist + py * side * c.r * 0.3;
    const tipX = baseX + ux * fangLen;
    const tipY = baseY + uy * fangLen;
    ctx.fillStyle = "#fff8e5";
    ctx.strokeStyle = "rgba(120, 70, 30, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(baseX + px * side * fangWidth, baseY + py * side * fangWidth);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(baseX - px * side * fangWidth * 0.4, baseY - py * side * fangWidth * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** Cat tail with sushi skewer — replaces the abstract barbed tail. */
function drawSushiTail(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.05) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const len = world.traits.tailLength;
  const tipX = c.x + ux * len;
  const tipY = c.y + uy * len;

  // Curved cat tail — quadratic bezier with side curl
  const px = -uy;
  const py = ux;
  const curlMag = Math.sin(world.tickN * 0.12) * 12;
  const ctrlX = c.x + ux * len * 0.5 + px * (16 + curlMag);
  const ctrlY = c.y + uy * len * 0.5 + py * (16 + curlMag);

  ctx.strokeStyle = "#fff5d6";
  ctx.lineWidth = c.r * 0.32;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(c.x + ux * c.r * 0.85, c.y + uy * c.r * 0.85);
  ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
  ctx.stroke();

  // Sushi nigiri at the tip — rice base + salmon top
  ctx.fillStyle = "#fff8e5";
  ctx.beginPath();
  ctx.ellipse(tipX, tipY, 9, 5, Math.atan2(uy, ux), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fa6f4d";
  ctx.beginPath();
  ctx.ellipse(tipX, tipY - 3, 8, 3, Math.atan2(uy, ux), 0, Math.PI * 2);
  ctx.fill();
}

/** Matcha-green tea halo for chloroshield. */
function drawMatchaHalo(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const t = world.tickN;
  const lvl = world.traits.levels.chloroshield;
  const radius = c.r * (1.85 + Math.min(lvl - 1, 4) * 0.1);
  const pulse = 0.55 + 0.18 * Math.sin(t * 0.06);
  const grad = ctx.createRadialGradient(c.x, c.y, c.r * 1.05, c.x, c.y, radius);
  grad.addColorStop(0, `rgba(160, 200, 110, ${(0.22 * pulse).toFixed(3)})`);
  grad.addColorStop(0.7, `rgba(120, 170, 90, ${(0.1 * pulse).toFixed(3)})`);
  grad.addColorStop(1, "rgba(120, 170, 90, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Tea-leaf flecks
  ctx.fillStyle = `rgba(110, 150, 80, ${(0.6 * pulse).toFixed(3)})`;
  const flecks = 6;
  for (let i = 0; i < flecks; i++) {
    const a = (i / flecks) * Math.PI * 2 + t * 0.02;
    const fx = c.x + Math.cos(a) * radius * 0.85;
    const fy = c.y + Math.sin(a) * radius * 0.85;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 2.4, 1.2, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Calligraphy ring for regen — kanji-flecked rotating particles. */
function drawCalligraphyRing(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const cap = Math.max(1, world.traits.levels.regen * 3);
  const fullness = Math.min(1, world.regenBuffer / cap);
  const t = world.tickN;
  const radius = c.r * 1.18;
  ctx.strokeStyle = `rgba(120, 60, 40, ${(0.7 * fullness).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Three rotating tick marks (stylized brush strokes)
  ctx.fillStyle = `rgba(120, 60, 40, ${(0.85 * fullness).toFixed(3)})`;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + t * 0.05;
    const tx = c.x + Math.cos(a) * radius;
    const ty = c.y + Math.sin(a) * radius;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Paw-print wake for surge — afterimage prints in player's trail. */
function drawPawPrintWake(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.1) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const t = world.tickN;
  const lvl = world.traits.levels.surge;
  const prints = Math.min(5, 3 + lvl);
  const px = -uy;
  const py = ux;
  for (let i = 0; i < prints; i++) {
    const f = (i + (t * 0.04) % 1) / prints;
    const along = c.r * 1.3 + f * c.r * 1.8;
    const offset = (i % 2 === 0 ? 1 : -1) * c.r * 0.35;
    const pad = c.x + ux * along + px * offset;
    const pady = c.y + uy * along + py * offset;
    const alpha = (1 - f) * 0.7;
    ctx.fillStyle = `rgba(255, 230, 200, ${alpha.toFixed(3)})`;
    // Pad
    ctx.beginPath();
    ctx.ellipse(pad, pady, 4.5, 3.5, Math.atan2(uy, ux), 0, Math.PI * 2);
    ctx.fill();
    // Toes (3 small dots above the pad)
    for (let toe = 0; toe < 3; toe++) {
      const ta = Math.atan2(uy, ux) - 0.4 + toe * 0.4;
      const tx = pad + Math.cos(ta) * 4.5;
      const ty = pady + Math.sin(ta) * 4.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── Realistic sushi free-cell glyphs ────────────────────────────────
// Each NodeTypeId is reskinned as a specific sushi piece. The default
// abstract cell glyph is fully replaced.

function drawSushiFreeCell(ctx: CanvasRenderingContext2D, body: Body, t: number): void {
  const x = body.x ?? 0;
  const y = body.y ?? 0;
  const r = body.radius;
  ctx.save();
  ctx.translate(x, y);

  // Subtle bob — sushi pieces gently rotate and oscillate.
  const bobAngle = Math.sin(t * 0.04 + x * 0.01) * 0.12;
  ctx.rotate(bobAngle);

  switch (body.type) {
    case "propulsion": {
      // Ebi nigiri — pink-orange shrimp draped over rice oval.
      // Rice base
      const rice = ctx.createLinearGradient(0, -r * 0.25, 0, r * 0.6);
      rice.addColorStop(0, "#ffffff");
      rice.addColorStop(1, "#f0e8d0");
      ctx.fillStyle = rice;
      ctx.strokeStyle = "rgba(160, 130, 80, 0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.15, r * 0.95, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Shrimp body — pink with white-and-orange stripes
      const shrimp = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.2);
      shrimp.addColorStop(0, "#ff9d92");
      shrimp.addColorStop(1, "#e8625a");
      ctx.fillStyle = shrimp;
      ctx.strokeStyle = "rgba(140, 50, 40, 0.85)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.1, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Curl tail accent
      ctx.fillStyle = "#c4453d";
      ctx.beginPath();
      ctx.ellipse(r * 0.55, -r * 0.18, r * 0.18, r * 0.12, 0.5, 0, Math.PI * 2);
      ctx.fill();
      // White stripes on shrimp
      ctx.strokeStyle = "rgba(255, 240, 230, 0.65)";
      ctx.lineWidth = 0.8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.32, -r * 0.42);
        ctx.lineTo(i * r * 0.32, r * 0.18);
        ctx.stroke();
      }
      break;
    }
    case "sensor": {
      // Tamago nigiri — yellow egg block on rice with nori belt.
      // Rice base
      const rice = ctx.createLinearGradient(0, -r * 0.1, 0, r * 0.7);
      rice.addColorStop(0, "#ffffff");
      rice.addColorStop(1, "#efe4cc");
      ctx.fillStyle = rice;
      ctx.strokeStyle = "rgba(160, 130, 80, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tamago block (yellow)
      const tama = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.2);
      tama.addColorStop(0, "#ffe066");
      tama.addColorStop(0.5, "#ffd633");
      tama.addColorStop(1, "#e8b51a");
      ctx.fillStyle = tama;
      ctx.strokeStyle = "rgba(140, 100, 0, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.15, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Layered tamago lines (folded omelette)
      ctx.strokeStyle = "rgba(180, 140, 0, 0.45)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.18);
      ctx.lineTo(r * 0.7, -r * 0.18);
      ctx.moveTo(-r * 0.7, -r * 0.05);
      ctx.lineTo(r * 0.7, -r * 0.05);
      ctx.stroke();
      // Nori belt across the middle
      ctx.fillStyle = "#1c2a1a";
      ctx.fillRect(-r * 0.95, r * 0.05, r * 1.9, r * 0.18);
      break;
    }
    case "membrane": {
      // Onigiri — white triangular rice ball with nori band.
      const rice = ctx.createLinearGradient(0, -r * 0.9, 0, r * 0.7);
      rice.addColorStop(0, "#ffffff");
      rice.addColorStop(1, "#e0d8c0");
      ctx.fillStyle = rice;
      ctx.strokeStyle = "rgba(140, 110, 70, 0.75)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.85, r * 0.65);
      ctx.lineTo(-r * 0.85, r * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Nori band along the bottom
      ctx.fillStyle = "#1c2a1a";
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, r * 0.1);
      ctx.lineTo(r * 0.55, r * 0.1);
      ctx.lineTo(r * 0.85, r * 0.65);
      ctx.lineTo(-r * 0.85, r * 0.65);
      ctx.closePath();
      ctx.fill();
      // Rice grain hint
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      for (const [px, py] of [[-r * 0.2, -r * 0.3], [r * 0.15, -r * 0.5], [r * 0.25, -r * 0.1]]) {
        ctx.beginPath();
        ctx.ellipse(px, py, 1.4, 0.8, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "mouth": {
      // Maguro (tuna) nigiri — deep red slab on rice.
      const rice = ctx.createLinearGradient(0, -r * 0.1, 0, r * 0.7);
      rice.addColorStop(0, "#ffffff");
      rice.addColorStop(1, "#efe4cc");
      ctx.fillStyle = rice;
      ctx.strokeStyle = "rgba(160, 130, 80, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tuna slab
      const tuna = ctx.createLinearGradient(0, -r * 0.55, 0, r * 0.15);
      tuna.addColorStop(0, "#d12d36");
      tuna.addColorStop(0.5, "#a91823");
      tuna.addColorStop(1, "#7a0e16");
      ctx.fillStyle = tuna;
      ctx.strokeStyle = "rgba(60, 5, 10, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.15, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Marbling streaks (white fat lines)
      ctx.strokeStyle = "rgba(255, 230, 220, 0.55)";
      ctx.lineWidth = 0.7;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.15 + i * r * 0.08);
        ctx.bezierCurveTo(-r * 0.2, -r * 0.18 + i * r * 0.08, r * 0.2, -r * 0.12 + i * r * 0.08, r * 0.6, -r * 0.18 + i * r * 0.08);
        ctx.stroke();
      }
      break;
    }
    case "stinger": {
      // Tekka maki cross-section — round nori ring + rice + tuna center.
      // Outer nori ring
      ctx.fillStyle = "#1c2a1a";
      ctx.strokeStyle = "rgba(0, 20, 0, 0.85)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Rice ring
      ctx.fillStyle = "#fff5e0";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(160, 130, 80, 0.55)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Tuna center
      const tuna = ctx.createRadialGradient(-r * 0.1, -r * 0.1, 0, 0, 0, r * 0.4);
      tuna.addColorStop(0, "#e54652");
      tuna.addColorStop(1, "#8a1320");
      ctx.fillStyle = tuna;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 5, 10, 0.7)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Rice grain texture
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * r * 0.6;
        const py = Math.sin(a) * r * 0.6;
        ctx.beginPath();
        ctx.ellipse(px, py, 0.9, 0.5, a, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "chloroplast": {
      // Kappa maki cross-section — nori ring + rice + cucumber wedges.
      ctx.fillStyle = "#1c2a1a";
      ctx.strokeStyle = "rgba(0, 20, 0, 0.85)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Rice ring
      ctx.fillStyle = "#fff5e0";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(160, 130, 80, 0.55)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Cucumber center — light green with darker edge
      const cuke = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.4);
      cuke.addColorStop(0, "#d8f0a8");
      cuke.addColorStop(0.65, "#88c060");
      cuke.addColorStop(1, "#3a7028");
      ctx.fillStyle = cuke;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(30, 60, 20, 0.85)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // Cucumber seed dots
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const px = Math.cos(a) * r * 0.18;
        const py = Math.sin(a) * r * 0.18;
        ctx.beginPath();
        ctx.ellipse(px, py, 1, 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "mitochondrion": {
      // Uni gunkan — nori boat wrapping orange sea-urchin roe heaped on rice.
      // Nori boat outer
      ctx.fillStyle = "#1c2a1a";
      ctx.strokeStyle = "rgba(0, 15, 0, 0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.05, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Rice underlayer
      ctx.fillStyle = "#fff8e0";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.25, r * 0.78, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Uni mound (orange/gold roe heap)
      const uni = ctx.createRadialGradient(-r * 0.1, -r * 0.2, 0, 0, -r * 0.15, r * 0.7);
      uni.addColorStop(0, "#fff0a0");
      uni.addColorStop(0.5, "#ffba30");
      uni.addColorStop(1, "#cc7510");
      ctx.fillStyle = uni;
      ctx.strokeStyle = "rgba(120, 60, 0, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.15, r * 0.7, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Glistening highlight on uni
      ctx.fillStyle = "rgba(255, 255, 220, 0.6)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.18, -r * 0.3, r * 0.2, r * 0.08, 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "spore": {
      // Gari — pink pickled-ginger slice. Translucent, undulating ribbon.
      const grad = ctx.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, "#fff0f4");
      grad.addColorStop(0.5, "#ffc4d0");
      grad.addColorStop(1, "#f593a8");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(180, 70, 100, 0.65)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      // Wavy curled-petal silhouette
      ctx.moveTo(-r * 0.85, -r * 0.1);
      ctx.bezierCurveTo(-r * 0.5, -r * 0.85, r * 0.45, -r * 0.65, r * 0.85, -r * 0.05);
      ctx.bezierCurveTo(r * 0.6, r * 0.7, -r * 0.55, r * 0.75, -r * 0.85, -r * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Translucent veining
      ctx.strokeStyle = "rgba(220, 140, 160, 0.45)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.bezierCurveTo(-r * 0.2, -r * 0.3, r * 0.2, -r * 0.2, r * 0.5, -r * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.2);
      ctx.bezierCurveTo(0, r * 0.05, r * 0.3, r * 0.15, r * 0.55, r * 0.05);
      ctx.stroke();
      break;
    }
    case "core":
    default: {
      // Fallback — simple nigiri shape.
      ctx.fillStyle = "rgba(255, 245, 220, 0.85)";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.85, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ── Big Octopus brute ────────────────────────────────────────────────

function drawBigOctopus(ctx: CanvasRenderingContext2D, p: Body, t: number): void {
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.0);
  halo.addColorStop(0, "rgba(180, 20, 20, 0.5)");
  halo.addColorStop(1, "rgba(180, 20, 20, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 8 thicker tentacles
  ctx.strokeStyle = "rgba(60, 15, 35, 0.92)";
  ctx.lineWidth = r * 0.24;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8 - 0.5) * Math.PI * 1.5 + Math.PI;
    const wave = Math.sin(t * 0.15 + i * 0.7) * r * 0.5;
    const tipX = Math.cos(a) * r * 1.9 + wave * 0.3;
    const tipY = Math.sin(a) * r * 1.9 + wave;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
    ctx.quadraticCurveTo(Math.cos(a) * r * 1.4 + wave * 0.5, Math.sin(a) * r * 1.4 + wave * 0.7, tipX, tipY);
    ctx.stroke();
  }

  // Bigger mantle
  const bodyGrad = ctx.createRadialGradient(0, -r * 0.3, 0, 0, 0, r * 1.2);
  bodyGrad.addColorStop(0, "#c43d68");
  bodyGrad.addColorStop(1, "#601a30");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.1, r * 1.05, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(50, 10, 25, 0.95)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Bigger eyes with glare
  ctx.fillStyle = "rgba(255, 250, 240, 0.95)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.36, -r * 0.45, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a0810";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.38, -r * 0.45, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Octopus Queen (drawHiveQueen replacement) ────────────────────────

function drawOctopusQueen(ctx: CanvasRenderingContext2D, world: World): void {
  const h = world.hiveQueen;
  if (!h) return;
  const t = world.tickN;
  const body = h.body;
  const cx = body.x ?? 0;
  const cy = body.y ?? 0;
  const r = body.radius;

  const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.6);
  halo.addColorStop(0, "rgba(180, 30, 80, 0.4)");
  halo.addColorStop(1, "rgba(180, 30, 80, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);

  // 10 long royal tentacles
  ctx.strokeStyle = "rgba(50, 5, 30, 0.95)";
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = "round";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const wave = Math.sin(t * 0.1 + i * 0.6) * r * 0.35;
    const tipR = r * 2.2;
    const tipX = Math.cos(a) * tipR + Math.cos(a + Math.PI / 2) * wave;
    const tipY = Math.sin(a) * tipR + Math.sin(a + Math.PI / 2) * wave;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    ctx.quadraticCurveTo(Math.cos(a) * r * 1.4 + wave, Math.sin(a) * r * 1.4 + wave, tipX, tipY);
    ctx.stroke();
  }

  // Royal mantle — purple-red with gold rim
  const mantle = ctx.createRadialGradient(0, -r * 0.4, 0, 0, 0, r * 1.2);
  mantle.addColorStop(0, "#a8245a");
  mantle.addColorStop(1, "#3d0a25");
  ctx.fillStyle = mantle;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r * 1.1, r * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Gold rim crown
  ctx.strokeStyle = "#f5c648";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Crown spikes on top
  ctx.fillStyle = "#f5c648";
  ctx.strokeStyle = "rgba(120, 80, 0, 0.9)";
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    const cx2 = i * r * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx2 - r * 0.08, -r * 1.1);
    ctx.lineTo(cx2, -r * 1.4);
    ctx.lineTo(cx2 + r * 0.08, -r * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Big royal eyes
  ctx.fillStyle = "rgba(255, 250, 240, 0.95)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.4, -r * 0.45, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a0810";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * r * 0.42, -r * 0.45, r * 0.1, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lipstick mouth
  ctx.fillStyle = "#dc2649";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r * 0.22, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Baby octopus drones
  for (const drone of h.drones) {
    drawOctopus(ctx, drone, t);
  }
}

// ── Mimic Octopus (drawMirror replacement) ───────────────────────────

function drawMimicOctopus(ctx: CanvasRenderingContext2D, world: World): void {
  const m = world.mirror;
  if (!m) return;
  const t = world.tickN;
  const body = m.body;
  const x = body.x ?? 0;
  const y = body.y ?? 0;
  const r = body.radius;

  // Color-shifting halo (mimic-octopus is a chameleon)
  const colorPhase = (t * 0.04) % (Math.PI * 2);
  const hueR = 180 + Math.sin(colorPhase) * 60;
  const hueG = 80 + Math.sin(colorPhase + 2) * 40;
  const hueB = 100 + Math.sin(colorPhase + 4) * 60;
  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4);
  halo.addColorStop(0, `rgba(${hueR}, ${hueG}, ${hueB}, 0.42)`);
  halo.addColorStop(1, `rgba(${hueR}, ${hueG}, ${hueB}, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);

  // 8 striped/banded tentacles (mimic octopus has signature stripes)
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8 - 0.5) * Math.PI * 1.4 + Math.PI;
    const wave = Math.sin(t * 0.16 + i * 0.7) * r * 0.5;
    const tipX = Math.cos(a) * r * 1.7 + wave * 0.3;
    const tipY = Math.sin(a) * r * 1.7 + wave;
    // Outer (white)
    ctx.strokeStyle = "rgba(245, 240, 235, 0.95)";
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65);
    ctx.quadraticCurveTo(Math.cos(a) * r * 1.2 + wave * 0.5, Math.sin(a) * r * 1.2 + wave * 0.7, tipX, tipY);
    ctx.stroke();
    // Stripes
    ctx.lineWidth = r * 0.08;
    ctx.strokeStyle = "rgba(40, 20, 30, 0.9)";
    for (let s = 0.2; s < 1; s += 0.25) {
      const sx = Math.cos(a) * r * (0.65 + (1.7 - 0.65) * s) + wave * (0.5 * s);
      const sy = Math.sin(a) * r * (0.65 + (1.7 - 0.65) * s) + wave * (0.7 * s);
      const px = -Math.sin(a) * r * 0.18;
      const py = Math.cos(a) * r * 0.18;
      ctx.beginPath();
      ctx.moveTo(sx + px, sy + py);
      ctx.lineTo(sx - px, sy - py);
      ctx.stroke();
    }
    ctx.lineWidth = r * 0.2;
  }

  // Mimic mantle — color-shifting fill
  const bodyGrad = ctx.createRadialGradient(0, -r * 0.2, 0, 0, 0, r * 1.0);
  bodyGrad.addColorStop(0, `rgb(${hueR + 40}, ${hueG + 30}, ${hueB + 30})`);
  bodyGrad.addColorStop(1, `rgb(${Math.max(20, hueR - 80)}, ${Math.max(10, hueG - 40)}, ${Math.max(20, hueB - 50)})`);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r * 0.95, r * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(20, 5, 15, 0.85)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Stripes on mantle
  ctx.strokeStyle = "rgba(245, 240, 235, 0.55)";
  ctx.lineWidth = r * 0.06;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(0, i * r * 0.3 - r * 0.1, r * 0.85, r * 0.06, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Glowing eyes
  ctx.fillStyle = `rgb(${hueR + 60}, ${hueG + 80}, ${hueB + 50})`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.32, -r * 0.4, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a0810";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.34, -r * 0.4, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Razor Eel (drawPhage replacement) ────────────────────────────────

function drawRazorEel(ctx: CanvasRenderingContext2D, world: World): void {
  const p = world.phage;
  if (!p) return;
  const t = world.tickN;
  const body = p.body;
  const x = body.x ?? 0;
  const y = body.y ?? 0;
  const r = body.radius;

  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.0);
  halo.addColorStop(0, "rgba(120, 200, 220, 0.3)");
  halo.addColorStop(1, "rgba(120, 200, 220, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);

  // Coiled eel body — sinuous serpent shape spiralled in on itself
  const coilSeg = 14;
  ctx.strokeStyle = "#1a3540";
  ctx.lineWidth = r * 0.36;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < coilSeg; i++) {
    const f = i / (coilSeg - 1);
    const a = f * Math.PI * 4 + t * 0.02;
    const radius = r * (0.2 + f * 0.85);
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // Spinal scales
  ctx.strokeStyle = "rgba(180, 230, 240, 0.65)";
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  for (let i = 0; i < coilSeg; i++) {
    const f = i / (coilSeg - 1);
    const a = f * Math.PI * 4 + t * 0.02;
    const radius = r * (0.2 + f * 0.85);
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Head — angular fish-skull at outermost coil end
  const headA = (coilSeg - 1) / (coilSeg - 1) * Math.PI * 4 + t * 0.02;
  const headR = r * (0.2 + 0.85);
  const hx = Math.cos(headA) * headR;
  const hy = Math.sin(headA) * headR;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headA + Math.PI / 2);
  ctx.fillStyle = "#0a1a22";
  ctx.strokeStyle = "rgba(180, 230, 240, 0.85)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.45);
  ctx.lineTo(r * 0.28, 0);
  ctx.lineTo(0, r * 0.45);
  ctx.lineTo(-r * 0.18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Glowing eye
  ctx.fillStyle = "rgba(255, 240, 100, 0.95)";
  ctx.beginPath();
  ctx.arc(0, -r * 0.05, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  // Razor teeth
  ctx.fillStyle = "rgba(255, 250, 240, 0.95)";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(r * 0.05, i * r * 0.1);
    ctx.lineTo(r * 0.28, i * r * 0.1 + r * 0.04);
    ctx.lineTo(r * 0.05, i * r * 0.1 + r * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();

  // Virion projectiles → razor-tooth darts
  for (const v of p.virions) {
    const age = (world.wallMs - v.bornMs) / 1800;
    const alpha = Math.max(0.4, 1 - age * 0.6);
    const speed = Math.hypot(v.vx, v.vy);
    if (speed > 0.01) {
      const ux = v.vx / speed;
      const uy = v.vy / speed;
      // Dart trail
      ctx.strokeStyle = `rgba(180, 230, 240, ${(alpha * 0.6).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(v.x - ux * 16, v.y - uy * 16);
      ctx.lineTo(v.x, v.y);
      ctx.stroke();
      ctx.lineCap = "butt";
      // Tooth-shaped warhead
      ctx.fillStyle = `rgba(255, 250, 240, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(v.x + ux * 4, v.y + uy * 4);
      ctx.lineTo(v.x - uy * 2, v.y + ux * 2);
      ctx.lineTo(v.x + uy * 2, v.y - ux * 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ── Starfish (drawCiliate replacement) ───────────────────────────────

function drawStarfish(ctx: CanvasRenderingContext2D, world: World): void {
  const c = world.ciliate;
  if (!c) return;
  const t = world.tickN;
  const body = c.body;
  const x = body.x ?? 0;
  const y = body.y ?? 0;
  const r = body.radius;
  const angle = Math.atan2(body.vy ?? 0, body.vx ?? 0) || 0;

  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.9);
  halo.addColorStop(0, "rgba(220, 100, 60, 0.42)");
  halo.addColorStop(1, "rgba(220, 100, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + t * 0.01);

  // 5-armed star body
  const arms = 5;
  const innerR = r * 0.35;
  const outerR = r * 1.05;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
  grad.addColorStop(0, "#ff8a4a");
  grad.addColorStop(0.6, "#dc4628");
  grad.addColorStop(1, "#7a1a08");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(60, 10, 5, 0.95)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < arms * 2; i++) {
    const a = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? outerR : innerR;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Tube feet — small dots running along each arm
  ctx.fillStyle = "rgba(255, 220, 150, 0.85)";
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 - Math.PI / 2;
    for (let k = 1; k <= 4; k++) {
      const f = k / 4.5;
      const px = Math.cos(a) * outerR * f;
      const py = Math.sin(a) * outerR * f;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Central mouth (underside up = visible)
  ctx.fillStyle = "rgba(20, 5, 0, 0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 220, 100, 0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Bundle ───────────────────────────────────────────────────────────

export const sushiOverrides: ThemeOverrides = {
  drawCore: drawCatCore,
  drawSpines: drawCatClaws,
  drawPincers: drawCatFangs,
  drawBarbedTail: drawSushiTail,
  drawChloroshield: drawMatchaHalo,
  drawRegenGlow: drawCalligraphyRing,
  drawSurgeWake: drawPawPrintWake,
  drawSkirmisher: drawOctopus,
  drawBrutePredator: drawBigOctopus,
  drawCentipede: drawTakoRenji,
  drawHiveQueen: drawOctopusQueen,
  drawMirror: drawMimicOctopus,
  drawPhage: drawRazorEel,
  drawCiliate: drawStarfish,
  drawFreeCellShape: drawSushiFreeCell,
};

export const sushiPreviewSvg = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="16" cy="22" rx="8.5" ry="6" fill="#fff5d6" stroke="#8c5a1e" stroke-width="0.8" />
  <circle cx="20" cy="14" r="5.5" fill="#fff5d6" stroke="#8c5a1e" stroke-width="0.8" />
  <path d="M 16 9.5 L 14.5 6 L 18 8" fill="#fff5d6" stroke="#8c5a1e" stroke-width="0.6" />
  <path d="M 23 9.5 L 25 6 L 23 9" fill="#fff5d6" stroke="#8c5a1e" stroke-width="0.6" />
  <circle cx="18.5" cy="13.5" r="0.7" fill="#1a1308" />
  <circle cx="22" cy="13.5" r="0.7" fill="#1a1308" />
  <circle cx="23.5" cy="14.5" r="0.4" fill="#d97757" />
  <ellipse cx="15" cy="20" rx="4" ry="1" fill="#dc2626" />
  <circle cx="13.5" cy="20" r="0.9" fill="#fbbf24" />
  <path d="M 9 16 Q 5 16 7 12 Q 8 8 11 11" fill="#fff5d6" stroke="#8c5a1e" stroke-width="0.6" />
</svg>`.trim();
