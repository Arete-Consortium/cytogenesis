/**
 * Galactic skin v1 — UFO collecting fuel + weapons vs. alien fighters.
 * Mirrors the aquatic override surface: drawCore + 6 composed parts +
 * drawSkirmisher + drawCentipede. Brute / hive / mirror / phage / ciliate
 * still fall back to defaults tinted with the violet/amber palette.
 */

import type { Body } from "@/game/types";
import type { World } from "@/game/world";
import type { ThemeOverrides } from "./themes";

let cachedSaucerAngle = 0;

// ── UFO core ─────────────────────────────────────────────────────────

function drawUfoCore(ctx: CanvasRenderingContext2D, world: World, core: Body): void {
  const x = core.x ?? 0;
  const y = core.y ?? 0;
  const r = core.radius;
  const t = world.tickN;
  const vx = core.vx ?? 0;
  const vy = core.vy ?? 0;
  const sp = Math.hypot(vx, vy);
  // Saucer banks slightly into motion vector — cosmetic tilt only.
  if (sp > 0.4) {
    const target = Math.atan2(vy, vx) * 0.25;
    let delta = target - cachedSaucerAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    cachedSaucerAngle += delta * 0.12;
  }

  ctx.save();
  ctx.translate(x, y);

  // Anti-grav halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4);
  halo.addColorStop(0, "rgba(167, 139, 250, 0.32)");
  halo.addColorStop(1, "rgba(167, 139, 250, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Tractor beam to nearest free cell — only if any free body within range
  let nearest: Body | null = null;
  let nearestSq = (r * 6) * (r * 6);
  for (const b of world.freeBodies) {
    const dx = (b.x ?? 0) - x;
    const dy = (b.y ?? 0) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestSq) {
      nearest = b;
      nearestSq = d2;
    }
  }
  if (nearest) {
    const tx = (nearest.x ?? 0) - x;
    const ty = (nearest.y ?? 0) - y;
    const tlen = Math.hypot(tx, ty) || 1;
    const ux = tx / tlen;
    const uy = ty / tlen;
    // Shimmering cone
    const grad = ctx.createLinearGradient(0, 0, ux * tlen, uy * tlen);
    grad.addColorStop(0, "rgba(196, 181, 253, 0.55)");
    grad.addColorStop(1, "rgba(196, 181, 253, 0)");
    ctx.fillStyle = grad;
    const px = -uy;
    const py = ux;
    const w0 = r * 0.55;
    const w1 = r * 0.18;
    ctx.beginPath();
    ctx.moveTo(px * w0, py * w0);
    ctx.lineTo(ux * tlen + px * w1, uy * tlen + py * w1);
    ctx.lineTo(ux * tlen - px * w1, uy * tlen - py * w1);
    ctx.lineTo(-px * w0, -py * w0);
    ctx.closePath();
    ctx.fill();
    // Shimmer dashes flowing along beam
    ctx.strokeStyle = "rgba(245, 240, 255, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -t * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ux * tlen, uy * tlen);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.rotate(cachedSaucerAngle);

  // Saucer disk — flat ellipse
  const diskW = r * 1.9;
  const diskH = r * 0.45;
  const diskGrad = ctx.createLinearGradient(0, -diskH, 0, diskH);
  diskGrad.addColorStop(0, "#dcd4ff");
  diskGrad.addColorStop(0.5, "#b9aafc");
  diskGrad.addColorStop(1, "#5b21b6");
  ctx.fillStyle = diskGrad;
  ctx.strokeStyle = "rgba(40, 20, 80, 0.85)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, diskW, diskH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Underside ribbon (darker)
  ctx.fillStyle = "rgba(30, 15, 55, 0.6)";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.18, diskW * 0.95, diskH * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rim lights — rotate around the disk perimeter
  const lightCount = 8;
  for (let i = 0; i < lightCount; i++) {
    const phase = (i / lightCount) * Math.PI * 2 + t * 0.05;
    const lx = Math.cos(phase) * diskW * 0.95;
    const ly = Math.sin(phase) * 0.18 + r * 0.1; // squashed orbit (top of disk)
    const visibility = 0.5 + 0.5 * Math.cos(phase);
    if (visibility < 0.15) continue;
    ctx.fillStyle = `rgba(251, 191, 36, ${(visibility * 0.95).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glowing dome on top
  const domeR = r * 0.7;
  const domeGrad = ctx.createRadialGradient(0, -domeR * 0.5, 0, 0, -domeR * 0.4, domeR);
  domeGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  domeGrad.addColorStop(0.6, "rgba(196, 181, 253, 0.85)");
  domeGrad.addColorStop(1, "rgba(91, 33, 182, 0.7)");
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.18, domeR, domeR * 0.85, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 20, 80, 0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Dome highlight (hot spot)
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.ellipse(-domeR * 0.25, -r * 0.45, domeR * 0.18, domeR * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Alien fighter skirmisher ─────────────────────────────────────────

function drawAlienFighter(ctx: CanvasRenderingContext2D, p: Body, t: number): void {
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  // Hostile halo
  const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 1.9);
  halo.addColorStop(0, "rgba(251, 146, 60, 0.42)");
  halo.addColorStop(1, "rgba(251, 146, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Triangular hull (nose forward at +x)
  ctx.fillStyle = "#3a1607";
  ctx.strokeStyle = "rgba(254, 215, 170, 0.6)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(r * 1.1, 0);
  ctx.lineTo(-r * 0.7, -r * 0.85);
  ctx.lineTo(-r * 0.45, 0);
  ctx.lineTo(-r * 0.7, r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cockpit canopy
  const canopy = ctx.createRadialGradient(r * 0.25, 0, 0, r * 0.25, 0, r * 0.45);
  canopy.addColorStop(0, "rgba(251, 191, 36, 0.95)");
  canopy.addColorStop(1, "rgba(120, 53, 15, 0.6)");
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(r * 0.25, 0, r * 0.42, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Twin thruster glow — pulse with tickN
  const thrustPulse = 0.7 + 0.3 * Math.sin(t * 0.4);
  for (const side of [-1, 1]) {
    const tx = -r * 0.55;
    const ty = side * r * 0.55;
    const tg = ctx.createRadialGradient(tx, ty, 0, tx - r * 0.4, ty, r * 0.35);
    tg.addColorStop(0, `rgba(255, 200, 120, ${(0.95 * thrustPulse).toFixed(3)})`);
    tg.addColorStop(1, "rgba(255, 100, 40, 0)");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(tx - r * 0.25, ty, r * 0.55, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forward antenna spike
  ctx.strokeStyle = "rgba(254, 215, 170, 0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(r * 1.1, 0);
  ctx.lineTo(r * 1.45, 0);
  ctx.stroke();

  ctx.restore();
}

// ── Alien dreadnought serpent (centipede reskin) ─────────────────────

function drawAlienDreadnought(ctx: CanvasRenderingContext2D, world: World): void {
  const c = world.centipede;
  if (!c) return;
  const head = c.head;
  const segs = c.segments;
  const all = [head, ...segs];
  const t = world.tickN;
  const isEnraged = c.enragedFlashed;

  // Energy field under the chain
  const haloFill = isEnraged ? "rgba(220, 60, 40, 0.32)" : "rgba(251, 146, 60, 0.32)";
  for (const b of all) {
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const grad = ctx.createRadialGradient(x, y, b.radius * 0.4, x, y, b.radius * 1.8);
    grad.addColorStop(0, haloFill);
    grad.addColorStop(1, "rgba(251, 146, 60, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, b.radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Connecting energy spine between hull sections
  ctx.strokeStyle = isEnraged ? "rgba(255, 100, 60, 0.75)" : "rgba(251, 191, 36, 0.65)";
  ctx.lineWidth = head.radius * 0.18;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(head.x ?? 0, head.y ?? 0);
  for (const s of segs) {
    ctx.lineTo(s.x ?? 0, s.y ?? 0);
  }
  ctx.stroke();
  // Inner core line
  ctx.strokeStyle = "rgba(255, 245, 230, 0.85)";
  ctx.lineWidth = head.radius * 0.06;
  ctx.beginPath();
  ctx.moveTo(head.x ?? 0, head.y ?? 0);
  for (const s of segs) {
    ctx.lineTo(s.x ?? 0, s.y ?? 0);
  }
  ctx.stroke();

  // Pyramidal hull sections
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const r = b.radius;
    const segAngle = Math.atan2(b.vy ?? 0, b.vx ?? 0) || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(segAngle);

    // Diamond hull
    const hullGrad = ctx.createLinearGradient(-r, 0, r, 0);
    hullGrad.addColorStop(0, isEnraged ? "#3a0e10" : "#3a1607");
    hullGrad.addColorStop(1, isEnraged ? "#60181c" : "#603a18");
    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = "rgba(254, 215, 170, 0.6)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(0, -r * 0.82);
    ctx.lineTo(-r * 0.85, 0);
    ctx.lineTo(0, r * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing centerline window
    const windowGrad = ctx.createLinearGradient(-r * 0.6, 0, r * 0.7, 0);
    windowGrad.addColorStop(0, "rgba(120, 53, 15, 0.4)");
    windowGrad.addColorStop(0.5, isEnraged ? "rgba(255, 80, 60, 0.95)" : "rgba(251, 191, 36, 0.95)");
    windowGrad.addColorStop(1, "rgba(120, 53, 15, 0.4)");
    ctx.fillStyle = windowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.6, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Head — extra-large + forward gun ports
  const hx = head.x ?? 0;
  const hy = head.y ?? 0;
  const hr = head.radius;
  const hAngle = Math.atan2(head.vy ?? 0, head.vx ?? 0) || 0;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hAngle);
  // Gun port glow on the front face
  const portGlow = ctx.createRadialGradient(hr * 0.5, 0, 0, hr * 0.5, 0, hr * 0.35);
  portGlow.addColorStop(0, isEnraged ? "rgba(255, 80, 60, 0.95)" : "rgba(251, 191, 36, 0.95)");
  portGlow.addColorStop(1, "rgba(120, 53, 15, 0)");
  ctx.fillStyle = portGlow;
  ctx.beginPath();
  ctx.arc(hr * 0.5, 0, hr * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Pulse echo
  const echo = (t % 60) / 60;
  ctx.strokeStyle = `rgba(255, 220, 180, ${(0.6 * (1 - echo)).toFixed(3)})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(hr * 0.5, 0, hr * 0.35 + echo * hr * 0.6, 0, Math.PI * 2);
  ctx.stroke();
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

/** Mechanical boarding-spike arms extend radially when spines is active. */
function drawBoardingSpikes(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const lvl = world.traits.levels.spines;
  const count = Math.min(12, 6 + lvl);
  const inner = c.r * 1.05;
  const outer = c.r * 1.55;
  ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
  ctx.fillStyle = "rgba(196, 181, 253, 0.95)";
  ctx.lineWidth = 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(c.x + cosA * inner, c.y + sinA * inner);
    ctx.lineTo(c.x + cosA * outer, c.y + sinA * outer);
    ctx.stroke();
    // Small clamp jaw at the tip
    ctx.beginPath();
    ctx.arc(c.x + cosA * outer, c.y + sinA * outer, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Tractor claws flank the saucer when pincers is active. */
function drawTractorClaws(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  const facing = speed > 0.05 ? Math.atan2(c.vy, c.vx) : 0;
  const ux = Math.cos(facing);
  const uy = Math.sin(facing);
  const px = -uy;
  const py = ux;
  const baseDist = c.r * 1.15;
  const armLen = c.r * 0.65;
  for (const side of [-1, 1]) {
    const baseX = c.x + ux * baseDist + px * side * c.r * 0.45;
    const baseY = c.y + uy * baseDist + py * side * c.r * 0.45;
    // Arm
    const elbowX = baseX + ux * armLen * 0.5 + px * side * armLen * 0.25;
    const elbowY = baseY + uy * armLen * 0.5 + py * side * armLen * 0.25;
    const tipX = baseX + ux * armLen;
    const tipY = baseY + uy * armLen;
    ctx.strokeStyle = "rgba(196, 181, 253, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // Claw fingers
    ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
    ctx.lineWidth = 1.8;
    for (const fSide of [-1, 1]) {
      const fa = facing + side * 0.3 + fSide * 0.4;
      const fx = tipX + Math.cos(fa) * 6;
      const fy = tipY + Math.sin(fa) * 6;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
  }
}

/** Engine flame trail with cluster missile pods — replaces the abstract barbed tail. */
function drawEngineTrail(ctx: CanvasRenderingContext2D, world: World): void {
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

  // Flame cone — gradient from saucer back
  const tipX = c.x + ux * len;
  const tipY = c.y + uy * len;
  const grad = ctx.createLinearGradient(c.x, c.y, tipX, tipY);
  grad.addColorStop(0, "rgba(251, 191, 36, 0.85)");
  grad.addColorStop(0.5, "rgba(251, 100, 60, 0.6)");
  grad.addColorStop(1, "rgba(251, 100, 60, 0)");
  ctx.fillStyle = grad;
  const w0 = c.r * 0.45;
  const w1 = c.r * 0.12;
  ctx.beginPath();
  ctx.moveTo(c.x + px * w0, c.y + py * w0);
  ctx.lineTo(tipX + px * w1, tipY + py * w1);
  ctx.lineTo(tipX - px * w1, tipY - py * w1);
  ctx.lineTo(c.x - px * w0, c.y - py * w0);
  ctx.closePath();
  ctx.fill();

  // Missile pods at three points along the tail
  ctx.fillStyle = "rgba(220, 220, 230, 0.9)";
  ctx.strokeStyle = "rgba(40, 20, 80, 0.75)";
  ctx.lineWidth = 1;
  for (const f of [0.4, 0.7]) {
    for (const side of [-1, 1]) {
      const mx = c.x + ux * len * f + px * side * 8;
      const my = c.y + uy * len * f + py * side * 8;
      ctx.beginPath();
      ctx.ellipse(mx, my, 5, 2.4, Math.atan2(uy, ux), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  // Pulse at the tip — cluster lock-on indicator
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.3);
  ctx.fillStyle = `rgba(255, 220, 180, ${pulse.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Hex-grid force-field bubble for chloroshield. */
function drawForceField(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const t = world.tickN;
  const lvl = world.traits.levels.chloroshield;
  const radius = c.r * (1.95 + Math.min(lvl - 1, 4) * 0.1);
  const pulse = 0.55 + 0.18 * Math.sin(t * 0.06);
  // Bubble fill
  const grad = ctx.createRadialGradient(c.x, c.y, c.r * 1.05, c.x, c.y, radius);
  grad.addColorStop(0, `rgba(140, 220, 255, ${(0.18 * pulse).toFixed(3)})`);
  grad.addColorStop(0.7, `rgba(140, 220, 255, ${(0.05 * pulse).toFixed(3)})`);
  grad.addColorStop(1, "rgba(140, 220, 255, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Hex-pattern edge — six vertices around the bubble
  ctx.strokeStyle = `rgba(196, 181, 253, ${(0.55 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.01;
    const px = c.x + Math.cos(a) * radius;
    const py = c.y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // Inner ring
  ctx.strokeStyle = `rgba(196, 181, 253, ${(0.3 * pulse).toFixed(3)})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius * 0.94, 0, Math.PI * 2);
  ctx.stroke();
}

/** Energy ring crackling with arc-discharge — regen visualization. */
function drawEnergyRing(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const cap = Math.max(1, world.traits.levels.regen * 3);
  const fullness = Math.min(1, world.regenBuffer / cap);
  const t = world.tickN;
  const radius = c.r * 1.22;
  // Base ring
  ctx.strokeStyle = `rgba(196, 181, 253, ${(0.5 * fullness).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Lightning arcs — random short segments along the ring
  ctx.strokeStyle = `rgba(245, 240, 255, ${(0.85 * fullness).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  const arcs = 3;
  for (let i = 0; i < arcs; i++) {
    const start = ((i / arcs) + (t * 0.04 % 1)) * Math.PI * 2;
    const end = start + 0.4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius + Math.sin(t * 0.5 + i) * 2, start, end);
    ctx.stroke();
  }
}

/** Warp-tunnel streaks for surge — colored speedlines behind the saucer. */
function drawWarpStreaks(ctx: CanvasRenderingContext2D, world: World): void {
  const c = getCore(world);
  if (!c) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < 0.1) return;
  const ux = -c.vx / speed;
  const uy = -c.vy / speed;
  const t = world.tickN;
  const lvl = world.traits.levels.surge;
  const streaks = Math.min(7, 4 + lvl);
  const px = -uy;
  const py = ux;
  for (let i = 0; i < streaks; i++) {
    const f = (i + (t * 0.06) % 1) / streaks;
    const along = c.r * 1.4 + f * c.r * 2.4;
    const offset = Math.sin(t * 0.2 + i * 1.7) * c.r * 0.5;
    const sx = c.x + ux * along + px * offset;
    const sy = c.y + uy * along + py * offset;
    const tx = c.x + ux * (along + c.r * 0.6) + px * offset;
    const ty = c.y + uy * (along + c.r * 0.6) + py * offset;
    const alpha = (1 - f) * 0.7;
    ctx.strokeStyle = `rgba(196, 181, 253, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
}

// ── Sci-fi consumable glyphs ─────────────────────────────────────────
// Each NodeTypeId becomes a fuel canister / weapon mod / hull part.

function drawGalacticFreeCell(ctx: CanvasRenderingContext2D, body: Body, t: number): void {
  const x = body.x ?? 0;
  const y = body.y ?? 0;
  const r = body.radius;
  ctx.save();
  ctx.translate(x, y);
  // Bolder silhouettes than v1 — this drew detailed glyphs that lost
  // detail at game-scale (~6-8px world units). The brief is iconic at
  // a glance: missile / dish / shield / claw / bolt / panel / battery /
  // satellite, each with strong color contrast against the violet bg.

  switch (body.type) {
    case "propulsion": {
      // Missile / fuel rocket — pointed at origin, big flame trail.
      ctx.rotate(Math.atan2(body.vy ?? 0, body.vx ?? 0) || -Math.PI / 2);
      // Hull
      ctx.fillStyle = "#fb923c";
      ctx.strokeStyle = "rgba(40, 15, 5, 0.95)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(r * 1.1, 0);
      ctx.lineTo(-r * 0.4, r * 0.55);
      ctx.lineTo(-r * 0.4, -r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Tailfins
      ctx.fillStyle = "#7a3a14";
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.55);
      ctx.lineTo(-r * 0.85, r * 0.95);
      ctx.lineTo(-r * 0.4, r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.55);
      ctx.lineTo(-r * 0.85, -r * 0.95);
      ctx.lineTo(-r * 0.4, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      // White nose tip
      ctx.fillStyle = "rgba(255, 245, 230, 0.95)";
      ctx.beginPath();
      ctx.arc(r * 0.85, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // Flame trail
      const flame = ctx.createLinearGradient(-r * 0.4, 0, -r * 1.4, 0);
      flame.addColorStop(0, "rgba(255, 220, 100, 0.95)");
      flame.addColorStop(0.5, "rgba(255, 100, 40, 0.7)");
      flame.addColorStop(1, "rgba(255, 100, 40, 0)");
      ctx.fillStyle = flame;
      const f = 1 + Math.sin(t * 0.4 + x) * 0.15;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, r * 0.32);
      ctx.lineTo(-r * 1.4 * f, 0);
      ctx.lineTo(-r * 0.4, -r * 0.32);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "sensor": {
      // Concentric reticle / radar — bright yellow, high contrast.
      ctx.strokeStyle = "#fde047";
      ctx.fillStyle = "#fde047";
      ctx.lineWidth = 2;
      // Outer ring
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, 0);
      ctx.lineTo(-r * 0.4, 0);
      ctx.moveTo(r * 0.4, 0);
      ctx.lineTo(r * 1.1, 0);
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(0, -r * 0.4);
      ctx.moveTo(0, r * 0.4);
      ctx.lineTo(0, r * 1.1);
      ctx.stroke();
      // Solid center dot
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      // Sweep blip — rotating bright dot on the outer ring
      const sweepA = (t * 0.06) % (Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 220, 0.95)";
      ctx.beginPath();
      ctx.arc(Math.cos(sweepA) * r * 0.95, Math.sin(sweepA) * r * 0.95, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "membrane": {
      // Shield — rounded pentagon with cross emblem.
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "rgba(20, 25, 40, 0.95)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.05);
      ctx.lineTo(r * 0.95, -r * 0.45);
      ctx.lineTo(r * 0.7, r * 0.85);
      ctx.lineTo(-r * 0.7, r * 0.85);
      ctx.lineTo(-r * 0.95, -r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Inner highlight
      ctx.fillStyle = "rgba(220, 230, 245, 0.4)";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(-r * 0.5, -r * 0.3);
      ctx.lineTo(-r * 0.4, r * 0.4);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      // Cross emblem
      ctx.fillStyle = "rgba(20, 30, 50, 0.85)";
      ctx.fillRect(-r * 0.12, -r * 0.55, r * 0.24, r * 1.0);
      ctx.fillRect(-r * 0.42, -r * 0.16, r * 0.84, r * 0.32);
      break;
    }
    case "mouth": {
      // Tractor scoop — open claw silhouette, glowing core.
      ctx.fillStyle = "#fb923c";
      ctx.strokeStyle = "rgba(40, 15, 5, 0.95)";
      ctx.lineWidth = 1.6;
      // Upper jaw
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.95);
      ctx.lineTo(r * 0.65, -r * 0.55);
      ctx.lineTo(r * 0.4, -r * 0.15);
      ctx.lineTo(-r * 0.6, -r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Lower jaw
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.95);
      ctx.lineTo(r * 0.65, r * 0.55);
      ctx.lineTo(r * 0.4, r * 0.15);
      ctx.lineTo(-r * 0.6, r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Glowing core between jaws
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.3);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.35);
      glow.addColorStop(0, `rgba(255, 240, 200, ${pulse.toFixed(3)})`);
      glow.addColorStop(1, "rgba(255, 100, 40, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "stinger": {
      // Laser bolt — bright red elongated lozenge with white core.
      ctx.rotate(Math.atan2(body.vy ?? 0, body.vx ?? 0) || 0);
      // Outer red glow
      ctx.fillStyle = "rgba(220, 30, 50, 0.5)";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "rgba(80, 0, 10, 0.95)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // White-hot core line
      const flicker = 0.7 + 0.3 * Math.sin(t * 0.6);
      ctx.fillStyle = `rgba(255, 245, 220, ${flicker.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.85, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "chloroplast": {
      // Solar panel — bold square + cell grid.
      ctx.fillStyle = "#0c1a2c";
      ctx.strokeStyle = "rgba(80, 220, 160, 0.95)";
      ctx.lineWidth = 1.6;
      const side = r * 0.95;
      ctx.fillRect(-side, -side, side * 2, side * 2);
      ctx.strokeRect(-side, -side, side * 2, side * 2);
      // 2×2 panel cells
      ctx.fillStyle = "#22c55e";
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const cx = -side * 0.5 + col * side;
          const cy = -side * 0.5 + row * side;
          ctx.fillRect(cx - side * 0.4, cy - side * 0.4, side * 0.8, side * 0.8);
        }
      }
      // Cross-line dividers
      ctx.strokeStyle = "rgba(0, 30, 15, 0.95)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -side);
      ctx.lineTo(0, side);
      ctx.moveTo(-side, 0);
      ctx.lineTo(side, 0);
      ctx.stroke();
      break;
    }
    case "mitochondrion": {
      // Battery — big yellow rectangle with terminals + bolt.
      ctx.fillStyle = "#facc15";
      ctx.strokeStyle = "rgba(60, 40, 0, 0.95)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-r * 0.95, -r * 0.65, r * 1.9, r * 1.3, r * 0.18);
      ctx.fill();
      ctx.stroke();
      // Top + bottom dark bands (terminals)
      ctx.fillStyle = "rgba(30, 20, 0, 0.85)";
      ctx.fillRect(-r * 0.95, -r * 0.65, r * 1.9, r * 0.18);
      ctx.fillRect(-r * 0.95, r * 0.47, r * 1.9, r * 0.18);
      // Lightning bolt (theme-coding the energy concept)
      ctx.fillStyle = "#1c1305";
      ctx.beginPath();
      ctx.moveTo(-r * 0.18, -r * 0.35);
      ctx.lineTo(r * 0.15, -r * 0.05);
      ctx.lineTo(-r * 0.05, -r * 0.05);
      ctx.lineTo(r * 0.18, r * 0.4);
      ctx.lineTo(-r * 0.15, r * 0.05);
      ctx.lineTo(r * 0.05, r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "spore": {
      // Satellite drone — round body + cross-arms with solar wings.
      // Solar wings
      ctx.fillStyle = "#1e3a8a";
      ctx.strokeStyle = "rgba(255, 230, 240, 0.85)";
      ctx.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        ctx.fillRect(side * r * 0.45, -r * 0.4, side * r * 0.7, r * 0.8);
        ctx.strokeRect(side * r * 0.45, -r * 0.4, side * r * 0.7, r * 0.8);
      }
      // Body
      const grad = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r * 0.55);
      grad.addColorStop(0, "#fbcfe8");
      grad.addColorStop(1, "#a7297e");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(50, 10, 30, 0.95)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Camera lens
      ctx.fillStyle = "rgba(255, 240, 200, 0.95)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a0810";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "core":
    default: {
      ctx.fillStyle = "rgba(220, 220, 240, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ── Bundle ───────────────────────────────────────────────────────────

export const galacticOverrides: ThemeOverrides = {
  drawCore: drawUfoCore,
  drawSpines: drawBoardingSpikes,
  drawPincers: drawTractorClaws,
  drawBarbedTail: drawEngineTrail,
  drawChloroshield: drawForceField,
  drawRegenGlow: drawEnergyRing,
  drawSurgeWake: drawWarpStreaks,
  drawSkirmisher: drawAlienFighter,
  drawCentipede: drawAlienDreadnought,
  drawFreeCellShape: drawGalacticFreeCell,
};

export const galacticPreviewSvg = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="g-dome" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#f5f0ff" />
      <stop offset="100%" stop-color="#a78bfa" />
    </radialGradient>
  </defs>
  <ellipse cx="16" cy="20" rx="12" ry="3.5" fill="#5b21b6" />
  <ellipse cx="16" cy="19" rx="12" ry="2" fill="#a78bfa" />
  <ellipse cx="16" cy="14" rx="6" ry="5" fill="url(#g-dome)" />
  <circle cx="6" cy="20" r="0.9" fill="#fbbf24" />
  <circle cx="11" cy="20.6" r="0.9" fill="#fbbf24" />
  <circle cx="16" cy="20.8" r="0.9" fill="#fbbf24" />
  <circle cx="21" cy="20.6" r="0.9" fill="#fbbf24" />
  <circle cx="26" cy="20" r="0.9" fill="#fbbf24" />
</svg>`.trim();
