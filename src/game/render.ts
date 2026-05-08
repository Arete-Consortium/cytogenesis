import type { World } from "./world";
import type { Body, NodeTypeId } from "./types";
import { STAGE_THRESHOLDS } from "./world";
import { currentTheme } from "@/data/themes";

/* ─── Background: ocean depth + light shafts ─────────────────────── */

/**
 * Vertical depth gradient + two slow-moving light shafts to read as
 * "sunlight from the surface filtering down". The eye reads vertical
 * value-difference as depth.
 */
/** Darken a #rrggbb hex by `factor` (0..1, where 1 = unchanged). */
function darkenHex(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  _tickN = 0,
  biomeStage = 0,
): void {
  const T = currentTheme();
  // Base flat fill tonally matched to the CA bloom.
  const dark = 1 - Math.min(biomeStage, 3) * 0.15;
  ctx.fillStyle = darkenHex(T.bgFlat, dark);
  ctx.fillRect(0, 0, width, height);

  // Subtle radial vignette — center reads slightly brighter, corners
  // sink toward black for depth + focus on the bell.
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(width, height) * 0.85;
  const vg = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
  vg.addColorStop(0, "rgba(0, 0, 0, 0)");
  vg.addColorStop(0.65, "rgba(0, 0, 0, 0.18)");
  vg.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);
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
  const T = currentTheme();
  const count = 90;
  for (let i = 0; i < count; i++) {
    const seed = i * 9301.7 + 49297;
    const sx = Math.abs(Math.sin(seed)) * width;
    const speed = 0.05 + (Math.abs(Math.cos(seed)) * 0.18);
    const sy = ((Math.abs(Math.cos(seed * 0.5)) * height + tickN * speed) %
      (height + 20)) - 10;
    const flick = 0.18 + 0.12 * Math.sin(seed * 7 + tickN * 0.04);
    const r = 0.7 + (i % 4) * 0.4;
    ctx.fillStyle = `${T.ambient} ${flick.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ─── Env CA underlay (bioluminescent bloom) ─────────────────────── */

let caBuffer: HTMLCanvasElement | null = null;
let caBufferLastSteps = -1;
let caBufferLastTheme: string | null = null;

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
  // Theme color shift invalidates the buffer too — track last theme id.
  const T = currentTheme();
  if (caBufferLastSteps !== ca.steps || caBufferLastTheme !== T.id) {
    const bctx = caBuffer.getContext("2d");
    if (!bctx) return;
    const img = bctx.createImageData(ca.width, ca.height);
    const data = img.data;
    for (let i = 0; i < ca.cells.length; i++) {
      const k = i * 4;
      if (ca.cells[i]) {
        data[k] = T.ca.r;
        data[k + 1] = T.ca.g;
        data[k + 2] = T.ca.b;
        data[k + 3] = T.ca.a;
      } else {
        // Visible baseline tint for dead cells so the underlay never
        // leaves hard rectangular dark "voids" — the entire arena
        // always reads as ocean, even where the CA has settled.
        data[k] = T.ca.r;
        data[k + 1] = T.ca.g;
        data[k + 2] = T.ca.b;
        data[k + 3] = 20;
      }
    }
    bctx.putImageData(img, 0, 0);
    caBufferLastSteps = ca.steps;
    caBufferLastTheme = T.id;
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
  const NC = currentTheme().nodeColors;
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
    grad.addColorStop(0, NC[s.type]);
    grad.addColorStop(1, NC[t.type]);
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

/**
 * Spherical highlight stamp — top-left bright spot + soft rim, applied
 * after the type-specific fill so each cell reads as a 3D blob rather
 * than a flat sticker. Cheap: one radial gradient + one stroke.
 */
const SPHERE_LIGHT = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) => {
  const hx = x - r * 0.35;
  const hy = y - r * 0.35;
  const g = ctx.createRadialGradient(hx, hy, r * 0.05, hx, hy, r * 0.95);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.10)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Faint dark rim
  ctx.strokeStyle = "rgba(0,0,0,0.30)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();
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
  const fill = currentTheme().nodeColors.propulsion;
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
  SPHERE_LIGHT(ctx, x, y, r);
  // Tiny eye
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(x - dx * r * 0.4, y - dy * r * 0.4, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawSensor(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = currentTheme().nodeColors.sensor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Iris ring
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  // Pupil — animates focus a touch
  const focus = 0.5 + Math.sin(t * 0.04 + (b.id.charCodeAt(0) % 7)) * 0.07;
  ctx.fillStyle = "#0e0626";
  ctx.beginPath();
  ctx.arc(x, y, r * focus, 0, Math.PI * 2);
  ctx.fill();
  // Catchlight
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.22, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawMembrane(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = currentTheme().nodeColors.membrane;
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
  // Chitin double-stroke — light edge + dark inner shadow
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const px = x + Math.cos(a) * r * 0.7;
    const py = y + Math.sin(a) * r * 0.7;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  const open = 0.35 + Math.sin(t * 0.07) * 0.15;
  // Cavity (dark interior)
  ctx.fillStyle = "rgba(20,5,5,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  // Body — pac-man wedge
  ctx.fillStyle = currentTheme().nodeColors.mouth;
  ctx.beginPath();
  ctx.arc(x, y, r, open, Math.PI * 2 - open);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  SPHERE_LIGHT(ctx, x, y, r);
  // Pointed teeth along the gape edge
  ctx.fillStyle = "rgba(255,250,235,0.95)";
  const teeth = 4;
  for (let i = 0; i < teeth; i++) {
    const f = (i + 0.5) / teeth;
    // Top jaw
    const ta = -open + f * (Math.PI - open * 2) * -1;
    const ax = x + Math.cos(ta) * r * 0.92;
    const ay = y + Math.sin(ta) * r * 0.92;
    const bx = x + Math.cos(ta) * r * 0.55;
    const by = y + Math.sin(ta) * r * 0.55;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx + r * 0.08, by);
    ctx.lineTo(bx - r * 0.08, by);
    ctx.closePath();
    ctx.fill();
    // Bottom jaw (mirror)
    const tb = open + f * (Math.PI - open * 2);
    const cx = x + Math.cos(tb) * r * 0.92;
    const cy = y + Math.sin(tb) * r * 0.92;
    const dx = x + Math.cos(tb) * r * 0.55;
    const dy = y + Math.sin(tb) * r * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(dx + r * 0.08, dy);
    ctx.lineTo(dx - r * 0.08, dy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawStinger(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  // Subtle pulsing aura — venom glow.
  const pulse = 0.45 + Math.sin(t * 0.08 + (b.id.charCodeAt(0) % 5)) * 0.12;
  const aura = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.7);
  aura.addColorStop(0, `rgba(255, 180, 90, ${pulse.toFixed(2)})`);
  aura.addColorStop(1, "rgba(255, 180, 90, 0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  // Star body
  ctx.fillStyle = currentTheme().nodeColors.stinger;
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
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Bright tips
  ctx.fillStyle = "rgba(255,255,200,0.9)";
  for (let i = 0; i < points; i++) {
    const a = ((i * 2) / (points * 2)) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawChloroplast(ctx: CanvasRenderingContext2D, b: Body) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = currentTheme().nodeColors.chloroplast;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.25, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Grana stack — three dark green dots inside
  ctx.fillStyle = "rgba(0, 70, 50, 0.55)";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(x + i * r * 0.45, y, r * 0.18, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Top highlight crescent
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.25, r * 0.95, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.25, r * 0.7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMitochondrion(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  ctx.fillStyle = currentTheme().nodeColors.mitochondrion;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cristae — undulating internal folds
  ctx.strokeStyle = "rgba(140, 70, 0, 0.7)";
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    const off = Math.sin(t * 0.06 + i) * 0.08;
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.32, y - r * 0.5);
    ctx.quadraticCurveTo(
      x + i * r * 0.32 + r * off,
      y,
      x + i * r * 0.32,
      y + r * 0.5,
    );
    ctx.stroke();
  }
  // Top highlight
  ctx.fillStyle = "rgba(255,220,160,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.22, r * 1.0, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(80, 35, 0, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSpore(ctx: CanvasRenderingContext2D, b: Body, t: number) {
  const x = b.x ?? 0;
  const y = b.y ?? 0;
  const r = b.radius;
  // Outer ring of pods, each with a faint highlight + dark rim
  const fill = currentTheme().nodeColors.spore;
  const phase = (b.id.charCodeAt(0) % 7) * 0.7;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.sin(t * 0.03 + phase) * 0.05;
    const px = x + Math.cos(a) * r * 0.55;
    const py = y + Math.sin(a) * r * 0.55;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(px - r * 0.08, py - r * 0.08, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Center pod
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(x - r * 0.08, y - r * 0.08, r * 0.12, 0, Math.PI * 2);
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
  sensor: drawSensor,
  membrane: (ctx, b) => drawMembrane(ctx, b),
  mouth: drawMouth,
  stinger: drawStinger,
  chloroplast: (ctx, b) => drawChloroplast(ctx, b),
  mitochondrion: drawMitochondrion,
  spore: drawSpore,
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
  BODY_HALO(ctx, x, y, r, currentTheme().nodeColors[b.type], haloAlpha);
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
  const T = currentTheme();
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const alpha = (i / trail.length) * 0.28;
    ctx.strokeStyle = `${T.bell.trail} ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/**
 * Cached rotation angle so the bell turns smoothly instead of snapping
 * each time the velocity vector flips direction. Module-level since
 * there's only ever one core.
 */
let cachedBellAngle = 0;

/**
 * Per-NodeTypeId counts driving bell composition. Reads directly from
 * world.absorbed under the absorb-counter model (no graph organelles).
 */
function entityComposition(world: World): Record<string, number> {
  return world.absorbed as unknown as Record<string, number>;
}

/** Parse rgba(r, g, b[, a]) → [r, g, b, a]. */
function parseRgba(s: string): [number, number, number, number] | null {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Lerp an rgba string toward a hex by `t` (0..1) without changing
 * its alpha. Used to tint the bell mid-gradient toward the dominant
 * captured type's color.
 */
function blendRgbaTowardHex(base: string, hex: string, t: number): string {
  const a = parseRgba(base);
  if (!a) return base;
  const [hr, hg, hb] = parseHex(hex);
  const r = Math.round(a[0] + (hr - a[0]) * t);
  const g = Math.round(a[1] + (hg - a[1]) * t);
  const b = Math.round(a[2] + (hb - a[2]) * t);
  return `rgba(${r}, ${g}, ${b}, ${a[3]})`;
}

/** Shortest angular distance between two angles (radians). */
function angDist(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/**
 * Build the bell's deformable perimeter as N (x, y) points in local
 * space. Radius at each angle is perturbed by composition so the bell
 * literally takes on the aspects of what it ate:
 *   - stinger → spike bulges (upper hemisphere)
 *   - mouth   → lobes        (lower hemisphere)
 *   - membrane → faceted segmentation
 *   - chloroplast → smooth swelling
 *   - always-on sinusoidal wobble for "alive" feel
 */
function bellPerimeter(
  rr: number,
  comp: Record<string, number>,
  t: number,
): [number, number][] {
  const N = 48;
  const stingers = comp.stinger ?? 0;
  const mouths = comp.mouth ?? 0;
  const membranes = comp.membrane ?? 0;
  const chloros = comp.chloroplast ?? 0;
  const sporeCount = comp.spore ?? 0;
  // Pre-compute spike + lobe angles so we don't recompute per-vertex.
  const stingerAngles: number[] = [];
  for (let s = 0; s < stingers; s++) {
    stingerAngles.push(-Math.PI + ((s + 0.5) / stingers) * Math.PI);
  }
  const mouthAngles: number[] = [];
  for (let m = 0; m < mouths; m++) {
    mouthAngles.push(((m + 0.5) / mouths) * Math.PI);
  }
  const points: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI; // -π..+π
    let r = rr;
    // Organic sin wobble (animated over time + biased per spore)
    r += Math.sin(angle * 5 + t * 0.05) * rr * 0.035;
    if (sporeCount > 0) {
      r += Math.sin(angle * (3 + sporeCount) + t * 0.03) * rr * 0.04;
    }
    // Faceted segmentation from membranes
    if (membranes > 0) {
      r += Math.sin(angle * (3 + membranes)) * rr * 0.05;
    }
    // Smooth swelling from chloroplasts
    if (chloros > 0) {
      r += Math.cos(angle * 2 + t * 0.02) * rr * 0.025 * Math.min(chloros, 4);
    }
    // Stinger spike bulges
    for (const sa of stingerAngles) {
      const d = angDist(angle, sa);
      if (d < 0.45) {
        const f = 1 - d / 0.45;
        r += rr * 0.22 * f * f;
      }
    }
    // Mouth lobes
    for (const ma of mouthAngles) {
      const d = angDist(angle, ma);
      if (d < 0.55) {
        const f = 1 - d / 0.55;
        r += rr * 0.18 * f * f;
      }
    }
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return points;
}

/** Trace a smooth closed curve through perimeter points. */
function tracePerimeter(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
): void {
  const n = points.length;
  // Quadratic-bezier midpoint smoothing.
  const last = points[n - 1];
  const first = points[0];
  ctx.beginPath();
  ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  for (let i = 0; i < n; i++) {
    const cp = points[i];
    const ep = points[(i + 1) % n];
    const mx = (cp[0] + ep[0]) / 2;
    const my = (cp[1] + ep[1]) / 2;
    ctx.quadraticCurveTo(cp[0], cp[1], mx, my);
  }
  ctx.closePath();
}

function drawCore(ctx: CanvasRenderingContext2D, world: World, core: Body): void {
  const x = core.x ?? 0;
  const y = core.y ?? 0;
  const t = world.tickN;
  const breath = 1 + Math.sin(t * 0.04) * 0.06;
  const rr = core.radius * 1.55 * breath;
  const comp = entityComposition(world);
  const tentacleCount = Math.min(9, 5 + (comp.propulsion ?? 0));
  const organCount = Math.min(7, 3 + (comp.sensor ?? 0));
  const spikeCount = Math.min(8, comp.stinger ?? 0);
  const perimeter = bellPerimeter(rr, comp, t);

  // Bell rotation — point tentacles opposite the velocity. Smoothly
  // lerp toward the target angle (15%/frame ≈ 150ms time-constant)
  // so quick course corrections don't snap the bell.
  const vx = core.vx ?? 0;
  const vy = core.vy ?? 0;
  const sp = Math.hypot(vx, vy);
  if (sp > 0.4) {
    const target = Math.atan2(vx, -vy);
    let delta = target - cachedBellAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    cachedBellAngle += delta * 0.15;
  }

  const T = currentTheme();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(cachedBellAngle);

  // Outer halo — combo buff swaps to gold/amber per theme.
  const comboActive = world.wallMs < world.comboActiveUntilMs;
  const halo = ctx.createRadialGradient(0, 0, rr * 0.6, 0, 0, rr * 2.4);
  halo.addColorStop(0, comboActive ? T.combo.halo0 : T.bell.halo0);
  halo.addColorStop(1, comboActive ? T.combo.halo1 : T.bell.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, rr * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Tentacles — count grows with propulsion. Centered around 0.
  // Wave amplitude scales with core speed: stationary = gentle ripple,
  // top speed = whipping motion. (sp from the bell-rotation block above
  // would do, but we recompute as `coreSpeed` to keep the intent local.)
  const coreSpeed = Math.hypot(core.vx ?? 0, core.vy ?? 0);
  const speedFactor = 0.5 + Math.min(coreSpeed / 6, 1.2);
  ctx.lineCap = "round";
  const halfTent = (tentacleCount - 1) / 2;
  for (let i = 0; i < tentacleCount; i++) {
    const strand = i - halfTent;
    const startX = strand * (rr * 0.32);
    const startY = rr * 0.4;
    const length = rr * 4.0;
    const segments = 22;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let s = 1; s <= segments; s++) {
      const f = s / segments;
      const phase = t * 0.045 + strand * 0.55 + f * 5;
      const wave = Math.sin(phase) * 7 * f * speedFactor;
      ctx.lineTo(startX + wave, startY + length * f);
    }
    const grad = ctx.createLinearGradient(startX, startY, startX, startY + length);
    grad.addColorStop(0, T.bell.tentacle0);
    grad.addColorStop(1, T.bell.tentacle1);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.8 - Math.min(Math.abs(strand) * 0.18, 1.2);
    ctx.stroke();
  }

  // Bell mid-stop tints toward the dominant captured type so the
  // creature literally takes on the color of what it eats. Cap at
  // 50% blend so the bell doesn't lose its base identity.
  const totalCaptured = world.totalAbsorbed;
  let bellMidColor = T.bell.bellMid;
  if (totalCaptured > 0) {
    let dominantType = "";
    let dominantCount = 0;
    for (const [k, v] of Object.entries(comp)) {
      if (v > dominantCount) {
        dominantCount = v;
        dominantType = k;
      }
    }
    if (dominantType && dominantCount > 0) {
      const share = dominantCount / totalCaptured;
      const blendT = Math.min(0.5, share);
      const dominantHex = currentTheme().nodeColors[dominantType as NodeTypeId];
      if (dominantHex) {
        bellMidColor = blendRgbaTowardHex(T.bell.bellMid, dominantHex, blendT);
      }
    }
  }
  const bell = ctx.createRadialGradient(0, -rr * 0.35, rr * 0.1, 0, 0, rr);
  bell.addColorStop(0, T.bell.bellInner);
  bell.addColorStop(0.55, bellMidColor);
  bell.addColorStop(1, T.bell.bellOuter);
  ctx.fillStyle = bell;
  tracePerimeter(ctx, perimeter);
  ctx.fill();

  ctx.strokeStyle = T.bell.rim;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Stinger spike-tips — small colored triangles at the crest of each
  // morphed bulge, so the shape AND color cue the captured stingers.
  if (spikeCount > 0) {
    const stingerColor = currentTheme().nodeColors.stinger;
    ctx.fillStyle = stingerColor;
    const bulgeR = rr * 1.22;
    for (let i = 0; i < spikeCount; i++) {
      const angle = -Math.PI + ((i + 0.5) / spikeCount) * Math.PI;
      const baseX = Math.cos(angle) * bulgeR;
      const baseY = Math.sin(angle) * bulgeR;
      const tipX = Math.cos(angle) * bulgeR * 1.16;
      const tipY = Math.sin(angle) * bulgeR * 1.16;
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);
      const w = rr * 0.09;
      ctx.beginPath();
      ctx.moveTo(baseX + perpX * w, baseY + perpY * w);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(baseX - perpX * w, baseY - perpY * w);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Internal organs — count grows with sensor. Arranged in an arc near
  // the top-interior of the bell.
  ctx.fillStyle = T.bell.organ;
  if (organCount === 1) {
    ctx.beginPath();
    ctx.arc(0, -rr * 0.05, rr * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const arc = Math.PI * 0.78;
    for (let i = 0; i < organCount; i++) {
      const a = -Math.PI / 2 + (i / (organCount - 1) - 0.5) * arc;
      const ox = Math.cos(a) * rr * 0.42;
      const oy = Math.sin(a) * rr * 0.42 + rr * 0.05;
      ctx.beginPath();
      ctx.arc(ox, oy, rr * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Top highlight
  ctx.fillStyle = T.bell.highlight;
  ctx.beginPath();
  ctx.ellipse(-rr * 0.25, -rr * 0.5, rr * 0.4, rr * 0.13, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // ── Stage-driven wild visuals ─────────────────────────────────────
  const stage = world.evolutionStage;

  // Stage 3+: full-perimeter spikes (sea-urchin look)
  if (stage >= 3) {
    const N = 16;
    const fillC = currentTheme().nodeColors.stinger;
    ctx.fillStyle = fillC;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const baseR = rr * 1.18;
      const tipR = rr * (1.4 + 0.05 * Math.sin(t * 0.06 + i));
      const px = -Math.sin(a);
      const py = Math.cos(a);
      const w = rr * 0.07;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * baseR + px * w, Math.sin(a) * baseR + py * w);
      ctx.lineTo(Math.cos(a) * tipR, Math.sin(a) * tipR);
      ctx.lineTo(Math.cos(a) * baseR - px * w, Math.sin(a) * baseR - py * w);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Stage 4+: nested inner sub-bell that pulses on a different beat
  if (stage >= 4) {
    const innerR = rr * (0.45 + 0.05 * Math.sin(t * 0.07));
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
    innerGrad.addColorStop(0, T.bell.bellInner);
    innerGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Stage 1+: outer halo ring (drawn outside rotation in world space)
  if (stage >= 1) {
    const ringR = rr * 1.55 + 4 * Math.sin(t * 0.05);
    ctx.strokeStyle = T.bell.halo0;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Stage 2+: secondary halos at offset positions (chaotic field)
  if (stage >= 2) {
    for (let i = 0; i < 3; i++) {
      const phase = t * 0.03 + i * 2.1;
      const ox = Math.cos(phase) * rr * 1.2;
      const oy = Math.sin(phase) * rr * 1.2;
      const subR = rr * 0.3;
      const halo = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, subR);
      halo.addColorStop(0, T.bell.halo0);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, subR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Stage 5: transcend corona — radial light beams
  if (stage >= 5) {
    const beams = 12;
    for (let i = 0; i < beams; i++) {
      const a = (i / beams) * Math.PI * 2 + t * 0.01;
      const len = rr * (3.5 + 0.5 * Math.sin(t * 0.04 + i));
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      const grad = ctx.createLinearGradient(x, y, x2, y2);
      grad.addColorStop(0, T.bell.bellInner);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // Spore swarmlings — small dots orbiting the bell at radius rr*1.55,
  // count = absorbed spores. Drawn outside the rotation transform so
  // they orbit in world space, not bell-local.
  const spores = comp.spore ?? 0;
  if (spores > 0) {
    const sporeColor = currentTheme().nodeColors.spore;
    const orbitR = rr * 1.55;
    for (let i = 0; i < spores; i++) {
      const a = (i / spores) * Math.PI * 2 + t * 0.012;
      const sx = x + Math.cos(a) * orbitR;
      const sy = y + Math.sin(a) * orbitR;
      // Tiny halo
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 7);
      halo.addColorStop(0, sporeColor);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Body
      ctx.fillStyle = sporeColor;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
  drawPlacedParts(ctx, world);
  drawEditorOverlay(ctx, world);
}

/**
 * Draw placed parts attached around the bell perimeter. Each part
 * renders the existing per-type glyph at a smaller radius, anchored
 * at world.placedParts[i].angle relative to the core. Parts placed
 * within the last 30 ticks scale up from 0 → 1 for a "pop in" feel.
 */
function drawPlacedParts(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.placedParts.length === 0) return;
  const core = world.entityBodies[0];
  if (!core) return;
  const cx = core.x ?? 0;
  const cy = core.y ?? 0;
  const cr = core.radius;
  for (const part of world.placedParts) {
    const age = world.tickN - part.placedAtTickN;
    const popIn = age < 30 ? Math.min(1, age / 30) : 1;
    // Eased ease-out
    const e = 1 - (1 - popIn) * (1 - popIn);
    const partR = (cr * 0.42) * e;
    const radial = cr * 1.05;
    const px = cx + Math.cos(part.angle) * radial;
    const py = cy + Math.sin(part.angle) * radial;
    // Subtle attachment ligament — a short chitin line from bell edge
    // to the part body so it reads as ANCHORED, not floating.
    ctx.strokeStyle = "rgba(255,240,210,0.45)";
    ctx.lineWidth = Math.max(1, partR * 0.18);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(part.angle) * cr * 0.92, cy + Math.sin(part.angle) * cr * 0.92);
    ctx.lineTo(px, py);
    ctx.stroke();
    // Synthetic body for the per-type drawer.
    const synthetic: Body = {
      id: part.id,
      type: part.kind,
      kind: "captured",
      radius: partR,
      x: px,
      y: py,
      vx: Math.cos(part.angle) * 2,
      vy: Math.sin(part.angle) * 2,
    };
    BODY_HALO(ctx, px, py, partR, currentTheme().nodeColors[part.kind], 0.5);
    SHAPE_DRAWERS[part.kind](ctx, synthetic, world.tickN);
  }
}

/**
 * In-world editor overlay — pulsing placement ring around the bell
 * while the player has a part selected and is choosing where to attach.
 * The 3-card UI lives in React (BodyEditor.tsx); this is just the
 * spatial cue inside the canvas.
 */
function drawEditorOverlay(ctx: CanvasRenderingContext2D, world: World): void {
  if (!world.editor.open) return;
  const core = world.entityBodies[0];
  if (!core) return;
  const cx = core.x ?? 0;
  const cy = core.y ?? 0;
  const cr = core.radius;
  const t = world.tickN;
  // Soft cyan dashed ring around the bell — tells the player the
  // editor is open and points at where their part will attach.
  const pulse = 0.5 + 0.3 * Math.sin(t * 0.12);
  ctx.strokeStyle = `rgba(120, 220, 255, ${pulse.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -t * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, cr * 1.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ─── Predator (anglerfish) ──────────────────────────────────────── */

export function drawPredators(ctx: CanvasRenderingContext2D, world: World): void {
  // Centipede gets a unified render (head + chain) so the segments
  // connect smoothly. All other predators (legacy) still draw
  // individually if any are around.
  if (world.centipede) drawCentipede(ctx, world);
  if (world.predators.length === 0) return;
  const t = world.tickN;
  for (const p of world.predators) {
    if (p.bossKind === "centipede") continue; // already drawn above
    if (p.bossKind === "swarmLord") drawSwarmLord(ctx, p, t);
    else if (p.bossKind === "tideMaw") drawTideMaw(ctx, p, t);
    else if (p.bossKind === "abyssEye") drawAbyssEye(ctx, p, t);
    else if (p.variant === "brute") drawBrutePredator(ctx, p, t);
    else drawSkirmisherPredator(ctx, p, t);
  }
}

/**
 * Centipede — *Scutigera coleoptrata* (house centipede). Long flat
 * tan ribbon body with three dark longitudinal stripes, very long
 * banded legs that fan outward from each body joint and grow longer
 * toward the rear, banded antennae at the head and banded cerci at
 * the tail. Body is drawn as a single continuous tapered shape, not
 * a chain of visible segment balls.
 */
const CENTIPEDE_PALETTE = {
  bodyPale: "#d8c896",     // pale tan body
  bodyMid: "#a8946a",      // mid tone underside
  bodyShade: "#766239",    // shaded edge
  stripeDark: "#2a1f10",   // longitudinal dark brown stripes
  legBandPale: "#e8dcb6",  // light leg band
  legBandDark: "#2a1f10",  // dark leg band
  legShade: "#9a8050",     // leg shaded/proximal
  antennaPale: "#cebd8c",
  antennaDark: "#2a1f10",
  cerciPale: "#cebd8c",
  cerciDark: "#2a1f10",
  mandible: "#5a3a18",
  mandibleTip: "#1f120a",
  eyeRim: "#0a0604",
  eyeShine: "#1a1208",     // small black bead eyes (not glowing)
  haloFill: "rgba(180, 150, 90, 0.20)",
  haloFade: "rgba(180, 150, 90, 0)",
};

function drawCentipede(ctx: CanvasRenderingContext2D, world: World): void {
  const c = world.centipede;
  if (!c) return;
  const P = CENTIPEDE_PALETTE;
  const head = c.head;
  const segs = c.segments;
  const t = world.tickN;
  const allBodies = [head, ...segs];
  const hr = head.radius;
  // Body half-thickness — much slimmer than original to read as a ribbon.
  const bodyHalfWidth = hr * 0.48;

  // Combat phase derived from world state — drives visual treatment.
  const phase = c.attackPhase;
  // Linear progress 0..1 within the current phase, for animations.
  const phaseDur =
    phase === "windup"
      ? 520
      : phase === "lunge"
      ? 280
      : phase === "recover"
      ? 700
      : 1;
  const phaseProgress =
    phase === "idle"
      ? 0
      : Math.max(0, Math.min(1, 1 - (c.attackPhaseUntilMs - world.wallMs) / phaseDur));
  const isEnraged = c.enragedFlashed;

  // ── Soft warm halo under the whole creature ─────────────────────
  // Enraged: halo shifts red/hot.
  const haloFill = isEnraged ? "rgba(220, 60, 40, 0.35)" : P.haloFill;
  const haloFade = isEnraged ? "rgba(220, 60, 40, 0)" : P.haloFade;
  for (const b of allBodies) {
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const halo = ctx.createRadialGradient(x, y, b.radius * 0.4, x, y, b.radius * 2.0);
    halo.addColorStop(0, haloFill);
    halo.addColorStop(1, haloFade);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, b.radius * 2.0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Windup telegraph — red dashed beam pointing at the player ───
  // The beam grows brighter and longer as the windup progresses so
  // the player can read the timing.
  if (phase === "windup") {
    const core = world.entityBodies[0];
    const px = core?.x ?? 0;
    const py = core?.y ?? 0;
    const hx = head.x ?? 0;
    const hy = head.y ?? 0;
    const aimDx = px - hx;
    const aimDy = py - hy;
    const aimLen = Math.hypot(aimDx, aimDy) || 1;
    const ux = aimDx / aimLen;
    const uy = aimDy / aimLen;
    // Beam grows from 30% → 110% of player distance through the windup.
    const beamLen = aimLen * (0.3 + phaseProgress * 0.8);
    const alpha = 0.35 + phaseProgress * 0.55;
    ctx.save();
    ctx.lineCap = "round";
    // Thick outer halo line
    ctx.strokeStyle = `rgba(255, 60, 50, ${(alpha * 0.45).toFixed(3)})`;
    ctx.lineWidth = 12 * (0.6 + phaseProgress * 0.8);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + ux * beamLen, hy + uy * beamLen);
    ctx.stroke();
    // Sharp inner dashed line
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -t * 1.4;
    ctx.strokeStyle = `rgba(255, 220, 200, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + ux * beamLen, hy + uy * beamLen);
    ctx.stroke();
    ctx.setLineDash([]);
    // Strike-point marker — bright pulsing crosshair where the lunge
    // will land if the player doesn't move.
    const mx = hx + ux * beamLen;
    const my = hy + uy * beamLen;
    const mr = 6 + 4 * Math.sin(t * 0.4);
    ctx.strokeStyle = `rgba(255, 80, 60, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - mr * 1.6, my);
    ctx.lineTo(mx + mr * 1.6, my);
    ctx.moveTo(mx, my - mr * 1.6);
    ctx.lineTo(mx, my + mr * 1.6);
    ctx.stroke();
    ctx.restore();
  }

  // ── Motion-blur trail during lunge — fading head silhouettes
  if (phase === "lunge" && c.positionHistory.length >= 4) {
    ctx.save();
    for (let i = 1; i <= 5; i++) {
      const p = c.positionHistory[Math.min(i * 2, c.positionHistory.length - 1)];
      if (!p) continue;
      const a = (1 - i / 6) * 0.5;
      ctx.fillStyle = `rgba(216, 200, 150, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hr * (1 - i * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Build sample points along the spine via Catmull-Rom smoothing
  // so the body is a flowing curve, not visible balls. We sample N
  // points; each carries position, tangent, normal, and t-along-body.
  type SamplePoint = { x: number; y: number; tx: number; ty: number; nx: number; ny: number; u: number };
  const samples: SamplePoint[] = [];
  const SAMPLES_PER_SEG = 6;
  for (let i = 0; i < allBodies.length - 1; i++) {
    const a = allBodies[i];
    const b = allBodies[i + 1];
    const ax = a.x ?? 0;
    const ay = a.y ?? 0;
    const bx = b.x ?? 0;
    const by = b.y ?? 0;
    const steps = i === allBodies.length - 2 ? SAMPLES_PER_SEG : SAMPLES_PER_SEG - 1;
    for (let s = 0; s < steps; s++) {
      const f = s / SAMPLES_PER_SEG;
      const x = ax + (bx - ax) * f;
      const y = ay + (by - ay) * f;
      let tx = bx - ax;
      let ty = by - ay;
      const tlen = Math.hypot(tx, ty) || 1;
      tx /= tlen;
      ty /= tlen;
      const nx = -ty;
      const ny = tx;
      const u = (i + f) / Math.max(1, allBodies.length - 1);
      samples.push({ x, y, tx, ty, nx, ny, u });
    }
  }
  // Push the very last point (tail tip).
  if (allBodies.length > 1) {
    const last = allBodies[allBodies.length - 1];
    const prev = allBodies[allBodies.length - 2];
    let tx = (last.x ?? 0) - (prev.x ?? 0);
    let ty = (last.y ?? 0) - (prev.y ?? 0);
    const tlen = Math.hypot(tx, ty) || 1;
    tx /= tlen;
    ty /= tlen;
    samples.push({
      x: last.x ?? 0,
      y: last.y ?? 0,
      tx,
      ty,
      nx: -ty,
      ny: tx,
      u: 1,
    });
  }

  // Width at body position u: gentle taper to the tail (60% width at u=1).
  const widthAt = (u: number) => bodyHalfWidth * (1 - 0.4 * u);

  // ── Legs — drawn FIRST (behind the body). Many pairs along the body,
  // each pair longer toward the rear, with white/dark band pattern
  // and a knee bend.
  const LEG_PAIRS = Math.min(samples.length - 2, 14);
  ctx.lineCap = "round";
  for (let i = 1; i <= LEG_PAIRS; i++) {
    const idx = Math.round(((i - 0.5) / LEG_PAIRS) * (samples.length - 2));
    const sp = samples[idx];
    if (!sp) continue;
    // Length grows from 1.6× hr at the front to 3.0× hr at the rear.
    const lenScale = 1.6 + sp.u * 1.4;
    const len = hr * lenScale;
    // Walking wave — opposite phase per side; pairs offset.
    const phase = t * 0.16 + i * 0.5;
    for (const side of [-1, 1]) {
      const wag = Math.sin(phase + side * 1.1) * 0.18;
      // Kneed leg: out perpendicular, then bent slightly back toward tail.
      const baseX = sp.x + sp.nx * side * widthAt(sp.u) * 0.95;
      const baseY = sp.y + sp.ny * side * widthAt(sp.u) * 0.95;
      const kneeOut = (0.55 + wag) * len;
      const kneeBack = -0.15 * len; // bend tucks back along body
      const kx = baseX + sp.nx * side * kneeOut + sp.tx * kneeBack;
      const ky = baseY + sp.ny * side * kneeOut + sp.ty * kneeBack;
      const tipOut = (1.0 + wag * 0.6) * len;
      const tipBack = -0.35 * len;
      const tipX = baseX + sp.nx * side * tipOut + sp.tx * tipBack;
      const tipY = baseY + sp.ny * side * tipOut + sp.ty * tipBack;

      // Stroke whole leg as a thin pale base, then overlay banded segments.
      ctx.strokeStyle = P.legShade;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(kx, ky, tipX, tipY);
      ctx.stroke();

      // Banding: alternate pale/dark short segments along the curve.
      const BANDS = 6;
      for (let bi = 0; bi < BANDS; bi++) {
        const f0 = bi / BANDS;
        const f1 = (bi + 1) / BANDS;
        // Quadratic-bezier point sampler.
        const sample = (f: number) => {
          const omf = 1 - f;
          return {
            x: omf * omf * baseX + 2 * omf * f * kx + f * f * tipX,
            y: omf * omf * baseY + 2 * omf * f * ky + f * f * tipY,
          };
        };
        const p0 = sample(f0);
        const p1 = sample(f1);
        ctx.strokeStyle = bi % 2 === 0 ? P.legBandPale : P.legBandDark;
        ctx.lineWidth = 1.4 - f0 * 0.4; // taper toward tip
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  // ── Body ribbon — build outer outline using normals at each sample.
  if (samples.length >= 2) {
    // Outer (left) edge forward, then outer (right) edge back.
    ctx.beginPath();
    {
      const s0 = samples[0];
      const w0 = widthAt(s0.u);
      ctx.moveTo(s0.x + s0.nx * w0, s0.y + s0.ny * w0);
    }
    for (let i = 1; i < samples.length; i++) {
      const sp = samples[i];
      const w = widthAt(sp.u);
      ctx.lineTo(sp.x + sp.nx * w, sp.y + sp.ny * w);
    }
    for (let i = samples.length - 1; i >= 0; i--) {
      const sp = samples[i];
      const w = widthAt(sp.u);
      ctx.lineTo(sp.x - sp.nx * w, sp.y - sp.ny * w);
    }
    ctx.closePath();
    // Body fill — soft top-light gradient is approximated by a flat
    // pale tan with a darker shade band, applied via two overlapping
    // strokes after the fill.
    ctx.fillStyle = P.bodyPale;
    ctx.fill();
    // Underside shadow band (lower half along normal): redraw narrower
    // shape using offset normals to give a 3D look.
    ctx.beginPath();
    {
      const s0 = samples[0];
      const w0 = widthAt(s0.u);
      ctx.moveTo(s0.x + s0.nx * w0 * 0.05, s0.y + s0.ny * w0 * 0.05);
    }
    for (let i = 1; i < samples.length; i++) {
      const sp = samples[i];
      const w = widthAt(sp.u);
      ctx.lineTo(sp.x + sp.nx * w * 0.05, sp.y + sp.ny * w * 0.05);
    }
    for (let i = samples.length - 1; i >= 0; i--) {
      const sp = samples[i];
      const w = widthAt(sp.u);
      ctx.lineTo(sp.x - sp.nx * w, sp.y - sp.ny * w);
    }
    ctx.closePath();
    ctx.fillStyle = P.bodyMid;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Outline — dark exoskeleton edge.
    ctx.beginPath();
    {
      const s0 = samples[0];
      const w0 = widthAt(s0.u);
      ctx.moveTo(s0.x + s0.nx * w0, s0.y + s0.ny * w0);
    }
    for (let i = 1; i < samples.length; i++) {
      const sp = samples[i];
      const w = widthAt(sp.u);
      ctx.lineTo(sp.x + sp.nx * w, sp.y + sp.ny * w);
    }
    for (let i = samples.length - 1; i >= 0; i--) {
      const sp = samples[i];
      const w = widthAt(sp.u);
      ctx.lineTo(sp.x - sp.nx * w, sp.y - sp.ny * w);
    }
    ctx.closePath();
    ctx.strokeStyle = P.bodyShade;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Three longitudinal stripes — center, +0.45 and -0.45 of half-width.
    // Stroke a thin line through the samples at each offset.
    const stripes = [-0.55, 0, 0.55];
    ctx.strokeStyle = P.stripeDark;
    ctx.lineWidth = 1.5;
    for (const off of stripes) {
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const sp = samples[i];
        const w = widthAt(sp.u);
        const x = sp.x + sp.nx * (w * off);
        const y = sp.y + sp.ny * (w * off);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Faint segment-seam tick marks across the body — perpendicular
    // dashes at evenly spaced points.
    ctx.strokeStyle = "rgba(40, 25, 12, 0.35)";
    ctx.lineWidth = 1;
    const SEAMS = 14;
    for (let i = 1; i < SEAMS; i++) {
      const f = i / SEAMS;
      const idx = Math.min(samples.length - 1, Math.floor(f * (samples.length - 1)));
      const sp = samples[idx];
      const w = widthAt(sp.u) * 0.9;
      ctx.beginPath();
      ctx.moveTo(sp.x + sp.nx * w, sp.y + sp.ny * w);
      ctx.lineTo(sp.x - sp.nx * w, sp.y - sp.ny * w);
      ctx.stroke();
    }
  }

  // ── Cerci — long banded tail filaments at the rear ──────────────
  if (samples.length >= 2) {
    const tail = samples[samples.length - 1];
    const tailW = widthAt(tail.u);
    const cerciLen = hr * 2.6;
    for (const side of [-1, 1]) {
      const wag = Math.sin(t * 0.10 + side * 0.7) * 0.15;
      const baseX = tail.x + tail.nx * side * tailW * 0.55 - tail.tx * tailW * 0.4;
      const baseY = tail.y + tail.ny * side * tailW * 0.55 - tail.ty * tailW * 0.4;
      const ctrlX = baseX - tail.tx * cerciLen * 0.6 + tail.nx * side * cerciLen * (0.35 + wag);
      const ctrlY = baseY - tail.ty * cerciLen * 0.6 + tail.ny * side * cerciLen * (0.35 + wag);
      const tipX = baseX - tail.tx * cerciLen * 1.0 + tail.nx * side * cerciLen * (0.55 + wag * 1.2);
      const tipY = baseY - tail.ty * cerciLen * 1.0 + tail.ny * side * cerciLen * (0.55 + wag * 1.2);
      // Banded segments
      const BANDS = 8;
      for (let bi = 0; bi < BANDS; bi++) {
        const f0 = bi / BANDS;
        const f1 = (bi + 1) / BANDS;
        const sample = (f: number) => {
          const omf = 1 - f;
          return {
            x: omf * omf * baseX + 2 * omf * f * ctrlX + f * f * tipX,
            y: omf * omf * baseY + 2 * omf * f * ctrlY + f * f * tipY,
          };
        };
        const p0 = sample(f0);
        const p1 = sample(f1);
        ctx.strokeStyle = bi % 2 === 0 ? P.cerciPale : P.cerciDark;
        ctx.lineWidth = 1.6 - f0 * 0.6;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  // ── Head — armored teardrop with antennae + mandibles + bead eyes
  const hx = head.x ?? 0;
  const hy = head.y ?? 0;
  const angle = Math.atan2(head.vy ?? 0, head.vx ?? 0) || 0;

  // Windup jitter — head trembles before the strike.
  const jitterX = phase === "windup" ? Math.sin(t * 1.7) * 1.6 * phaseProgress : 0;
  const jitterY = phase === "windup" ? Math.cos(t * 2.1) * 1.6 * phaseProgress : 0;

  ctx.save();
  ctx.translate(hx + jitterX, hy + jitterY);
  ctx.rotate(angle);

  // Enraged red glow under the head shell.
  if (isEnraged) {
    const glow = ctx.createRadialGradient(0, 0, hr * 0.3, 0, 0, hr * 1.4);
    glow.addColorStop(0, "rgba(255, 70, 50, 0.55)");
    glow.addColorStop(1, "rgba(255, 70, 50, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, hr * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Antennae — long banded waving filaments forward
  const antLen = hr * 3.2;
  for (const side of [-1, 1]) {
    const tw = Math.sin(t * 0.10 + side * 0.9) * 0.4;
    const baseX = hr * 0.35;
    const baseY = side * hr * 0.35;
    const ctrlX = hr * 1.6;
    const ctrlY = side * (hr * 1.0 + tw * 4);
    const tipX = hr * 0.35 + antLen;
    const tipY = side * (hr * 0.4 + tw * 8);
    const BANDS = 10;
    for (let bi = 0; bi < BANDS; bi++) {
      const f0 = bi / BANDS;
      const f1 = (bi + 1) / BANDS;
      const sample = (f: number) => {
        const omf = 1 - f;
        return {
          x: omf * omf * baseX + 2 * omf * f * ctrlX + f * f * tipX,
          y: omf * omf * baseY + 2 * omf * f * ctrlY + f * f * tipY,
        };
      };
      const p0 = sample(f0);
      const p1 = sample(f1);
      ctx.strokeStyle = bi % 2 === 0 ? P.antennaPale : P.antennaDark;
      ctx.lineWidth = 1.4 - f0 * 0.7;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  // Head shell — pale tan, tinted reddish when enraged
  const headFill = isEnraged ? "#d8907a" : P.bodyPale;
  const headRim = isEnraged ? "#7a3220" : P.bodyShade;
  ctx.fillStyle = headFill;
  ctx.beginPath();
  ctx.ellipse(hr * 0.1, 0, hr * 0.95, hr * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = headRim;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Two head stripes (continuation of the body lines)
  ctx.strokeStyle = isEnraged ? "#3a0808" : P.stripeDark;
  ctx.lineWidth = 1.2;
  for (const off of [-hr * 0.3, hr * 0.3]) {
    ctx.beginPath();
    ctx.moveTo(-hr * 0.35, off);
    ctx.lineTo(hr * 0.7, off * 0.85);
    ctx.stroke();
  }

  // Mandibles — flare wider during windup + lunge.
  const flare = phase === "windup" ? phaseProgress * 0.5 : phase === "lunge" ? 0.65 : 0;
  for (const side of [-1, 1]) {
    const grd = ctx.createLinearGradient(hr * 0.7, 0, hr * 1.15, 0);
    grd.addColorStop(0, P.mandible);
    grd.addColorStop(1, P.mandibleTip);
    ctx.fillStyle = grd;
    ctx.beginPath();
    const fy = (1 + flare) * side;
    ctx.moveTo(hr * 0.7, hr * 0.18 * fy);
    ctx.quadraticCurveTo(
      hr * (1.0 + flare * 0.15),
      hr * 0.32 * fy,
      hr * (1.15 + flare * 0.2),
      hr * 0.08 * fy,
    );
    ctx.quadraticCurveTo(
      hr * 0.95,
      hr * 0.2 * fy,
      hr * 0.78,
      hr * 0.1 * fy,
    );
    ctx.closePath();
    ctx.fill();
  }

  // Tiny black bead eyes (house centipedes have small simple eyes)
  for (const ey of [-hr * 0.3, hr * 0.3]) {
    ctx.fillStyle = P.eyeShine;
    ctx.beginPath();
    ctx.arc(hr * 0.05, ey, hr * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(hr * 0.07, ey - hr * 0.025, hr * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ─── Bosses ─────────────────────────────────────────────────────── */

/**
 * Swarm Lord — depth 20. Large dark anglerfish with a cloud of
 * orbiting smaller halos that simulate a swarm.
 */
function drawSwarmLord(
  ctx: CanvasRenderingContext2D,
  p: Body,
  t: number,
): void {
  const T = currentTheme().predator;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius * 1.3;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  // Large danger halo
  const halo = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 3.2);
  halo.addColorStop(0, T.halo0);
  halo.addColorStop(1, T.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Orbiting swarm satellites — six minor red blobs
  const sats = 6;
  for (let i = 0; i < sats; i++) {
    const sa = (i / sats) * Math.PI * 2 + t * 0.025;
    const sr = r * 1.6;
    const sx = x + Math.cos(sa) * sr;
    const sy = y + Math.sin(sa) * sr;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.5);
    sg.addColorStop(0, T.bodyDark);
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.bodyDark;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body — same dart silhouette as skirmisher but bigger
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = T.bodyDark;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.rim;
  ctx.lineWidth = 2.0;
  ctx.stroke();
  // Five sharp teeth
  ctx.fillStyle = T.teeth;
  for (let i = -2; i <= 2; i++) {
    const ty = i * r * 0.22;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, ty);
    ctx.lineTo(r * 0.96, ty - r * 0.1);
    ctx.lineTo(r * 0.96, ty + r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  // Single large central eye
  ctx.fillStyle = T.eye;
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Tide Maw — depth 40. Massive brute with a slow-pulsing huge maw at
 * the front. Visibly the largest, slowest threat.
 */
function drawTideMaw(
  ctx: CanvasRenderingContext2D,
  p: Body,
  t: number,
): void {
  const T = currentTheme().brute;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius * 1.15;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;
  const mawPulse = 0.5 + 0.4 * Math.abs(Math.sin(t * 0.04));

  // Huge danger halo
  const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3.0);
  halo.addColorStop(0, T.halo0);
  halo.addColorStop(1, T.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Body — bulky elongated
  ctx.fillStyle = T.bodyDark;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.rim;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // Multi-segment chitin (5 arcs)
  ctx.strokeStyle = T.chitin;
  ctx.lineWidth = 1.6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * r * 0.22, 0, r * 0.92, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
  }
  // Huge maw — pulsing dark gradient at the front
  const maw = ctx.createRadialGradient(r * 0.4, 0, r * 0.05, r * 0.4, 0, r * 0.65 * mawPulse);
  maw.addColorStop(0, "rgba(0, 0, 0, 0.95)");
  maw.addColorStop(0.7, "rgba(60, 0, 0, 0.6)");
  maw.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = maw;
  ctx.beginPath();
  ctx.arc(r * 0.4, 0, r * 0.65 * mawPulse, 0, Math.PI * 2);
  ctx.fill();
  // Teeth ring around the maw
  ctx.fillStyle = T.teeth;
  const teethCount = 8;
  for (let i = 0; i < teethCount; i++) {
    const ta = (i / teethCount) * Math.PI - Math.PI * 0.5;
    const baseR = r * 0.55;
    const tipR = r * 0.85;
    const tx = r * 0.4 + Math.cos(ta) * baseR;
    const ty = Math.sin(ta) * baseR;
    const tipX = r * 0.4 + Math.cos(ta) * tipR;
    const tipY = Math.sin(ta) * tipR;
    const px = -Math.sin(ta);
    const py = Math.cos(ta);
    const w = r * 0.06;
    ctx.beginPath();
    ctx.moveTo(tx + px * w, ty + py * w);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tx - px * w, ty - py * w);
    ctx.closePath();
    ctx.fill();
  }
  // Two glowing eye dots
  ctx.fillStyle = T.eye;
  for (const ey of [-r * 0.42, r * 0.42]) {
    ctx.beginPath();
    ctx.arc(-r * 0.15, ey, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Abyss Eye — depth 60. Eldritch radial creature with a central eye
 * and 8 spinning tentacles. No directional rotation — radial body
 * stays oriented absolutely.
 */
function drawAbyssEye(
  ctx: CanvasRenderingContext2D,
  p: Body,
  t: number,
): void {
  const T = currentTheme().predator;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius * 1.25;

  // Massive halo
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.5);
  halo.addColorStop(0, T.halo0);
  halo.addColorStop(1, T.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
  ctx.fill();

  // 8 tentacles spinning around the center
  const tentacles = 8;
  const spin = t * 0.012;
  ctx.lineCap = "round";
  for (let i = 0; i < tentacles; i++) {
    const baseA = (i / tentacles) * Math.PI * 2 + spin;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(baseA) * r * 0.6, y + Math.sin(baseA) * r * 0.6);
    const segs = 8;
    for (let s = 1; s <= segs; s++) {
      const f = s / segs;
      const wobble = Math.sin(t * 0.08 + i * 0.7 + f * 4) * 0.4;
      const a = baseA + wobble;
      const len = r * 0.6 + r * 1.8 * f;
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    const grad = ctx.createLinearGradient(
      x + Math.cos(baseA) * r * 0.6,
      y + Math.sin(baseA) * r * 0.6,
      x + Math.cos(baseA) * r * 2.4,
      y + Math.sin(baseA) * r * 2.4,
    );
    grad.addColorStop(0, T.bodyDark);
    grad.addColorStop(1, "rgba(60, 0, 0, 0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Central body — dark sphere
  ctx.fillStyle = T.bodyDark;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.rim;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Iris — slowly closing/opening
  const irisOpen = 0.4 + 0.3 * Math.abs(Math.sin(t * 0.025));
  ctx.fillStyle = T.lure0;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.4, r * 0.4 * irisOpen, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkirmisherPredator(
  ctx: CanvasRenderingContext2D,
  p: Body,
  t: number,
): void {
  const T = currentTheme().predator;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius * 1.25;
  const recoiling = p.recoilUntil != null && p.recoilUntil > t;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  ctx.globalAlpha = recoiling ? 0.4 : 1;
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
  halo.addColorStop(0, T.halo0);
  halo.addColorStop(1, T.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = recoiling ? T.bodyDarkRecoil : T.bodyDark;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.rim;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = T.teeth;
  for (let i = -1; i <= 1; i++) {
    const ty = i * r * 0.32;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, ty);
    ctx.lineTo(r * 0.92, ty - r * 0.1);
    ctx.lineTo(r * 0.92, ty + r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = T.eye;
  ctx.beginPath();
  ctx.arc(r * 0.25, -r * 0.2, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Lure
  const lurePhase = t * 0.05 + (x + y) * 0.001;
  const lx = r * 1.45 + Math.sin(lurePhase) * 2.5;
  const ly = -r * 0.55 + Math.cos(lurePhase) * 2.5;
  ctx.strokeStyle = T.lureLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55);
  ctx.quadraticCurveTo(r * 0.7, -r * 0.85, lx, ly);
  ctx.stroke();
  const lureGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.65);
  lureGlow.addColorStop(0, T.lure0);
  lureGlow.addColorStop(1, T.lure1);
  ctx.fillStyle = lureGlow;
  ctx.beginPath();
  ctx.arc(lx, ly, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * Brute: thicker, darker, more menacing. Wider body with multiple
 * tooth rows + faint chitin segmentation. Slow but lethal.
 */
function drawBrutePredator(
  ctx: CanvasRenderingContext2D,
  p: Body,
  t: number,
): void {
  const T = currentTheme().brute;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const r = p.radius * 1.15;
  const recoiling = p.recoilUntil != null && p.recoilUntil > t;
  const angle = Math.atan2(p.vy ?? 0, p.vx ?? 0) || 0;

  ctx.globalAlpha = recoiling ? 0.4 : 1;
  const halo = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.8);
  halo.addColorStop(0, T.halo0);
  halo.addColorStop(1, T.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = recoiling ? T.bodyDarkRecoil : T.bodyDark;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = T.rim;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Chitin segmentation
  ctx.strokeStyle = T.chitin;
  ctx.lineWidth = 1.2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(i * r * 0.25, 0, r * 0.85, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = T.teeth;
  for (let i = -2; i <= 2; i++) {
    const ty = i * r * 0.22;
    ctx.beginPath();
    ctx.moveTo(r * 0.5, ty);
    ctx.lineTo(r * 0.96, ty - r * 0.09);
    ctx.lineTo(r * 0.96, ty + r * 0.09);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = T.eye;
  for (const ey of [-r * 0.32, r * 0.32]) {
    ctx.beginPath();
    ctx.arc(r * 0.18, ey, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
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

/** Stinger-fire tracer lines — quick fade-out beam from bell to target. */
export function drawTracers(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.tracers.length === 0) return;
  const stingerColor = currentTheme().nodeColors.stinger;
  for (const tr of world.tracers) {
    const f = tr.age / tr.max;
    const alpha = (1 - f) * 0.95;
    ctx.strokeStyle = stingerColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3 * (1 - f) + 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tr.x1, tr.y1);
    ctx.lineTo(tr.x2, tr.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ─── Thumbstick overlay (screen space) ──────────────────────────── */

/**
 * Anchored thumbstick — white-on-translucent disc with knob, matching
 * the Uncle Grandpa game's controller style. Always visible at the
 * bottom-left corner with drop shadow so it reads as a physical
 * controller, not an overlay element.
 */
export function drawThumbstick(ctx: CanvasRenderingContext2D, world: World): void {
  if (!world.stickAnchor || !world.stickKnob) return;
  const a = world.stickAnchor;
  const k = world.stickKnob;
  const engaged = !!world.stickInput;

  // Base disc (110px diameter) — translucent white with thick border + shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.arc(a.x, a.y, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 55, 0, Math.PI * 2);
  ctx.stroke();

  // Knob (50px diameter) — brighter white with shadow + thick border
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = engaged
    ? "rgba(255, 255, 255, 0.7)"
    : "rgba(255, 255, 255, 0.45)";
  ctx.beginPath();
  ctx.arc(k.x, k.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = engaged
    ? "rgba(255, 255, 255, 0.9)"
    : "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(k.x, k.y, 25, 0, Math.PI * 2);
  ctx.stroke();
}

/* ─── Boss off-screen indicator ──────────────────────────────────── */

/**
 * If the centipede head is currently off-screen, draw a pulsing red
 * chevron at the viewport edge pointing toward it. Runs in screen
 * space after the camera restore so it sits on top of everything.
 */
/**
 * Bell hit-flash + health ring — world-space, drawn after bodies so
 * it sits ON TOP of the bell glow.
 *
 *   - Hit flash: red ring + radial wash on the bell for ~14 ticks
 *     after damage. Decays out smoothly.
 *   - Health ring: arc above the bell showing how far you are from
 *     dropping a stage. Green → amber → red as you near demotion.
 */
export function drawPlayerHealthSignal(
  ctx: CanvasRenderingContext2D,
  world: World,
): void {
  const core = world.entityBodies[0];
  if (!core) return;
  const cx = core.x ?? 0;
  const cy = core.y ?? 0;
  const cr = core.radius;

  // ── Hit flash ────────────────────────────────────────────────────
  const sinceHit = world.tickN - (world.lastDamageTickN ?? -9999);
  if (sinceHit >= 0 && sinceHit < 14) {
    const f = 1 - sinceHit / 14;
    // Red wash inside the bell
    const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 1.4);
    wash.addColorStop(0, `rgba(255, 70, 70, ${(0.55 * f).toFixed(3)})`);
    wash.addColorStop(1, "rgba(255, 70, 70, 0)");
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(cx, cy, cr * 1.4, 0, Math.PI * 2);
    ctx.fill();
    // Sharp red rim that fades + expands
    ctx.strokeStyle = `rgba(255, 90, 90, ${(0.85 * f).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cr * (1.05 + (1 - f) * 0.35), 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Health ring ──────────────────────────────────────────────────
  // "Health" = progress within the current stage band. At the band
  // floor the ring is empty (about to demote on next hit); at the
  // ceiling it's full (next hit is cheap). Always-visible so the
  // player has a constant readout, dimmed when full.
  const totalAbsorbed = world.totalAbsorbed;
  const stage = world.evolutionStage;
  const lo = STAGE_THRESHOLDS[stage] ?? 0;
  const hi = STAGE_THRESHOLDS[stage + 1] ?? lo + 1;
  const span = Math.max(1, hi - lo);
  const frac = Math.max(0, Math.min(1, (totalAbsorbed - lo) / span));
  // Color stops: red <25% → amber <60% → green
  const color =
    frac < 0.25
      ? `rgba(255, 90, 80, 0.95)`
      : frac < 0.6
      ? `rgba(255, 200, 90, 0.9)`
      : `rgba(140, 220, 150, 0.85)`;
  const ringR = cr * 1.32;
  const startA = -Math.PI / 2 - Math.PI * 0.85;
  const endA = -Math.PI / 2 + Math.PI * 0.85;
  const arcSpan = endA - startA;
  // Backdrop arc
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(15, 20, 35, 0.8)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, startA, endA);
  ctx.stroke();
  // Fill arc
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, startA, startA + arcSpan * frac);
  ctx.stroke();
  // Tick at the demotion threshold (left edge) — danger reminder
  ctx.strokeStyle = "rgba(255, 90, 80, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(startA) * (ringR - 6), cy + Math.sin(startA) * (ringR - 6));
  ctx.lineTo(cx + Math.cos(startA) * (ringR + 6), cy + Math.sin(startA) * (ringR + 6));
  ctx.stroke();
}

/**
 * Boss HP bar — screen-space pill at the top of the viewport. Only
 * appears while a boss is on the field. Tints red and shows
 * 'ENRAGED' badge once the head crosses the aggro threshold.
 */
export function drawBossHealthBar(
  ctx: CanvasRenderingContext2D,
  world: World,
  vw: number,
): void {
  const c = world.centipede;
  if (!c) return;
  const hp = Math.max(0, c.head.health ?? 0);
  const maxHp = Math.max(1, c.maxHealth);
  const frac = Math.min(1, hp / maxHp);
  const enraged = c.enragedFlashed;

  // Bar dimensions
  const barW = Math.min(420, vw * 0.7);
  const barH = 14;
  const barX = (vw - barW) / 2;
  const barY = Math.max(56, vw * 0.04);

  // Backdrop
  ctx.save();
  ctx.fillStyle = "rgba(8, 10, 18, 0.78)";
  ctx.beginPath();
  roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 8);
  ctx.fill();
  ctx.strokeStyle = enraged
    ? "rgba(255, 70, 60, 0.9)"
    : "rgba(180, 90, 70, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 8);
  ctx.stroke();

  // Empty track
  ctx.fillStyle = "rgba(40, 16, 14, 0.85)";
  ctx.beginPath();
  roundRect(ctx, barX, barY, barW, barH, 6);
  ctx.fill();

  // Fill — gradient from deep red → bright red. Pulses when enraged.
  const fillW = Math.max(0, barW * frac);
  const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  if (enraged) {
    const pulse = 0.7 + 0.3 * Math.sin(world.tickN * 0.25);
    grad.addColorStop(0, `rgba(255, ${Math.round(60 + 40 * pulse)}, 50, 0.95)`);
    grad.addColorStop(1, `rgba(255, ${Math.round(140 + 60 * pulse)}, 100, 0.95)`);
  } else {
    grad.addColorStop(0, "rgba(200, 60, 60, 0.95)");
    grad.addColorStop(1, "rgba(255, 110, 90, 0.95)");
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  roundRect(ctx, barX, barY, fillW, barH, 6);
  ctx.fill();

  // Enrage threshold tick (40% from left)
  const tickX = barX + barW * 0.4;
  ctx.strokeStyle = "rgba(255, 200, 200, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tickX, barY);
  ctx.lineTo(tickX, barY + barH);
  ctx.stroke();

  // Label + numeric
  ctx.font =
    '600 11px ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace';
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(245, 220, 220, 0.95)";
  const label = `CENTIPEDE · LV ${c.level}${c.cycleRound > 0 ? ` · CYCLE ${c.cycleRound}` : ""}`;
  ctx.textAlign = "left";
  ctx.fillText(label, barX, barY - 10);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255, 220, 220, 0.85)";
  ctx.fillText(`${Math.ceil(hp)} / ${Math.ceil(maxHp)}`, barX + barW, barY - 10);

  // ENRAGED badge (right of bar)
  if (enraged) {
    const badgeX = barX + barW + 8;
    const badgeY = barY - 1;
    const badgeH = barH + 2;
    ctx.font =
      '700 10px ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace';
    const text = "ENRAGED";
    const textW = ctx.measureText(text).width + 14;
    ctx.fillStyle = "rgba(255, 70, 60, 0.92)";
    ctx.beginPath();
    roundRect(ctx, badgeX, badgeY, textW, badgeH, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(15, 5, 5, 0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, badgeX + 7, badgeY + badgeH / 2 + 0.5);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

export function drawBossIndicator(
  ctx: CanvasRenderingContext2D,
  world: World,
  vw: number,
  vh: number,
): void {
  const c = world.centipede;
  if (!c) return;
  const head = c.head;
  const sx = (head.x ?? 0) * world.camera.k + world.camera.x;
  const sy = (head.y ?? 0) * world.camera.k + world.camera.y;
  const padding = 36;
  const inside =
    sx >= padding && sx <= vw - padding && sy >= padding && sy <= vh - padding;
  if (inside) return;
  const cx = vw / 2;
  const cy = vh / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const halfW = cx - padding;
  const halfH = cy - padding;
  const sX = halfW / Math.abs(dx || 1);
  const sY = halfH / Math.abs(dy || 1);
  const s = Math.min(sX, sY);
  const ax = cx + dx * s;
  const ay = cy + dy * s;
  const angle = Math.atan2(sy - cy, sx - cx);
  const pulse = 0.55 + 0.45 * Math.sin(world.tickN * 0.18);
  const T = currentTheme();
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  // Chevron
  ctx.fillStyle = `${T.telegraph} ${(0.6 + 0.3 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-22, -12);
  ctx.lineTo(-15, 0);
  ctx.lineTo(-22, 12);
  ctx.closePath();
  ctx.fill();
  // Trail line for orientation
  ctx.strokeStyle = `${T.telegraph} ${(0.4 * pulse).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-40, 0);
  ctx.stroke();
  ctx.restore();
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
    const T = currentTheme();
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = `${T.telegraph} ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `${T.telegraph} ${(alpha * 0.5).toFixed(3)})`;
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
