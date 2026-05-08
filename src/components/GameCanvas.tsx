"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { World } from "@/game/world";
import {
  drawBackground,
  drawBodies,
  drawBonds,
  drawEnvCA,
  drawPredators,
  drawSparkles,
  drawAmbientPlankton,
  applyCamera,
} from "@/game/render";
import type { TraitState } from "@/game/traits";
import { emptyTraitState } from "@/game/traits";

interface FrameStats {
  fps: number;
  ms: number;
  tick: number;
  captured: number;
  free: number;
  bonds: number;
  liveCA: number;
  traits: TraitState;
  lockOnReady: boolean;
  predators: number;
  runStatus: "running" | "transcended" | "dead";
  runDurationMs: number;
  peakCaptured: number;
}

const formatDuration = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const TRAIT_LABEL: Record<string, string> = {
  propulsion: "Propulsion",
  wide_capture: "Wide Capture",
  lock_on: "Lock-On",
};

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [runId, setRunId] = useState(0);
  const [stats, setStats] = useState<FrameStats>({
    fps: 0,
    ms: 0,
    tick: 0,
    captured: 0,
    free: 0,
    bonds: 0,
    liveCA: 0,
    traits: emptyTraitState(),
    lockOnReady: true,
    predators: 0,
    runStatus: "running",
    runDurationMs: 0,
    peakCaptured: 1,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const world = new World();
    let hoveredId: string | null = null;
    let draggingId: string | null = null;

    // Cap DPR at 2 — phones with 3× displays (recent iPhones, Pixel Pros)
    // double the pixel work for negligible visual gain on a free-floating
    // particle scene. Keeps mobile fps comfortable.
    const computeDpr = () => Math.min(window.devicePixelRatio || 1, 2);
    let dpr = computeDpr();
    let width = 0;
    let height = 0;

    const resize = () => {
      dpr = computeDpr();
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      world.setViewport(width, height);
      if (world.camera.x === 0 && world.camera.y === 0) {
        // Snap camera to center on first sizing so the lerp doesn't
        // visibly start from (0,0).
        world.camera.x = width / 2;
        world.camera.y = height / 2;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    // iOS rotates / collapses the address bar without firing a resize.
    window.addEventListener("orientationchange", resize);

    // ── d3.zoom ──────────────────────────────────────────────────────
    const selection = d3.select<HTMLCanvasElement, unknown>(canvas);
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.3, 4])
      .filter((event) => {
        if (draggingId !== null) return false;
        // Block zoom if the gesture started on a captured (draggable)
        // body. Free cells / empty space → allow pan or pinch.
        if (
          event.type === "mousedown" ||
          event.type === "touchstart" ||
          event.type === "pointerdown"
        ) {
          const rect = canvas.getBoundingClientRect();
          const sx = (event.clientX ?? event.touches?.[0]?.clientX ?? 0) - rect.left;
          const sy = (event.clientY ?? event.touches?.[0]?.clientY ?? 0) - rect.top;
          const w = world.screenToWorld(sx, sy);
          const hit = world.hitTest(w.x, w.y);
          if (hit && hit.kind === "captured") return false;
        }
        return !event.ctrlKey && !event.button;
      })
      // Camera follow owns x/y. Zoom only mirrors k so pinch / wheel
      // adjusts scale while the entity stays centered.
      .on("zoom", (event) => {
        world.camera.k = event.transform.k;
      });
    selection.call(zoom);
    selection.call(
      zoom.transform,
      d3.zoomIdentity.translate(world.camera.x, world.camera.y).scale(world.camera.k),
    );

    // ── d3.drag ──────────────────────────────────────────────────────
    // Subject returns null for free cells — only entity-graph nodes
    // are draggable. Free cells respond to clicks (lock-on) instead.
    //
    // Drag pin is capped to MAX_STEER world units from the body's
    // current position. With camera-follow, holding finger off-center
    // produces continuous drift in that direction — flOw / Osmos
    // thumbstick feel. Without the cap the pin would race the camera
    // each frame.
    const MAX_STEER = 60;
    const applyCappedPin = (body: { x?: number; y?: number; fx?: number | null; fy?: number | null }, tx: number, ty: number) => {
      const cx = body.x ?? 0;
      const cy = body.y ?? 0;
      let dx = tx - cx;
      let dy = ty - cy;
      const len = Math.hypot(dx, dy);
      if (len > MAX_STEER) {
        dx = (dx / len) * MAX_STEER;
        dy = (dy / len) * MAX_STEER;
      }
      body.fx = cx + dx;
      body.fy = cy + dy;
    };
    const drag = d3
      .drag<HTMLCanvasElement, unknown>()
      .container(canvas)
      .subject((event) => {
        const w = world.screenToWorld(event.x, event.y);
        const hit = world.hitTest(w.x, w.y);
        if (!hit || hit.kind !== "captured") return null;
        return hit;
      })
      .on("start", (event) => {
        if (!event.subject) return;
        draggingId = event.subject.id;
        const w = world.screenToWorld(event.x, event.y);
        applyCappedPin(event.subject, w.x, w.y);
        world.reheat(0.5);
      })
      .on("drag", (event) => {
        if (!event.subject) return;
        const w = world.screenToWorld(event.x, event.y);
        applyCappedPin(event.subject, w.x, w.y);
      })
      .on("end", (event) => {
        if (!event.subject) return;
        event.subject.fx = null;
        event.subject.fy = null;
        draggingId = null;
      });
    selection.call(drag);

    // ── tap → lock-on ────────────────────────────────────────────────
    // Pointer events so this works for mouse + touch + pen uniformly.
    // Filter to primary so a pinch-zoom's second finger can't fire a
    // spurious tap. 6px threshold separates a tap from a drag/pan.
    let pointerDownAt: { x: number; y: number; pointerId: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      pointerDownAt = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDownAt || pointerDownAt.pointerId !== e.pointerId) return;
      const start = pointerDownAt;
      pointerDownAt = null;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > 6) return; // drag / pan / pinch
      if (world.traits.lockOnRange <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const w = world.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = world.hitTest(w.x, w.y);
      if (!hit || hit.kind !== "free") return;
      world.lockOn(hit, performance.now());
    };
    const onPointerCancel = () => {
      pointerDownAt = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", onPointerCancel, true);

    // Block long-press context menu on the canvas — interferes with drags.
    const onContext = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", onContext);

    // ── hover (cursor feedback — mouse only) ─────────────────────────
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // no hover on touch
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = world.screenToWorld(sx, sy);
      const hit = world.hitTest(w.x, w.y);
      hoveredId = hit?.id ?? null;
      if (!hit) {
        canvas.style.cursor = "default";
      } else if (hit.kind === "captured") {
        canvas.style.cursor = "grab";
      } else if (world.traits.lockOnRange > 0) {
        canvas.style.cursor = "crosshair";
      } else {
        canvas.style.cursor = "default";
      }
    };
    canvas.addEventListener("pointermove", onMove);

    // ── rAF loop ─────────────────────────────────────────────────────
    let raf = 0;
    let tick = 0;
    let lastT = performance.now();
    let frameMs = 0;
    let fpsAccum = 0;
    let lastStatPush = lastT;

    const loop = (t: number) => {
      const dt = t - lastT;
      lastT = t;
      frameMs = dt;
      fpsAccum += 1;
      tick += 1;

      world.tick(dt);
      world.captureNearby();

      drawBackground(ctx, width, height, world.tickN);
      drawAmbientPlankton(ctx, width, height, world.tickN);
      ctx.save();
      applyCamera(ctx, world, dpr);
      drawEnvCA(ctx, world);
      drawBonds(ctx, world);
      drawBodies(ctx, world, hoveredId, draggingId);
      drawPredators(ctx, world);
      drawSparkles(ctx, world);
      ctx.restore();

      if (t - lastStatPush >= 250) {
        const elapsed = (t - lastStatPush) / 1000;
        const counts = world.countByKind();
        const ended = world.runEndedAtMs ?? world.wallMs;
        setStats({
          fps: Math.round(fpsAccum / elapsed),
          ms: Math.round(frameMs * 100) / 100,
          tick,
          captured: counts.captured,
          free: counts.free,
          bonds: world.bonds.length,
          liveCA: Math.round(world.envCA.liveFraction() * 1000) / 10,
          traits: {
            ...world.traits,
            active: new Set(world.traits.active),
            levels: { ...world.traits.levels },
          },
          lockOnReady: t >= world.lockOnReadyAt,
          predators: world.predators.length,
          runStatus: world.runStatus,
          runDurationMs: ended,
          peakCaptured: world.peakCaptured,
        });
        fpsAccum = 0;
        lastStatPush = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
      canvas.removeEventListener("contextmenu", onContext);
      selection.on(".zoom", null).on(".drag", null);
      world.dispose();
    };
  }, [runId]);

  const restart = () => setRunId((r) => r + 1);

  const traitList = Array.from(stats.traits.active);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />
      {/* Top-left: just timer + peak. Quiet. */}
      <div
        className="pointer-events-none absolute left-2 top-2 font-mono text-[11px] leading-tight text-zinc-300/90"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          left: "max(0.75rem, env(safe-area-inset-left))",
        }}
      >
        <div className="text-zinc-200">{formatDuration(stats.runDurationMs)}</div>
        <div className="text-zinc-500">peak {stats.peakCaptured}</div>
      </div>

      {/* Top-right: captured count + trait chips. */}
      <div
        className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1.5 font-mono text-[11px] text-zinc-300/90"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          right: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <div className="text-zinc-200">
          <span className="text-cyan-300">{stats.captured}</span>
          <span className="text-zinc-600"> bonded</span>
        </div>
        {traitList.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {traitList.map((id) => (
              <span
                key={id}
                className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-200/85 ring-1 ring-cyan-300/20"
              >
                {TRAIT_LABEL[id] ?? id}
                <span className="ml-1 text-cyan-200/50">
                  ×{stats.traits.levels[id as keyof typeof stats.traits.levels]}
                </span>
              </span>
            ))}
          </div>
        )}
        {stats.traits.lockOnRange > 0 && (
          <div className="rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-zinc-400">
            tap prey · {stats.lockOnReady ? "ready" : "cooling"}
          </div>
        )}
      </div>

      {/* Predator warning: only when one is on the field. */}
      {stats.predators > 0 && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-red-400/80"
          style={{ top: "calc(max(0.5rem, env(safe-area-inset-top)) + 0.25rem)" }}
        >
          predator · {stats.predators}
        </div>
      )}

      {/* Bottom hint — fades after the player has bonded a few cells. */}
      {stats.captured < 4 && (
        <div
          className="pointer-events-none absolute bottom-2 left-1/2 max-w-[92vw] -translate-x-1/2 text-center font-mono text-[10px] text-zinc-400/70 transition-opacity"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <span className="hidden sm:inline">drag the bell to swim · scroll or pinch to zoom</span>
          <span className="sm:hidden">drag the bell to swim · pinch to zoom</span>
        </div>
      )}

      {stats.runStatus !== "running" && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 backdrop-blur-sm">
          <div
            className={`font-mono text-3xl font-semibold tracking-tight sm:text-4xl ${
              stats.runStatus === "transcended" ? "text-cyan-300" : "text-red-400"
            }`}
          >
            {stats.runStatus === "transcended" ? "TRANSCENDED" : "CONSUMED"}
          </div>
          <div className="font-mono text-sm text-zinc-300">
            peak {stats.peakCaptured} · {formatDuration(stats.runDurationMs)}
          </div>
          <button
            onClick={restart}
            className="mt-2 inline-flex h-12 min-w-[180px] items-center justify-center rounded-full border border-zinc-600 px-6 font-mono text-sm text-zinc-100 transition-colors hover:bg-zinc-800 active:bg-zinc-900"
          >
            Begin again →
          </button>
        </div>
      )}
    </div>
  );
}
