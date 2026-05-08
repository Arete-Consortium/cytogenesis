"use client";

import { useEffect, useState } from "react";
import { loadBest, type BestRun } from "@/meta/persist";

export default function TitleStats() {
  const [best, setBest] = useState<BestRun | null>(null);
  useEffect(() => {
    void loadBest().then(setBest);
  }, []);
  if (!best) return null;
  const m = Math.floor(best.durationMs / 60000);
  const s = Math.floor((best.durationMs / 1000) % 60)
    .toString()
    .padStart(2, "0");
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">
      best · peak {best.peakCaptured} · {m}:{s}
    </div>
  );
}
