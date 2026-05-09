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
  // Body faces motion (head-forward); smooth lerp so course corrections
  // don't snap.
  if (sp > 0.4) {
    const target = Math.atan2(vy, vx);
    let delta = target - cachedCatAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    cachedCatAngle += delta * 0.15;
  }

  ctx.save();
  ctx.translate(x, y);

  // Soft golden halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.2);
  halo.addColorStop(0, "rgba(255, 225, 150, 0.32)");
  halo.addColorStop(1, "rgba(255, 225, 150, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(cachedCatAngle);

  // Body — rounded rectangle (kotori-form lucky cat)
  const bodyW = r * 1.7;
  const bodyH = r * 1.35;
  ctx.fillStyle = "#fff5d6";
  ctx.strokeStyle = "rgba(140, 90, 30, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, bodyW * 0.55, bodyH * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Belly patch
  ctx.fillStyle = "#ffe8a8";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.4, bodyW * 0.3, bodyH * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  const headR = r * 0.78;
  const headX = bodyW * 0.55;
  const headY = -r * 0.35;
  ctx.fillStyle = "#fff5d6";
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears (triangles)
  ctx.fillStyle = "#fff5d6";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.2, headY - headR * 0.7 + side * headR * 0.05);
    ctx.lineTo(headX - headR * 0.65, headY - headR * 1.05 + side * headR * 0.4);
    ctx.lineTo(headX + headR * 0.05, headY - headR * 0.85 + side * headR * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Inner ear pink
  ctx.fillStyle = "#ffb7c5";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      headX - headR * 0.32,
      headY - headR * 0.78 + side * headR * 0.18,
      headR * 0.12,
      headR * 0.22,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Eyes (closed/blinking — 8% blink rate)
  const blink = (t % 240) < 8;
  ctx.strokeStyle = "#1a1308";
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    const ex = headX + headR * 0.05;
    const ey = headY - headR * 0.05 + side * headR * 0.32;
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - headR * 0.18, ey);
      ctx.quadraticCurveTo(ex, ey + headR * 0.06, ex + headR * 0.18, ey);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#1a1308";
      ctx.beginPath();
      ctx.ellipse(ex, ey, headR * 0.07, headR * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Nose
  ctx.fillStyle = "#d97757";
  ctx.beginPath();
  ctx.arc(headX + headR * 0.45, headY, headR * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = "rgba(140, 90, 30, 0.55)";
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const wy = headY + side * (headR * 0.18 + i * headR * 0.12);
      ctx.beginPath();
      ctx.moveTo(headX + headR * 0.35, wy);
      ctx.lineTo(headX + headR * 0.95, wy + side * headR * 0.05);
      ctx.stroke();
    }
  }

  // Red ribbon collar with bell
  ctx.fillStyle = "#dc2626";
  ctx.strokeStyle = "rgba(120, 20, 20, 0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(headX * 0.55, r * 0.05, bodyW * 0.32, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Bell
  const bellGrad = ctx.createRadialGradient(
    headX * 0.45 + r * 0.05,
    r * 0.0,
    0,
    headX * 0.45,
    r * 0.05,
    r * 0.16,
  );
  bellGrad.addColorStop(0, "#fff7c2");
  bellGrad.addColorStop(1, "#d6a017");
  ctx.fillStyle = bellGrad;
  ctx.beginPath();
  ctx.arc(headX * 0.45, r * 0.05, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 70, 0, 0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Raised waving paw — opposite side of body, bobs with tickN
  const wave = Math.sin(t * 0.18);
  const pawAngle = -Math.PI * 0.25 + wave * 0.18;
  const pawX = -bodyW * 0.35;
  const pawY = -r * 0.15;
  const pawTipX = pawX + Math.cos(pawAngle) * r * 0.85;
  const pawTipY = pawY + Math.sin(pawAngle) * r * 0.85;
  ctx.strokeStyle = "rgba(140, 90, 30, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.fillStyle = "#fff5d6";
  // Arm
  ctx.beginPath();
  ctx.lineWidth = r * 0.25;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#fff5d6";
  ctx.moveTo(pawX, pawY);
  ctx.lineTo(pawTipX, pawTipY);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(140, 90, 30, 0.55)";
  // Paw pad
  ctx.fillStyle = "#fff5d6";
  ctx.beginPath();
  ctx.arc(pawTipX, pawTipY, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Pink toe beans
  ctx.fillStyle = "#ffb7c5";
  ctx.beginPath();
  ctx.arc(pawTipX, pawTipY, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Tail (curled, behind body)
  ctx.strokeStyle = "#fff5d6";
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.5, r * 0.1);
  ctx.quadraticCurveTo(-bodyW * 0.95, r * 0.4, -bodyW * 0.85, -r * 0.4);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(140, 90, 30, 0.55)";
  ctx.lineCap = "butt";

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
  drawCentipede: drawTakoRenji,
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
