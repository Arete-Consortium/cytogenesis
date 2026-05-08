"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { World } from "@/game/world";
import {
  drawBackground,
  drawBodies,
  drawBonds,
  drawEnvCA,
  drawLockOnTracers,
  drawPredators,
  drawSparkles,
  drawAmbientPlankton,
  drawTelegraphs,
  drawThumbstick,
  applyCamera,
} from "@/game/render";
import type { TraitState } from "@/game/traits";
import { emptyTraitState } from "@/game/traits";
import { audio } from "@/lib/audio";
import { recordRun, type BestRun } from "@/meta/persist";
import { setTheme, type ThemeId } from "@/data/themes";

const MUTE_KEY = "cytogenesis:muted";
const TUTORIAL_KEY = "cytogenesis:tutorialSeen";
const THEME_KEY = "cytogenesis:theme";

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
  /** True only after the slow-mo transition finishes — overlay can show. */
  overlayReady: boolean;
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

interface Toast {
  id: number;
  text: string;
  expiresAt: number;
}

let nextToastId = 1;

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [runId, setRunId] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMuted] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [bestResult, setBestResult] = useState<{ best: BestRun | null; isNewBest: boolean }>(
    { best: null, isNewBest: false },
  );
  const hasRecordedRef = useRef(false);

  // Initialize mute + tutorial + theme from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = localStorage.getItem(MUTE_KEY) === "1";
    setMuted(m);
    audio.setMuted(m);
    setShowTutorial(localStorage.getItem(TUTORIAL_KEY) !== "1");
    const saved = localStorage.getItem(THEME_KEY) as ThemeId | null;
    setTheme(saved === "galactic" ? "galactic" : "aquatic");
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      audio.setMuted(next);
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  const dismissTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem(TUTORIAL_KEY, "1");
    } catch {
      /* private mode */
    }
  };
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
    overlayReady: false,
  });

  // Helper accessible inside the rAF loop to push a centered toast.
  const queueToast = (text: string) => {
    const toast: Toast = {
      id: nextToastId++,
      text,
      expiresAt: performance.now() + 1700,
    };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 1700);
  };

  useEffect(() => {
    setToasts([]);
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

    // ── thumbstick + tap (single input model) ────────────────────────
    // pointerdown anywhere anchors a virtual stick at the touch point.
    // Drag the knob → bell swims in that direction with magnitude
    // proportional to deflection. Released-without-movement (≤6px) is
    // a tap; taps on a free cell fire lock-on (when trait active).
    // Pinch zoom still works via d3.zoom on touch events; multi-touch
    // here cancels the stick.
    const STICK_RADIUS = 50;
    const TAP_THRESHOLD = 6;
    const activePointers = new Set<number>();
    let pointerDownAt: { x: number; y: number; pointerId: number } | null = null;

    const clearStick = () => {
      world.stickAnchor = null;
      world.stickKnob = null;
      world.stickInput = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      // First user gesture also unlocks the audio context.
      audio.init();
      // Tutorial dismisses on the first real touch (whether or not it
      // produces motion — touching the canvas is the gesture).
      if (showTutorial) dismissTutorial();
      activePointers.add(e.pointerId);
      if (activePointers.size > 1) {
        clearStick();
        pointerDownAt = null;
        return;
      }
      if (!e.isPrimary) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      pointerDownAt = { x: sx, y: sy, pointerId: e.pointerId };
      world.stickAnchor = { x: sx, y: sy };
      world.stickKnob = { x: sx, y: sy };
      world.stickInput = null;
      world.reheat(0.4);
    };
    const onPointerMoveStick = (e: PointerEvent) => {
      if (!pointerDownAt || pointerDownAt.pointerId !== e.pointerId) return;
      if (activePointers.size > 1) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const dx = sx - pointerDownAt.x;
      const dy = sy - pointerDownAt.y;
      const len = Math.hypot(dx, dy);
      let kx = sx;
      let ky = sy;
      if (len > STICK_RADIUS) {
        kx = pointerDownAt.x + (dx / len) * STICK_RADIUS;
        ky = pointerDownAt.y + (dy / len) * STICK_RADIUS;
      }
      world.stickKnob = { x: kx, y: ky };
      if (len > 0.5) {
        const t = Math.min(1, len / STICK_RADIUS);
        world.stickInput = { ux: dx / len, uy: dy / len, t };
      } else {
        world.stickInput = null;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      const start = pointerDownAt;
      if (!start || start.pointerId !== e.pointerId) {
        clearStick();
        return;
      }
      pointerDownAt = null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const moved = Math.hypot(sx - start.x, sy - start.y);
      clearStick();
      if (moved > TAP_THRESHOLD) return;
      if (world.traits.lockOnRange <= 0) return;
      const w = world.screenToWorld(sx, sy);
      const hit = world.hitTest(w.x, w.y);
      if (!hit || hit.kind !== "free") return;
      world.lockOn(hit, performance.now());
    };
    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      pointerDownAt = null;
      clearStick();
    };
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMoveStick, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", onPointerCancel, true);

    const onContext = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", onContext);

    // ── hover cursor (mouse only) ────────────────────────────────────
    const onHoverCursor = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = world.screenToWorld(sx, sy);
      const hit = world.hitTest(w.x, w.y);
      hoveredId = hit?.id ?? null;
      if (hit && hit.kind === "free" && world.traits.lockOnRange > 0) {
        canvas.style.cursor = "crosshair";
      } else if (pointerDownAt) {
        canvas.style.cursor = "grabbing";
      } else {
        canvas.style.cursor = "default";
      }
    };
    canvas.addEventListener("pointermove", onHoverCursor);

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
      drawLockOnTracers(ctx, world);
      drawBodies(ctx, world, hoveredId, draggingId);
      drawPredators(ctx, world);
      drawSparkles(ctx, world);
      ctx.restore();
      // Screen-space overlays: telegraph arrows, thumbstick.
      drawTelegraphs(ctx, world, width, height);
      drawThumbstick(ctx, world);

      // Drain world events → audio + trait toasts.
      if (world.events.length > 0) {
        for (const ev of world.events) {
          if (ev === "capture") audio.capture();
          else if (ev === "hit") audio.hit();
          else if (ev === "lockOn") audio.lockOn();
          else if (ev === "telegraph") audio.telegraph();
          else if (ev === "transcend") audio.transcend();
          else if (ev === "death") audio.death();
          else if (typeof ev === "string" && ev.startsWith("trait:")) {
            audio.trait();
            const id = ev.slice("trait:".length);
            queueToast(TRAIT_LABEL[id]?.toUpperCase() ?? id.toUpperCase());
          }
          else if (typeof ev === "string" && ev.startsWith("biome:")) {
            audio.transcend(); // re-use the chord — feels milestone-y
            queueToast(`DEPTH ${ev.slice("biome:".length)}`);
          }
          else if (ev === "combo") {
            audio.lockOn(); // bright zap — combo earned
            queueToast("COMBO");
          }
        }
        world.events.length = 0;
      }

      if (t - lastStatPush >= 250) {
        const elapsed = (t - lastStatPush) / 1000;
        const counts = world.countByKind();
        const ended = world.runEndedAtMs ?? world.wallMs;
        const overlayReady =
          world.runStatus !== "running" &&
          world.runEndedAtMs != null &&
          world.wallMs - world.runEndedAtMs >= 800;
        // First time the overlay becomes ready, persist the run + record best.
        if (overlayReady && !hasRecordedRef.current) {
          hasRecordedRef.current = true;
          recordRun({
            peakCaptured: world.peakCaptured,
            durationMs: world.runEndedAtMs ?? world.wallMs,
            bonds: world.bonds.length,
          }).then(setBestResult);
        }
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
          predators: world.predators.length + world.telegraphs.length,
          runStatus: world.runStatus,
          runDurationMs: ended,
          peakCaptured: world.peakCaptured,
          overlayReady,
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
      canvas.removeEventListener("pointermove", onHoverCursor);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMoveStick, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerCancel, true);
      canvas.removeEventListener("contextmenu", onContext);
      selection.on(".zoom", null).on(".drag", null);
      world.dispose();
    };
  }, [runId]);

  const restart = () => {
    hasRecordedRef.current = false;
    setBestResult({ best: null, isNewBest: false });
    setRunId((r) => r + 1);
  };

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

      {/* Near-death warning: pulsing red vignette when stripped to core. */}
      {stats.captured === 1 && stats.runStatus === "running" && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-vignette-pulse" />
      )}

      {/* Predator warning: only when one is on the field. */}
      {stats.predators > 0 && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.2em] text-red-400/80"
          style={{ top: "calc(max(0.5rem, env(safe-area-inset-top)) + 0.25rem)" }}
        >
          predator · {stats.predators}
        </div>
      )}

      {/* Bottom hint — fades after the player has bonded a couple cells. */}
      {stats.captured < 3 && (
        <div
          className="pointer-events-none absolute bottom-2 left-1/2 max-w-[92vw] -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-center font-mono text-[10px] text-zinc-200/85 backdrop-blur-sm transition-opacity"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <span className="hidden sm:inline">touch + drag to swim · click prey to pull · scroll to zoom</span>
          <span className="sm:hidden">touch + drag to swim · pinch to zoom</span>
        </div>
      )}

      {stats.overlayReady && (
        <div className="absolute inset-0 z-40 flex animate-fadein flex-col items-center justify-center gap-6 bg-black/70 px-6 backdrop-blur-sm">
          <div
            className={`font-mono text-3xl font-semibold tracking-[0.3em] sm:text-4xl ${
              stats.runStatus === "transcended" ? "text-cyan-300" : "text-red-400"
            }`}
          >
            {stats.runStatus === "transcended" ? "TRANSCENDED" : "CONSUMED"}
          </div>
          {bestResult.isNewBest && (
            <div className="rounded-full bg-amber-300/15 px-4 py-1 font-mono text-[11px] uppercase tracking-[0.3em] text-amber-200 ring-1 ring-amber-300/40">
              new best
            </div>
          )}
          {!bestResult.isNewBest && bestResult.best && (
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              best {bestResult.best.peakCaptured} · {formatDuration(bestResult.best.durationMs)}
            </div>
          )}
          <div className="grid grid-cols-3 gap-6 font-mono text-center">
            <div>
              <div className="text-2xl text-zinc-100">{stats.peakCaptured}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">peak</div>
            </div>
            <div>
              <div className="text-2xl text-zinc-100">{formatDuration(stats.runDurationMs)}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">time</div>
            </div>
            <div>
              <div className="text-2xl text-zinc-100">{stats.bonds}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">bonds</div>
            </div>
          </div>
          {traitList.length > 0 && (
            <div className="flex max-w-xs flex-wrap justify-center gap-1.5">
              {traitList.map((id) => (
                <span
                  key={id}
                  className="rounded-full bg-cyan-300/10 px-2.5 py-1 font-mono text-[11px] text-cyan-200/90 ring-1 ring-cyan-300/25"
                >
                  {TRAIT_LABEL[id] ?? id}
                  <span className="ml-1 text-cyan-200/55">
                    ×{stats.traits.levels[id as keyof typeof stats.traits.levels]}
                  </span>
                </span>
              ))}
            </div>
          )}
          <button
            onClick={restart}
            className="mt-2 inline-flex h-12 min-w-[200px] items-center justify-center rounded-full border border-zinc-600 px-6 font-mono text-sm text-zinc-100 transition-colors hover:bg-zinc-800 active:bg-zinc-900"
          >
            Begin again →
          </button>
        </div>
      )}

      {/* Mute toggle — small icon button next to back link. */}
      <button
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-zinc-200 backdrop-blur transition-colors hover:bg-black/65 active:bg-black/80"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          right: "calc(max(0.5rem, env(safe-area-inset-right)) + 3.25rem)",
        }}
      >
        {muted ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      {/* First-run tutorial — pulsing prompt, dismissed on first touch. */}
      {showTutorial && stats.runStatus === "running" && (
        <div className="pointer-events-none absolute inset-0 z-15 flex items-end justify-center pb-32 sm:pb-40">
          <div className="animate-tutorial-pulse rounded-2xl border border-cyan-300/40 bg-black/40 px-6 py-4 text-center font-mono text-xs uppercase tracking-[0.2em] text-cyan-200 backdrop-blur-sm">
            <div>drag anywhere to swim</div>
            <div className="mt-1 text-[10px] tracking-[0.15em] text-zinc-400 normal-case">
              tap prey when sensors lock on
            </div>
          </div>
        </div>
      )}

      {/* Trait-unlock toasts — fade in/out, centered. */}
      {toasts.length > 0 && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="animate-trait-toast rounded-full bg-black/55 px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-cyan-200 backdrop-blur-sm ring-1 ring-cyan-300/25"
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
