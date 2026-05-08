"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { World } from "@/game/world";
import {
  drawBackground,
  drawBodies,
  drawBonds,
  drawPredators,
  drawSparkles,
  drawAmbientPlankton,
  drawTelegraphs,
  drawThumbstick,
  drawBossIndicator,
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
  /** Active combo chain length (sliding window). */
  comboCount: number;
  /** True while the combo buff is active (post-trigger window). */
  comboActive: boolean;
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
  const worldRef = useRef<World | null>(null);
  const [runId, setRunId] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
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

  const togglePause = () => {
    setPaused((p) => {
      const next = !p;
      if (worldRef.current) worldRef.current.paused = next;
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
    comboCount: 0,
    comboActive: false,
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
    worldRef.current = world;
    setPaused(false);
    let hoveredId: string | null = null;
    let draggingId: string | null = null;

    // 1:1 canvas — DPR scaling caused screen-space draws (drawBackground
    // etc.) to only fill 1/dpr of the internal canvas on iPhone DPR=2,
    // creating a "dark box" in the upper-left quadrant while motion
    // trails accumulated everywhere else. Trading some retina sharpness
    // for a guaranteed-correct render is the right call for a particle
    // game.
    const dpr = 1;
    let width = 0;
    let height = 0;

    // Thumbstick state — declared up-front so updateStickAnchor (called
    // from resize on mount) can safely read pointerDownAt without
    // tripping the TDZ.
    // Uncle-Grandpa-style controller: 110px base, 50px knob.
    const STICK_RADIUS = 50; // max knob deflection from anchor
    const STICK_ZONE_RADIUS = 90; // forgiving touch around the base
    const TAP_THRESHOLD = 6;
    const ANCHOR_OFFSET = 95;
    const activePointers = new Set<number>();
    let pointerDownAt: { x: number; y: number; pointerId: number; isStick: boolean } | null = null;

    const updateStickAnchor = () => {
      // Anchor in CSS pixels relative to canvas. Use the live canvas
      // client dimensions (not cached `height`) to be robust against
      // resize-timing issues that put the stick mid-screen.
      const ax = ANCHOR_OFFSET;
      const ay = canvas.clientHeight - ANCHOR_OFFSET;
      world.stickAnchor = { x: ax, y: ay };
      if (!pointerDownAt || !pointerDownAt.isStick) {
        world.stickKnob = { x: ax, y: ay };
      }
    };

    const clearStickInput = () => {
      if (world.stickAnchor) {
        world.stickKnob = { x: world.stickAnchor.x, y: world.stickAnchor.y };
      }
      world.stickInput = null;
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      // Internal canvas dims = CSS dims (1:1, no DPR scaling).
      canvas.width = Math.floor(width);
      canvas.height = Math.floor(height);
      world.setViewport(width, height);
      if (world.camera.x === 0 && world.camera.y === 0) {
        // Snap camera to center on first sizing so the lerp doesn't
        // visibly start from (0,0).
        world.camera.x = width / 2;
        world.camera.y = height / 2;
      }
      updateStickAnchor();
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

    // ── thumbstick + tap (anchored bottom-left, single input model) ──
    // Stick anchor + clearStickInput were declared up-top before resize
    // so updateStickAnchor can reference pointerDownAt safely.
    const onPointerDown = (e: PointerEvent) => {
      audio.init();
      if (showTutorial) dismissTutorial();
      activePointers.add(e.pointerId);
      if (activePointers.size > 1) {
        clearStickInput();
        pointerDownAt = null;
        return;
      }
      if (!e.isPrimary) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // Did the touch land inside the stick zone?
      const anchor = world.stickAnchor ?? { x: ANCHOR_OFFSET, y: height - ANCHOR_OFFSET };
      const dxA = sx - anchor.x;
      const dyA = sy - anchor.y;
      const inStickZone = Math.hypot(dxA, dyA) <= STICK_ZONE_RADIUS;
      pointerDownAt = { x: sx, y: sy, pointerId: e.pointerId, isStick: inStickZone };
      if (inStickZone) {
        // Engage stick — knob jumps to finger (clamped).
        const len = Math.hypot(dxA, dyA);
        let kx = sx;
        let ky = sy;
        if (len > STICK_RADIUS) {
          kx = anchor.x + (dxA / len) * STICK_RADIUS;
          ky = anchor.y + (dyA / len) * STICK_RADIUS;
        }
        world.stickKnob = { x: kx, y: ky };
        if (len > 0.5) {
          const t = Math.min(1, len / STICK_RADIUS);
          world.stickInput = { ux: dxA / len, uy: dyA / len, t };
        }
        world.reheat(0.4);
      }
    };
    const onPointerMoveStick = (e: PointerEvent) => {
      if (!pointerDownAt || pointerDownAt.pointerId !== e.pointerId) return;
      if (activePointers.size > 1) return;
      if (!pointerDownAt.isStick) return; // tap path — ignore movement
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const anchor = world.stickAnchor!;
      const dx = sx - anchor.x;
      const dy = sy - anchor.y;
      const len = Math.hypot(dx, dy);
      let kx = sx;
      let ky = sy;
      if (len > STICK_RADIUS) {
        kx = anchor.x + (dx / len) * STICK_RADIUS;
        ky = anchor.y + (dy / len) * STICK_RADIUS;
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
        clearStickInput();
        return;
      }
      pointerDownAt = null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const moved = Math.hypot(sx - start.x, sy - start.y);
      const wasStick = start.isStick;
      clearStickInput();
      if (wasStick) return; // stick gestures don't fire taps
      if (moved > TAP_THRESHOLD) return;
      if (world.traits.lockOnRange <= 0) return;
      const w = world.screenToWorld(sx, sy);
      const hit = world.hitTest(w.x, w.y);
      if (!hit) return;
      const now = performance.now();
      if (hit.kind === "predator") world.fireStinger(hit, now);
      else if (hit.kind === "free") world.lockOn(hit, now);
    };
    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      pointerDownAt = null;
      clearStickInput();
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

      // Self-heal viewport: iOS Safari changes clientHeight when the
      // address bar collapses without always firing resize. If our
      // cached dims drift, bg fill only covers the stale region and
      // the rest of the canvas accumulates motion-trail garbage from
      // free cells. Re-resize when we detect drift.
      if (
        canvas.clientWidth !== width ||
        canvas.clientHeight !== height
      ) {
        resize();
      }

      world.tick(dt);
      world.captureNearby();

      // Reset transform to identity + clear the entire canvas. With
      // 1:1 sizing this guarantees no leftover pixels from the
      // previous frame in any region. drawBackground then paints the
      // ocean fill on top of the cleared canvas.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBackground(ctx, width, height, world.tickN, world.biomeStage);
      drawAmbientPlankton(ctx, width, height, world.tickN);
      ctx.save();
      applyCamera(ctx, world, dpr);
      // Env CA underlay disabled — was creating rectangular dark
      // artifacts on some devices. CA logic still drives spawn
      // density.
      drawBonds(ctx, world);
      drawBodies(ctx, world, hoveredId, draggingId);
      drawPredators(ctx, world);
      drawSparkles(ctx, world);
      ctx.restore();
      // Screen-space overlays: telegraph arrows, boss indicator, thumbstick.
      drawTelegraphs(ctx, world, width, height);
      drawBossIndicator(ctx, world, width, height);
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
            audio.transcend();
            queueToast(`DEPTH ${ev.slice("biome:".length)}`);
          }
          else if (typeof ev === "string" && ev.startsWith("evolve:")) {
            audio.transcend();
            queueToast(`EVOLVED · STAGE ${ev.slice("evolve:".length)}`);
          }
          else if (ev === "combo") {
            audio.lockOn();
            queueToast("COMBO");
          }
          else if (ev === "killPred") {
            audio.hit();
          }
          else if (ev === "bossSpawn") {
            audio.telegraph();
            queueToast("BOSS · INCOMING");
          }
          else if (ev === "killBoss") {
            audio.transcend();
            queueToast("BOSS DEFEATED");
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
            bonds: world.totalAbsorbed,
          }).then(setBestResult);
        }
        setStats({
          fps: Math.round(fpsAccum / elapsed),
          ms: Math.round(frameMs * 100) / 100,
          tick,
          captured: world.totalAbsorbed,
          free: counts.free,
          bonds: world.totalAbsorbed,
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
          comboCount: world.comboChain(),
          comboActive: world.wallMs < world.comboActiveUntilMs,
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
      {/* Top-right: timer (small), captured count, trait chips. */}
      <div
        className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1.5 font-mono text-[11px] text-zinc-300/90"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          right: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          {formatDuration(stats.runDurationMs)}
        </div>
        <div className="text-zinc-200">
          <span className="text-cyan-300">{stats.captured}</span>
          <span className="text-zinc-600"> absorbed</span>
        </div>
        {(stats.comboActive || stats.comboCount >= 2) && (
          <div
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
              stats.comboActive
                ? "bg-amber-300/15 text-amber-200 ring-1 ring-amber-300/40"
                : "bg-cyan-300/10 text-cyan-200/85 ring-1 ring-cyan-300/25"
            }`}
          >
            {stats.comboActive ? "BUFF" : `×${stats.comboCount}`}
          </div>
        )}
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

      {/* Pause toggle — first slot from back link. */}
      <button
        onClick={togglePause}
        aria-label={paused ? "Resume" : "Pause"}
        className="absolute z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-zinc-200 backdrop-blur transition-colors hover:bg-black/65 active:bg-black/80"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          right: "calc(max(0.5rem, env(safe-area-inset-right)) + 3.25rem)",
        }}
      >
        {paused ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        )}
      </button>

      {/* Paused overlay. */}
      {paused && (
        <button
          onClick={togglePause}
          className="absolute inset-0 z-35 flex items-center justify-center bg-black/55 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2">
            <div className="font-mono text-2xl uppercase tracking-[0.4em] text-zinc-200">paused</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">tap to resume</div>
          </div>
        </button>
      )}

      {/* Mute toggle — second slot. */}
      <button
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-zinc-200 backdrop-blur transition-colors hover:bg-black/65 active:bg-black/80"
        style={{
          top: "max(0.5rem, env(safe-area-inset-top))",
          right: "calc(max(0.5rem, env(safe-area-inset-right)) + 6rem)",
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
