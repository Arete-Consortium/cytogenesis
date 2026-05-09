"use client";

import { useEffect, useState } from "react";
import { setTheme, THEMES, type ThemeId } from "@/data/themes";

const THEME_KEY = "cytogenesis:theme";

function PreviewChip({ svg, active }: { svg: string; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-sm ${
        active ? "opacity-100" : "opacity-60"
      }`}
      // SVG is authored by us in themes-*.ts; safe to inline.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

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
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
          active === "aquatic"
            ? "bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-300/40"
            : "text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300"
        }`}
      >
        <PreviewChip svg={THEMES.aquatic.previewSvg} active={active === "aquatic"} />
        Aquatic
      </button>
      <button
        type="button"
        onClick={() => choose("galactic")}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
          active === "galactic"
            ? "bg-violet-300/15 text-violet-200 ring-1 ring-violet-300/40"
            : "text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300"
        }`}
      >
        <PreviewChip svg={THEMES.galactic.previewSvg} active={active === "galactic"} />
        Galactic
      </button>
    </div>
  );
}
