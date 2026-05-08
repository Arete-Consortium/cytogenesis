"use client";

import { useEffect, useState } from "react";
import { setTheme, type ThemeId } from "@/data/themes";

const THEME_KEY = "cytogenesis:theme";

export default function ThemePicker() {
  const [active, setActive] = useState<ThemeId>("aquatic");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(THEME_KEY) as ThemeId | null;
    const id: ThemeId = saved === "galactic" ? "galactic" : "aquatic";
    setTheme(id);
    // SSR-safe hydration: mirror localStorage into React state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(id);
  }, []);

  const choose = (id: ThemeId) => {
    setTheme(id);
    setActive(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* private mode */
    }
  };

  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em]">
      <button
        type="button"
        onClick={() => choose("aquatic")}
        className={`rounded-full px-4 py-2 transition-colors ${
          active === "aquatic"
            ? "bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-300/40"
            : "text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300"
        }`}
      >
        Aquatic
      </button>
      <button
        type="button"
        onClick={() => choose("galactic")}
        className={`rounded-full px-4 py-2 transition-colors ${
          active === "galactic"
            ? "bg-violet-300/15 text-violet-200 ring-1 ring-violet-300/40"
            : "text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300"
        }`}
      >
        Galactic
      </button>
    </div>
  );
}
