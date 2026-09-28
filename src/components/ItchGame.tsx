"use client";

import { useState } from "react";
import GameCanvas from "./GameCanvas";
import ThemePicker from "./ThemePicker";
import TitleStats from "./TitleStats";

// itch.io hosts each upload under an unknown directory. Keep this edition on
// one document so neither routing nor reloads escape that directory.
export default function ItchGame() {
  const [playing, setPlaying] = useState(false);
  if (playing) return (
    <div className="play-shell relative flex flex-col">
      <button aria-label="Back to title" onClick={() => setPlaying(false)}
        className="absolute right-2 top-2 z-30 h-11 rounded-full bg-black/50 px-3 font-mono text-xs text-zinc-200">
        ← back
      </button>
      <GameCanvas />
    </div>
  );
  return (
    <main className="flex h-dvh overflow-y-auto flex-col items-center gap-6 px-6 py-8 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-cyan-300">Early playtest · v0.1</p>
      <h1 className="text-4xl font-semibold text-zinc-100">Cytogenesis</h1>
      <p className="max-w-md text-sm text-zinc-400">Drift. Capture. Evolve. Grow your living colony and survive the predators.</p>
      <ThemePicker />
      <button onClick={() => setPlaying(true)} className="h-12 min-w-[200px] rounded-full border border-zinc-600 px-8 text-zinc-100 hover:bg-zinc-800">Begin →</button>
      <p className="max-w-md text-xs text-zinc-400">WASD / arrow keys or drag the bottom-left stick to move. Absorb free cells; avoid predators. Evolve at 6 cells and transcend at 80, then keep surviving. Space / Attack fires once sensor + stinger unlock it. Esc pauses.</p>
      <TitleStats />
      <p className="max-w-md text-xs text-zinc-500">After your run, leave an itch.io comment: what was fun, what was confusing, and your best size. Progress saves in this browser when storage is available.</p>
    </main>
  );
}
