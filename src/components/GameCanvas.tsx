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

    let dpr = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      if (world.camera.x === 0 && world.camera.y === 0) {
        world.camera.x = width / 2;
        world.camera.y = height / 2;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // ── d3.zoom ──────────────────────────────────────────────────────
    const selection = d3.select<HTMLCanvasElement, unknown>(canvas);
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.3, 4])
      .filter((event) => {
        if (draggingId !== null) return false;
        // Block zoom if the pointer landed on a captured (draggable)
        // body. Free cells / empty space → allow pan.
        if (event.type === "mousedown" || event.type === "touchstart") {
          const rect = canvas.getBoundingClientRect();
          const sx = (event.clientX ?? event.touches?.[0]?.clientX ?? 0) - rect.left;
          const sy = (event.clientY ?? event.touches?.[0]?.clientY ?? 0) - rect.top;
          const w = world.screenToWorld(sx, sy);
          const hit = world.hitTest(w.x, w.y);
          if (hit && hit.kind === "captured") return false;
        }
        return !event.ctrlKey && !event.button;
      })
      .on("zoom", (event) => {
        world.camera.k = event.transform.k;
        world.camera.x = event.transform.x;
        world.camera.y = event.transform.y;
      });
    selection.call(zoom);
    selection.call(
      zoom.transform,
      d3.zoomIdentity.translate(world.camera.x, world.camera.y).scale(world.camera.k),
    );

    // ── d3.drag ──────────────────────────────────────────────────────
    // Subject returns null for free cells — only entity-graph nodes
    // are draggable. Free cells respond to clicks (lock-on) instead.
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
        event.subject.fx = w.x;
        event.subject.fy = w.y;
        world.reheat(0.5);
      })
      .on("drag", (event) => {
        if (!event.subject) return;
        const w = world.screenToWorld(event.x, event.y);
        event.subject.fx = w.x;
        event.subject.fy = w.y;
      })
      .on("end", (event) => {
        if (!event.subject) return;
        event.subject.fx = null;
        event.subject.fy = null;
        draggingId = null;
      });
    selection.call(drag);

    // ── click → lock-on ──────────────────────────────────────────────
    // Custom click detection so a small zoom-pan doesn't fire a
    // spurious lock-on. 5px threshold separates click from drag/pan.
    let pointerDownAt: { x: number; y: number } | null = null;
    const onMouseDown = (e: MouseEvent) => {
      pointerDownAt = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e: MouseEvent) => {
      const start = pointerDownAt;
      pointerDownAt = null;
      if (!start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > 5) return; // it was a drag/pan
      if (world.traits.lockOnRange <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const w = world.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hit = world.hitTest(w.x, w.y);
      if (!hit || hit.kind !== "free") return;
      world.lockOn(hit, performance.now());
    };
    canvas.addEventListener("mousedown", onMouseDown, true);
    canvas.addEventListener("mouseup", onMouseUp, true);

    // ── hover (cursor feedback) ──────────────────────────────────────
    const onMove = (e: MouseEvent) => {
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
        // Crosshair when lock-on is available, even if target is out
        // of range — feedback comes from the click attempt.
        canvas.style.cursor = "crosshair";
      } else {
        canvas.style.cursor = "default";
      }
    };
    canvas.addEventListener("mousemove", onMove);

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

      drawBackground(ctx, width, height);
      ctx.save();
      applyCamera(ctx, world, dpr);
      drawEnvCA(ctx, world);
      drawBonds(ctx, world);
      drawBodies(ctx, world, hoveredId, draggingId);
      drawPredators(ctx, world);
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
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onMouseDown, true);
      canvas.removeEventListener("mouseup", onMouseUp, true);
      selection.on(".zoom", null).on(".drag", null);
      world.dispose();
    };
  }, [runId]);

  const restart = () => setRunId((r) => r + 1);

  const traitList = Array.from(stats.traits.active);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/40 px-2 py-1 font-mono text-[11px] leading-4 text-zinc-300 backdrop-blur">
        <div className="text-zinc-100">{formatDuration(stats.runDurationMs)} · peak {stats.peakCaptured}</div>
        <div>fps {stats.fps}</div>
        <div>frame {stats.ms} ms</div>
        <div>
          <span className="text-cyan-300">captured {stats.captured}</span>
          <span className="text-zinc-500"> / </span>
          <span className="text-zinc-400">free {stats.free}</span>
        </div>
        <div>bonds {stats.bonds}</div>
        <div className="text-cyan-500/70">CA {stats.liveCA}%</div>
        <div className={stats.predators > 0 ? "text-red-400" : "text-zinc-600"}>
          predators {stats.predators}
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 w-44 rounded bg-black/40 px-2 py-1 font-mono text-[11px] leading-4 text-zinc-300 backdrop-blur">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">traits</div>
        {traitList.length === 0 ? (
          <div className="text-zinc-600">— none yet —</div>
        ) : (
          traitList.map((id) => (
            <div key={id} className="flex justify-between">
              <span>{TRAIT_LABEL[id] ?? id}</span>
              <span className="text-zinc-500">×{stats.traits.levels[id as keyof typeof stats.traits.levels]}</span>
            </div>
          ))
        )}
        {stats.traits.lockOnRange > 0 && (
          <div className="mt-1 border-t border-zinc-700 pt-1 text-[10px] text-zinc-500">
            click prey to pull · {stats.lockOnReady ? "ready" : "cooling"}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/40 px-3 py-1 font-mono text-[10px] text-zinc-400 backdrop-blur">
        drag a captured cell · scroll to zoom · drag empty space to pan
      </div>

      {stats.runStatus !== "running" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`font-mono text-4xl font-semibold tracking-tight ${
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
            className="mt-2 rounded-full border border-zinc-600 px-6 py-2 font-mono text-sm text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Begin again →
          </button>
        </div>
      )}
    </div>
  );
}
