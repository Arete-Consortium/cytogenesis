/**
 * Galactic skin v0 — preview SVG only. Override draw functions land in
 * a follow-up commit (UFO + alien craft + alien dreadnought serpent).
 * Until then galactic falls back to the default abstract bell visuals,
 * tinted with the violet/amber palette already defined in themes.ts.
 */

export const galacticPreviewSvg = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="g-dome" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#f5f0ff" />
      <stop offset="100%" stop-color="#a78bfa" />
    </radialGradient>
  </defs>
  <ellipse cx="16" cy="20" rx="12" ry="3.5" fill="#5b21b6" />
  <ellipse cx="16" cy="19" rx="12" ry="2" fill="#a78bfa" />
  <ellipse cx="16" cy="14" rx="6" ry="5" fill="url(#g-dome)" />
  <circle cx="6" cy="20" r="0.9" fill="#fbbf24" />
  <circle cx="11" cy="20.6" r="0.9" fill="#fbbf24" />
  <circle cx="16" cy="20.8" r="0.9" fill="#fbbf24" />
  <circle cx="21" cy="20.6" r="0.9" fill="#fbbf24" />
  <circle cx="26" cy="20" r="0.9" fill="#fbbf24" />
</svg>`.trim();
