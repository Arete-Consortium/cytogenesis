import type { World } from "./world";
import type { Body } from "./types";
import { NODE_COLOR } from "@/data/nodeTypes";

/* ─── Env CA underlay ─────────────────────────────────────────────── */

let caBuffer: HTMLCanvasElement | null = null;
let caBufferLastSteps = -1;

export function drawEnvCA(ctx: CanvasRenderingContext2D, world: World): void {
  const ca = world.envCA;
  if (!caBuffer) {
    if (typeof document === "undefined") return;
    caBuffer = document.createElement("canvas");
    caBuffer.width = ca.width;
    caBuffer.height = ca.height;
  }
  if (caBuffer.width !== ca.width || caBuffer.height !== ca.height) {
    caBuffer.width = ca.width;
    caBuffer.height = ca.height;
    caBufferLastSteps = -1;
  }
  if (caBufferLastSteps !== ca.steps) {
    const bctx = caBuffer.getContext("2d");
    if (!bctx) return;
    const img = bctx.createImageData(ca.width, ca.height);
    const data = img.data;
    for (let i = 0; i < ca.cells.length; i++) {
      const k = i * 4;
      if (ca.cells[i]) {
        data[k] = 32;
        data[k + 1] = 96;
        data[k + 2] = 138;
        data[k + 3] = 70;
      } else {
        data[k + 3] = 0;
      }
    }
    bctx.putImageData(img, 0, 0);
    caBufferLastSteps = ca.steps;
  }
  const a = ca.arenaHalf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(caBuffer, -a, -a, a * 2, a * 2);
  ctx.imageSmoothingEnabled = prev;
}

/* ─── Background ─────────────────────────────────────────────────── */

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) / 1.0);
  grad.addColorStop(0, "#0c1422");
  grad.addColorStop(1, "#06080d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/* ─── Bonds (curved) ─────────────────────────────────────────────── */

/**
 * Bonds drawn as gentle parabolic arcs — quadratic bezier with a
 * perpendicular sag at the midpoint. Reads as "tissue between
 * organelles" instead of a wireframe.
 */
export function drawBonds(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.bonds.length === 0) return;
  ctx.lineCap = "round";
  for (const bond of world.bonds) {
    const s = typeof bond.source === "string" ? null : (bond.source as Body);
    const t = typeof bond.target === "string" ? null : (bond.target as Body);
    if (!s || !t) continue;
    const sx = s.x ?? 0;
    const sy = s.y ?? 0;
    const tx = t.x ?? 0;
    const ty = t.y ?? 0;

    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const sag = Math.min(len * 0.12, 18);
    const mx = (sx + tx) / 2 + (-dy / len) * sag;
    const my = (sy + ty) / 2 + (dx / len) * sag;

    const grad = ctx.createLinearGradient(sx, sy, tx, ty);
    grad.addColorStop(0, NODE_COLOR[s.type]);
    grad.addColorStop(1, NODE_COLOR[t.type]);
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.35 + 0.35 * bond.strength;
    ctx.lineWidth = 2.5 + bond.strength;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ─── Bodies ─────────────────────────────────────────────────────── */

/**
 * Soft glow + core circle. Used for free cells and non-core captured
 * organelles. The core itself goes through drawCore for the jellyfish
 * treatment.
 */
function drawBodyGlow(
  ctx: CanvasRenderingContext2D,
  b: Body,
  hovered: boolean,
  dragging: boolean,
): void {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  const fill = NODE_COLOR[b.type];

  // Halo
  ctx.globalAlpha = b.kind === "captured" ? 0.55 : 0.35;
  const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.4);
  halo.addColorStop(0, fill);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  if (dragging) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#f4f4f5";
    ctx.stroke();
  } else if (hovered) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(244, 244, 245, 0.6)";
    ctx.stroke();
  } else {
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();
  }
}

/**
 * Jellyfish bell + tentacles for the core. Visual radius is 1.4× the
 * physics radius — the bell looks bigger than its hitbox, which sells
 * the "soft tissue" reading. Tentacles trail in world +y so they hang
 * naturally regardless of motion direction.
 */
function drawCore(ctx: CanvasRenderingContext2D, world: World, core: Body): void {
  const x = core.x ?? 0;
  const y = core.y ?? 0;
  const t = world.tickN;
  const breath = 1 + Math.sin(t * 0.04) * 0.06;
  const rr = core.radius * 1.4 * breath;

  // Outermost glow
  const halo = ctx.createRadialGradient(x, y, rr * 0.6, x, y, rr * 3.2);
  halo.addColorStop(0, "rgba(34, 211, 238, 0.42)");
  halo.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, rr * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Bell body — top-down gradient gives the dome a sense of depth
  const bell = ctx.createRadialGradient(x, y - rr * 0.35, rr * 0.1, x, y, rr);
  bell.addColorStop(0, "rgba(220, 252, 255, 0.95)");
  bell.addColorStop(0.55, "rgba(34, 211, 238, 0.75)");
  bell.addColorStop(1, "rgba(8, 145, 178, 0.35)");
  ctx.fillStyle = bell;
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.fill();

  // Faint white rim
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(220, 252, 255, 0.5)";
  ctx.stroke();

  // Tentacles — three sinusoidal strands hanging in world +y
  ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let strand = -1; strand <= 1; strand++) {
    ctx.beginPath();
    const startX = x + strand * (rr * 0.45);
    const startY = y + rr * 0.55;
    ctx.moveTo(startX, startY);
    const length = rr * 2.3;
    const segments = 14;
    for (let s = 1; s <= segments; s++) {
      const f = s / segments;
      const phase = t * 0.05 + strand * 0.7 + f * 4;
      const wave = Math.sin(phase) * 5 * f;
      ctx.lineTo(startX + wave, startY + length * f);
    }
    ctx.stroke();
  }
}

/**
 * Wake — a fading line strung through the core's recent positions.
 * Adds motion read + reinforces the jellyfish-trailing-organism feel.
 */
function drawCoreTrail(ctx: CanvasRenderingContext2D, world: World): void {
  const trail = world.coreTrail;
  if (trail.length < 4) return;
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const alpha = (i / trail.length) * 0.35;
    ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/**
 * Render every body. Caller has applied the camera transform; coords
 * here are world-space.
 */
export function drawBodies(
  ctx: CanvasRenderingContext2D,
  world: World,
  hovered: string | null,
  dragging: string | null,
): void {
  drawCoreTrail(ctx, world);
  // Free + organelle bodies first (under the bell) — except the core,
  // which gets drawn last so its bell sits on top of everything.
  const core = world.entityBodies[0];
  for (const b of world.bodies) {
    if (b === core) continue;
    drawBodyGlow(ctx, b, b.id === hovered, b.id === dragging);
  }
  if (core) drawCore(ctx, world, core);
}

/* ─── Predators ──────────────────────────────────────────────────── */

/**
 * Spiked star, slowly rotating, with red danger halo. Recoiling
 * predators dim noticeably so the player gets a clear "you have a
 * moment" beat after a hit.
 */
export function drawPredators(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.predators.length === 0) return;
  const t = world.tickN;
  for (const p of world.predators) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    const r = p.radius;
    const recoiling = p.recoilUntil != null && p.recoilUntil > world.tickN;
    const spin = t * 0.018 + (x + y) * 0.001;

    // Halo
    ctx.globalAlpha = recoiling ? 0.35 : 1;
    const halo = ctx.createRadialGradient(x, y, r, x, y, r * 2.6);
    halo.addColorStop(0, "rgba(239, 68, 68, 0.5)");
    halo.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Spiked star (8 points)
    ctx.beginPath();
    const points = 8;
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 + spin;
      const radius = i % 2 === 0 ? r : r * 0.55;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = recoiling ? "#7f1d1d" : "#dc2626";
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(254, 202, 202, 0.6)";
    ctx.stroke();

    ctx.globalAlpha = 1;
  }
}

/* ─── Sparkles (capture flashes + hit shocks) ────────────────────── */

export function drawSparkles(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.sparkles.length === 0) return;
  for (const s of world.sparkles) {
    const f = s.age / s.max; // 0..1
    const alpha = (1 - f) * 0.8;
    const radius = 6 + f * 36;
    ctx.strokeStyle = `${s.hue} ${alpha})`;
    ctx.lineWidth = 2 * (1 - f) + 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ─── Camera ─────────────────────────────────────────────────────── */

/**
 * Apply the world's camera transform. The caller must save() before
 * and restore() after.
 */
export function applyCamera(
  ctx: CanvasRenderingContext2D,
  world: World,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(world.camera.x, world.camera.y);
  ctx.scale(world.camera.k, world.camera.k);
}
