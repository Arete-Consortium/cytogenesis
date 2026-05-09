"use client";

import { useEffect, useState } from "react";
import { setTheme, THEMES, type ThemeId } from "@/data/themes";

const THEME_KEY = "cytogenesis:theme";
const VALID_THEMES: readonly ThemeId[] = ["aquatic", "galactic", "sushi", "yokai"] as const;

function isThemeId(s: string | null): s is ThemeId {
  return s !== null && (VALID_THEMES as readonly string[]).includes(s);
}

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

const SLOTS: { id: ThemeId; label: string; ringActive: string; textActive: string }[] = [
  { id: "aquatic", label: "Aquatic", ringActive: "ring-cyan-300/40 bg-cyan-300/15", textActive: "text-cyan-200" },
  { id: "galactic", label: "Galactic", ringActive: "ring-violet-300/40 bg-violet-300/15", textActive: "text-violet-200" },
  { id: "sushi", label: "Sushi", ringActive: "ring-amber-300/40 bg-amber-300/15", textActive: "text-amber-200" },
  { id: "yokai", label: "Yokai", ringActive: "ring-pink-300/40 bg-pink-300/15", textActive: "text-pink-200" },
];

export default function ThemePicker() {
  const [active, setActive] = useState<ThemeId>("aquatic");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(THEME_KEY);
    const id: ThemeId = isThemeId(saved) ? saved : "aquatic";
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
    <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em]">
      {SLOTS.map((slot) => {
        const isActive = active === slot.id;
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => choose(slot.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
              isActive
                ? `${slot.ringActive} ${slot.textActive} ring-1`
                : "text-zinc-500 ring-1 ring-zinc-700 hover:text-zinc-300"
            }`}
          >
            <PreviewChip svg={THEMES[slot.id].previewSvg} active={isActive} />
            {slot.label}
          </button>
        );
      })}
    </div>
  );
}
