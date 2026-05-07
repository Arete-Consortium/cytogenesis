@AGENTS.md

# Cytogenesis — Claude Code instructions

> Project-specific instructions. Repo-level overrides global guidance.

## Project

**Cytogenesis** (working title) — roguelike cellular-automation game. You pilot a single mobile core node through a primordial sea (or proto-galactic medium); free-floating cells get captured by colliding with your graph and bond in via force-link edges. Adjacency between captured nodes runs a local-rule trait CA that produces emergent abilities. Background environmental CA drives prey/predator distribution.

Plan: `~/projects/notes/ideas/cellular-game-plan.md`. Two themes (aquatic / galactic), two CA layers (environmental + trait), Next.js + d3 + Canvas, roguelike with meta-progression.

## Stack

- Next.js 16 (App Router, Turbopack default) + TypeScript + Tailwind 4
- React 19.2
- d3 (force, drag, zoom) for entity-graph physics — ported from `aurora-arcology/src/components/BoardView.tsx`
- Canvas 2D for rendering (NOT SVG — needs to scale to ~1k free cells)
- Custom velocity integrator + quadtree for free agents (d3-force is too heavy at that body count)
- Zustand for live game state, idb for persistent meta-progression
- Vitest + jsdom for unit tests; Playwright deferred to phase 6+

## Next 16 gotchas

- `params` / `searchParams` / `cookies()` / `headers()` are ALL Promises now (no sync access). Doesn't affect game pages (no params), but watch out if you add dynamic routes.
- Turbopack is default for `next dev` and `next build`. Don't add a custom `webpack` config — it'll fail the build.
- `middleware` is now called `proxy` (matters only if we ever add one).

## File map (target — populates over phases)

```
src/
├── app/
│   ├── page.tsx          # title + theme picker + start
│   ├── play/page.tsx     # in-game canvas (Phase 0+)
│   └── meta/page.tsx     # run history + unlocks (Phase 7)
├── components/
│   ├── GameCanvas.tsx    # rAF loop driver
│   ├── HUD.tsx           # FPS, score, traits
│   ├── ThemePicker.tsx   # aquatic / galactic
│   └── RunSummary.tsx
├── game/
│   ├── world.ts          # World class
│   ├── entity.ts         # graph + d3-force sim
│   ├── capture.ts        # capture-radius, bond formation
│   ├── traits.ts         # trait CA
│   ├── agents.ts         # free cells (prey/neutral/predator)
│   ├── envCA.ts          # environmental CA
│   ├── quadtree.ts       # spatial hash
│   └── render.ts         # canvas draws
├── data/
│   ├── nodeTypes.ts
│   ├── adjacencyRules.ts
│   ├── biomes.ts
│   └── themes.ts
├── meta/
│   ├── store.ts          # zustand
│   ├── persist.ts        # idb
│   └── unlocks.ts
└── lib/
    └── rng.ts            # seeded PRNG
tests/
├── unit/
└── e2e/                  # Phase 6+
```

## Conventions

### Themes are paint, not logic
Theme is a palette + glyph + label map over `NodeTypeId`. NEVER branch game logic on theme. If you find yourself writing `if (theme === 'aquatic')` in `src/game/`, stop — push the variation into `src/data/themes.ts`.

### Theme-agnostic node types
Node-type IDs are theme-neutral (`propulsion`, `sensor`, `membrane`, `mouth`, `stinger`, `chloroplast`, `mitochondrion`, `spore`, `core`). The aquatic theme renders `propulsion` as flagellum; galactic renders it as thruster. Same id, different paint.

### Physics layer separation
- **Entity graph** (≤80 nodes) → d3-force sim, bond edges via `forceLink`
- **Free agents** (~500–1000 cells) → custom velocity integrator + quadtree spatial hash
- **Environmental CA** → fixed 128×128 grid, ticks at 4Hz independent of render rate
- **Trait CA** → recomputed only on graph mutation (capture / loss), not per frame

Don't mix these. Putting world cells into d3-force will tank perf above ~200 bodies.

### Render
- Canvas 2D, single context, layered draws (env-CA underlay → free agents → entity edges → entity nodes → HUD overlay)
- All world coords; mouse events convert via inverse zoom transform
- No SVG anywhere except optional HUD glyphs (then static `<svg>` only)

### Determinism
- Seeded PRNG (`src/lib/rng.ts`) for everything stochastic. Seed is part of `RunState` and surfaced in run summary so bug reports are reproducible.
- Time is measured in ticks, not wallclock, inside game logic. The rAF loop owns wallclock.

### State
- `zustand` store holds live run state. Render reads, game logic writes.
- `idb` (via `idb` package) holds persistent unlocks. Schema versioned; migrate or prompt-to-wipe on version change.

## Don't

- Don't add backend / API routes / server actions — game is fully client-side.
- Don't use SVG for game rendering. Canvas only.
- Don't put free agents into d3-force.
- Don't branch game logic on theme.
- Don't recompute trait CA on every frame — only on graph mutation.
- Don't hardcode adjacency rules in component files; they live in `src/data/adjacencyRules.ts`.
- Don't ship un-seeded RNG. Every random call goes through `src/lib/rng.ts`.

## Phase tracker

- [x] Phase 0 — scaffold, canvas, rAF loop, FPS HUD
- [x] Phase 1 — port d3 drag/zoom from aurora-arcology, single core node + 5 free cells
- [x] Phase 2 — capture + graph growth (collision → bond, gradient bond render)
- [x] Phase 3 — free-agent population (~200) + quadtree + custom integrator + arena wrap + respawn
- [x] Phase 4 — environmental CA (Conway B3/S23 @ 4Hz, 128² toroidal, capture respawn biased to live zones)
- [x] Phase 5 — trait CA + abilities (propulsion → autonomous swim, mouth → wide capture, sensor+stinger → click-to-pull lock-on)
- [x] Phase 6 — predators (CA-dead-zone spawn, recoil after hit) + prune cascade + transcend@80 / death + run timer + restart
- [ ] Phase 7 — meta-progression (idb)
- [ ] Phase 8 — both themes
- [ ] Phase 9 — polish (Lenia, audio, mobile)

MVP = Phases 0–6. Don't skip phases.
