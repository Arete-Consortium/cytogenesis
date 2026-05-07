import type { World } from "./world";
import type { Body } from "./types";
import { NODE_COLOR } from "@/data/nodeTypes";

/** Lazily-created offscreen canvas for the env-CA underlay. */
let caBuffer: HTMLCanvasElement | null = null;
let caBufferLastSteps = -1;

/**
 * Paint the env CA as a faint underlay sized to the arena. We rebuild
 * the offscreen pixel buffer only on CA steps (4Hz) and reuse it
 * across the 60Hz render loop. Runs in world space — the caller has
 * already applied the camera transform.
 */
export function drawEnvCA(
  ctx: CanvasRenderingContext2D,
  world: World,
): void {
  const ca = world.envCA;
  if (!caBuffer) {
    if (typeof document === "undefined") return; // jsdom guard
    caBuffer = document.createElement("canvas");
    caBuffer.width = ca.width;
    caBuffer.height = ca.height;
  }
  // Only repaint the buffer when the CA has actually advanced.
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
        data[k] = 32;       // R — cool teal
        data[k + 1] = 96;   // G
        data[k + 2] = 138;  // B
        data[k + 3] = 70;   // A — faint
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

/**
 * Paint the static-ish backdrop. Lives in screen space so the gradient
 * doesn't move when the camera pans — the world floats over it.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) / 1.1);
  grad.addColorStop(0, "#0f1626");
  grad.addColorStop(1, "#07090d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw the bonds between captured nodes. Drawn before bodies so the
 * circles overlap the line endpoints. d3.forceLink resolves
 * source/target from id-strings to Body refs after the first tick;
 * this guards both shapes for safety.
 */
export function drawBonds(
  ctx: CanvasRenderingContext2D,
  world: World,
): void {
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

    // Bond color tints from source toward target — gives a visual
    // sense of "this came from there". Strength → opacity.
    const grad = ctx.createLinearGradient(sx, sy, tx, ty);
    grad.addColorStop(0, NODE_COLOR[s.type]);
    grad.addColorStop(1, NODE_COLOR[t.type]);
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.5 + 0.4 * bond.strength;
    ctx.lineWidth = 2 + bond.strength;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw the world's bodies. The caller has already applied the camera
 * transform via ctx.translate/ctx.scale, so coords here are in world
 * space.
 */
export function drawBodies(
  ctx: CanvasRenderingContext2D,
  world: World,
  hovered: string | null,
  dragging: string | null,
): void {
  for (const b of world.bodies) {
    const x = b.x ?? 0;
    const y = b.y ?? 0;
    const isCore = b.kind === "captured";
    const isHover = b.id === hovered;
    const isDrag = b.id === dragging;

    // Soft outer glow on the core so the eye finds it instantly
    if (isCore) {
      const halo = ctx.createRadialGradient(x, y, b.radius, x, y, b.radius * 2.2);
      halo.addColorStop(0, "rgba(34, 211, 238, 0.35)");
      halo.addColorStop(1, "rgba(34, 211, 238, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, b.radius * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = NODE_COLOR[b.type];
    ctx.fill();

    if (isHover || isDrag) {
      ctx.lineWidth = isDrag ? 2.5 : 1.5;
      ctx.strokeStyle = "#f4f4f5";
      ctx.stroke();
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#1f1f23";
      ctx.stroke();
    }
  }
}

/**
 * Render predators on top of bodies — they're the threat, the player
 * needs to see them clearly. Red fill with a danger-glow halo;
 * recoiling predators get a faded look so the player can read the
 * "I just got hit, you have a moment" beat.
 */
export function drawPredators(
  ctx: CanvasRenderingContext2D,
  world: World,
): void {
  if (world.predators.length === 0) return;
  for (const p of world.predators) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    const recoiling = p.recoilUntil != null && p.recoilUntil > world.tickN;

    // Danger halo
    const halo = ctx.createRadialGradient(x, y, p.radius, x, y, p.radius * 2.5);
    halo.addColorStop(0, recoiling ? "rgba(239, 68, 68, 0.18)" : "rgba(239, 68, 68, 0.4)");
    halo.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, p.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = recoiling ? "#7f1d1d" : "#dc2626";
    ctx.fill();
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/**
 * Apply the world's camera transform to the context. Caller is responsible
 * for ctx.save() before and ctx.restore() after.
 */
export function applyCamera(
  ctx: CanvasRenderingContext2D,
  world: World,
  dpr: number,
): void {
  // DPR baseline first so all subsequent transforms compose correctly.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(world.camera.x, world.camera.y);
  ctx.scale(world.camera.k, world.camera.k);
}
