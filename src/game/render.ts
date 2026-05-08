import type { World } from "./world";
import type { Body, NodeTypeId } from "./types";
import { NODE_COLOR } from "@/data/nodeTypes";

/* ─── Background: ocean depth + light shafts ─────────────────────── */

/**
 * Vertical depth gradient + two slow-moving light shafts to read as
 * "sunlight from the surface filtering down". The eye reads vertical
 * value-difference as depth.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tickN = 0,
): void {
  const depth = ctx.createLinearGradient(0, 0, 0, height);
  depth.addColorStop(0, "#0c2440");
  depth.addColorStop(0.45, "#061a30");
  depth.addColorStop(1, "#020812");
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, width, height);

  // Two soft shafts of light, drifting slowly.
  const shaftCount = 2;
  for (let i = 0; i < shaftCount; i++) {
    const seed = i * 137.5;
    const drift = (tickN * 0.18 + seed) % (width + 200);
    const x = drift - 100;
    const w = 220;
    const grad = ctx.createLinearGradient(x, 0, x + w * 0.6, height);
    grad.addColorStop(0, "rgba(180, 220, 255, 0.06)");
    grad.addColorStop(0.6, "rgba(180, 220, 255, 0.02)");
    grad.addColorStop(1, "rgba(180, 220, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w * 0.65, height);
    ctx.lineTo(x - w * 0.35, height);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Ambient drifting plankton — small motes in viewport space (NOT world
 * space) so they decorate the camera, not the arena. Stateless: position
 * derived from index + tickN so we don't carry a particle array.
 */
export function drawAmbientPlankton(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tickN: number,
): void {
  const count = 90;
  for (let i = 0; i < count; i++) {
    const seed = i * 9301.7 + 49297;
    const sx = Math.abs(Math.sin(seed)) * width;
    const speed = 0.05 + (Math.abs(Math.cos(seed)) * 0.18);
    const sy = ((Math.abs(Math.cos(seed * 0.5)) * height + tickN * speed) %
      (height + 20)) - 10;
    const flick = 0.18 + 0.12 * Math.sin(seed * 7 + tickN * 0.04);
    const r = 0.7 + (i % 4) * 0.4;
    ctx.fillStyle = `rgba(190, 230, 255, ${flick.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ─── Env CA underlay (bioluminescent bloom) ─────────────────────── */

let caBuffer: HTMLCanvasElement | null = null;
let caBufferLastSteps = -1;

/**
 * Conway grid rendered as a soft cyan-green bloom. Each live cell
 * writes a brighter alpha; image-smoothing during drawImage blurs the
 * pixel-grid edges into glowing patches that read as plankton bloom.
 */
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
        // Soft sea-glass cyan, low alpha so it stays an underlay
        // and never competes with the creatures.
        data[k] = 96;
        data[k + 1] = 200;
        data[k + 2] = 190;
        data[k + 3] = 28;
      } else {
        data[k + 3] = 0;
      }
    }
    bctx.putImageData(img, 0, 0);
    caBufferLastSteps = ca.steps;
  }
  // Tile the CA buffer 3×3 around the arena so the torus edge never
  // shows as a hard rectangle when the player drifts to the boundary.
  const a = ca.arenaHalf;
  const span = a * 2;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  for (let tx = -1; tx <= 1; tx++) {
    for (let ty = -1; ty <= 1; ty++) {
      ctx.drawImage(caBuffer, -a + tx * span, -a + ty * span, span, span);
    }
  }
  ctx.imageSmoothingEnabled = prev;
}

/* ─── Bonds (curved tissue) ──────────────────────────────────────── */

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
    ctx.globalAlpha = 0.32 + 0.32 * bond.strength;
    ctx.lineWidth = 2.5 + bond.strength;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ─── Per-type creature shapes ───────────────────────────────────── */

const BODY_HALO = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  alpha: number,
) => {
  const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
  halo.addColorStop(0, fill);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
};

function drawPropulsion(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  const vx = b.vx ?? 0;
  const vy = b.vy ?? 0;
  const sp = Math.hypot(vx, vy) || 1;
  const dx = -vx / sp;
  const dy = -vy / sp;
  const fill = NODE_COLOR.propulsion;
  // Tail (wagging sin wave behind direction of motion)
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  // Perpendicular axis for the wag
  const px = -dy;
  const py = dx;
  for (let s = 1; s <= 10; s++) {
    const f = s / 10;
    const wag = Math.sin(t * 0.18 + f * 6) * 4 * f;
    const tx = x + dx * r * 3.4 * f + px * wag;
    const ty = y + dy * r * 3.4 * f + py * wag;
    ctx.lineTo(tx, ty);
  }
  ctx.stroke();
  // Body (round head)
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Tiny eye
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(x - dx * r * 0.4, y - dy * r * 0.4, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawSensor(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = NODE_COLOR.sensor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = "#1f0e3a";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawMembrane(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = NODE_COLOR.membrane;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  const open = 0.35 + Math.sin(t * 0.07) * 0.15;
  ctx.fillStyle = NODE_COLOR.mouth;
  ctx.beginPath();
  ctx.arc(x, y, r, open, Math.PI * 2 - open);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function drawStinger(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = NODE_COLOR.stinger;
  ctx.beginPath();
  const points = 6;
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? r : r * 0.5;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawChloroplast(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = NODE_COLOR.chloroplast;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.25, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0, 80, 60, 0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.7, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawMitochondrion(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = NODE_COLOR.mitochondrion;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 80, 0, 0.5)";
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.4, y - r * 0.45);
    ctx.lineTo(x + i * r * 0.4, y + r * 0.45);
    ctx.stroke();
  }
}

function drawSpore(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = NODE_COLOR.spore;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const px = x + Math.cos(a) * r * 0.55;
    const py = y + Math.sin(a) * r * 0.55;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

const SHAPE_DRAWERS: Record<
  NodeTypeId,
  (ctx: CanvasRenderingContext2D, b: Body, t: number) => void
> = {
  core: () => {
    /* core handled separately by drawCore */
  },
  propulsion: drawPropulsion,
  sensor: (ctx, b) => drawSensor(ctx, b),
  membrane: (ctx, b) => drawMembrane(ctx, b),
  mouth: drawMouth,
  stinger: (ctx, b) => drawStinger(ctx, b),
  chloroplast: (ctx, b) => drawChloroplast(ctx, b),
  mitochondrion: (ctx, b) => drawMitochondrion(ctx, b),
  spore: (ctx, b) => drawSpore(ctx, b),
};

function drawCell(
  ctx: CanvasRenderingContext2D,
  b: Body,
  t: number,
  hovered: boolean,
  dragging: boolean,
): void {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  const haloAlpha = b.kind === "captured" ? 0.55 : 0.32;
  BODY_HALO(ctx, x, y, r, NODE_COLOR[b.type], haloAlpha);
  SHAPE_DRAWERS[b.type](ctx, b, t);
  if (dragging) {
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#f4f4f5";
    ctx.beginPath();
    ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
    ctx.stroke();
  } else if (hovered) {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(244, 244, 245, 0.55)";
    ctx.beginPath();
    ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ─── Jellyfish core ─────────────────────────────────────────────── */

function drawCoreTrail(ctx: CanvasRenderingContext2D, world: World): void {
  const trail = world.coreTrail;
  if (trail.length < 4) return;
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const alpha = (i / trail.length) * 0.28;
    ctx.strokeStyle = `rgba(64, 220, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawCore(ctx: CanvasRenderingContext2D, world: World, core: Body): void {
  const x = core.x ?? 0;
  const y = core.y ?? 0;
  const t = world.tickN;
  const breath = 1 + Math.sin(t * 0.04) * 0.06;
  const rr = core.radius * 1.55 * breath;

  // Outer halo — kept tight so it doesn't bloom across the screen
  const halo = ctx.createRadialGradient(x, y, rr * 0.6, x, y, rr * 2.4);
  halo.addColorStop(0, "rgba(64, 220, 255, 0.28)");
  halo.addColorStop(1, "rgba(64, 220, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, rr * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // 5 tentacles (drawn before bell so the bell occludes their roots)
  ctx.lineCap = "round";
  for (let strand = -2; strand <= 2; strand++) {
    const startX = x + strand * (rr * 0.32);
    const startY = y + rr * 0.4;
    const length = rr * 4.0;
    const segments = 22;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let s = 1; s <= segments; s++) {
      const f = s / segments;
      const phase = t * 0.045 + strand * 0.55 + f * 5;
      const wave = Math.sin(phase) * 7 * f;
      ctx.lineTo(startX + wave, startY + length * f);
    }
    const grad = ctx.createLinearGradient(startX, startY, startX, startY + length);
    grad.addColorStop(0, "rgba(96, 240, 255, 0.7)");
    grad.addColorStop(1, "rgba(64, 220, 255, 0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.8 - Math.abs(strand) * 0.25;
    ctx.stroke();
  }

  // Bell (translucent dome)
  const bell = ctx.createRadialGradient(x, y - rr * 0.35, rr * 0.1, x, y, rr);
  bell.addColorStop(0, "rgba(220, 252, 255, 0.92)");
  bell.addColorStop(0.55, "rgba(64, 220, 255, 0.62)");
  bell.addColorStop(1, "rgba(8, 145, 178, 0.22)");
  ctx.fillStyle = bell;
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.strokeStyle = "rgba(220, 252, 255, 0.45)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Internal organs (3 small dots inside the bell)
  ctx.fillStyle = "rgba(34, 211, 238, 0.55)";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * rr * 0.28, y - rr * 0.05, rr * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // Top highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.beginPath();
  ctx.ellipse(x - rr * 0.25, y - rr * 0.5, rr * 0.4, rr * 0.13, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBodies(
  ctx: CanvasRenderingContext2D,
  world: World,
  hovered: string | null,
  dragging: string | null,
): void {
  drawCoreTrail(ctx, world);
  const core = world.entityBodies[0];
  for (const b of world.bodies) {
    if (b === core) continue;
    drawCell(ctx, b, world.tickN, b.id === hovered, b.id === dragging);
  }
  if (core) drawCore(ctx, world, core);
}

/* ─── Predator (anglerfish) ──────────────────────────────────────── */

export function drawPredators(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.predators.length === 0) return;
  const t = world.tickN;
  for (const p of world.predators) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    const r = p.radius * 1.25;
    const recoiling = p.recoilUntil != null && p.recoilUntil > world.tickN;
    const vx = p.vx ?? 0;
    const vy = p.vy ?? 0;
    const angle = Math.atan2(vy, vx) || 0;

    // Danger halo
    ctx.globalAlpha = recoiling ? 0.4 : 1;
    const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
    halo.addColorStop(0, "rgba(220, 38, 38, 0.42)");
    halo.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Body — dark teardrop pointing forward
    ctx.fillStyle = recoiling ? "#1c0608" : "#3a0e10";
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(254, 202, 202, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Tooth row (3 small triangles at the front edge)
    ctx.fillStyle = "rgba(255, 240, 240, 0.85)";
    for (let i = -1; i <= 1; i++) {
      const ty = i * r * 0.32;
      ctx.beginPath();
      ctx.moveTo(r * 0.55, ty);
      ctx.lineTo(r * 0.92, ty - r * 0.1);
      ctx.lineTo(r * 0.92, ty + r * 0.1);
      ctx.closePath();
      ctx.fill();
    }

    // Eye dot
    ctx.fillStyle = "rgba(255, 230, 230, 0.85)";
    ctx.beginPath();
    ctx.arc(r * 0.25, -r * 0.2, r * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Lure: thin line + glowing red dot dangling in front
    const lurePhase = t * 0.05 + (x + y) * 0.001;
    const lx = r * 1.45 + Math.sin(lurePhase) * 2.5;
    const ly = -r * 0.55 + Math.cos(lurePhase) * 2.5;
    ctx.strokeStyle = "rgba(120, 30, 30, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.quadraticCurveTo(r * 0.7, -r * 0.85, lx, ly);
    ctx.stroke();
    const lureGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.65);
    lureGlow.addColorStop(0, "rgba(255, 120, 120, 0.95)");
    lureGlow.addColorStop(1, "rgba(255, 80, 80, 0)");
    ctx.fillStyle = lureGlow;
    ctx.beginPath();
    ctx.arc(lx, ly, r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/* ─── Sparkles ───────────────────────────────────────────────────── */

export function drawSparkles(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.sparkles.length === 0) return;
  for (const s of world.sparkles) {
    const f = s.age / s.max;
    const alpha = (1 - f) * 0.85;
    const radius = 6 + f * 36;
    ctx.strokeStyle = `${s.hue} ${alpha.toFixed(3)})`;
    ctx.lineWidth = 2.2 * (1 - f) + 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ─── Telegraphs (incoming-predator warning) ──────────────────────── */

/**
 * Draw a pulsing red chevron pointing toward each pending predator
 * spawn. If the spawn is inside the viewport, render at the world
 * position; otherwise project to the nearest viewport edge. Runs in
 * screen space — call BEFORE applyCamera.
 */
export function drawTelegraphs(
  ctx: CanvasRenderingContext2D,
  world: World,
  vw: number,
  vh: number,
): void {
  if (world.telegraphs.length === 0) return;
  const cx = vw / 2;
  const cy = vh / 2;
  const padding = 28;
  for (const tg of world.telegraphs) {
    const sx = tg.x * world.camera.k + world.camera.x;
    const sy = tg.y * world.camera.k + world.camera.y;
    const inside =
      sx >= padding && sx <= vw - padding && sy >= padding && sy <= vh - padding;
    let ax: number;
    let ay: number;
    if (inside) {
      ax = sx;
      ay = sy;
    } else {
      const dx = sx - cx;
      const dy = sy - cy;
      const halfW = cx - padding;
      const halfH = cy - padding;
      const sX = halfW / Math.abs(dx || 1);
      const sY = halfH / Math.abs(dy || 1);
      const s = Math.min(sX, sY);
      ax = cx + dx * s;
      ay = cy + dy * s;
    }
    const remaining = Math.max(0, (tg.untilMs - world.wallMs) / 1500);
    const pulse = 0.55 + 0.45 * Math.sin(world.tickN * 0.3);
    const baseAlpha = (1 - remaining) * 0.35 + pulse * 0.5;
    const alpha = Math.min(0.95, baseAlpha);
    const angle = Math.atan2(sy - cy, sx - cx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    // Chevron pointing forward
    ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, 8);
    ctx.closePath();
    ctx.fill();
    // Faint trailing line for orientation
    ctx.strokeStyle = `rgba(239, 68, 68, ${(alpha * 0.5).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-26, 0);
    ctx.stroke();
    ctx.restore();
  }
}

/* ─── Camera ─────────────────────────────────────────────────────── */

export function applyCamera(
  ctx: CanvasRenderingContext2D,
  world: World,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Random shake offset (in CSS pixels). Visual only — not seeded.
  let ox = 0;
  let oy = 0;
  if (world.shakeIntensity > 0) {
    ox = (Math.random() - 0.5) * world.shakeIntensity;
    oy = (Math.random() - 0.5) * world.shakeIntensity;
  }
  ctx.translate(world.camera.x + ox, world.camera.y + oy);
  ctx.scale(world.camera.k, world.camera.k);
}
