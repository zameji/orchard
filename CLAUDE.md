# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Orchard Fieldwork — Pruning Studio: an interactive 3D tree-pruning simulator and teaching tool for apple, cherry, and peach training systems. The app source is a single self-contained HTML file in `src/`, named for its release version (`src/v0_1_0.html` = v0.1.0). A minified `dist/index.html` is generated from it and committed; that is the GitHub Pages artifact.

## Commands

- `npm install` — install dev tooling (also installs the git hooks via husky).
- `npm run build` — minify `src/*.html` (exactly one) to `dist/index.html` (`build.mjs`, html-minifier-terser).
- `npm run lint` — ESLint 9 flat config over source and inline module JS (`eslint-plugin-html`).
- `npm run format` / `npm run format:check` — Prettier write/check (dist and node_modules ignored).

There is no test suite. To validate a source change: `npm run lint`, `npm run build`, then syntax-check the extracted inline module (`node --check`) and open `dist/index.html` in a WebGL 2 browser (Three.js loads from jsDelivr, so first load needs network).

## Pre-commit hook

`.husky/pre-commit` runs lint-staged (eslint --fix + prettier on staged files), then `npm run build`, then stages `dist/`. Every commit therefore carries an in-sync minified artifact — never edit `dist/` by hand, and expect its diff to be unreadable (see `docs/adrs/0001-minified-committed-dist.md`).

## Repository layout

- `src/` — source of truth, one versioned HTML file with inline JS/CSS and an import map pinning Three.js.
- `dist/` — generated, committed minified output (`dist/index.html`), deployed by `.github/workflows/deploy.yml` on push to main.
- `build.mjs` — build glue: globs exactly one `src/*.html`, minifies, writes `dist/index.html`.

## Architecture

Everything is plain data + derived model + display, in that order. Keep the layers one-directional: display never feeds back into simulation state.

- **Determinism** (`mulberry32`, `noise`): all bud, fruit, and foliage placement comes from stateless `noise(seed, edgeId, channel)` draws, never from a running RNG. This keeps bud sites stable across cut preview, undo, and redraw. Any new visual randomness must use this pattern with a distinct channel constant.
- **Tree state `T`** (`append`/`fresh`): plain-data edge list in parent-before-child order; each edge is one annual extension with rest direction `d`, role (`leader`/`scaffold`/`sprout`), `born`, `head` (heading year), `release` (collar-cut year). Rest directions never accumulate display deformation — sag is recomputed each `derive`.
- **Derived model `M`** (`derive`): pure function `T → M` computing geometry (pipe-model radii, fruit-load sag, parent-shape inheritance), light, per-edge crop (`crop`/`potential`), flaw flags (`narrow`, `rival`, `inward`, `cross` via `findCrossings`), and aggregate canopy score. Pruning preview works by building a hypothetical `T` and calling `derive` on it — no special-case display path.
- **Year advance** (`advance`): one season of growth. Competing bud "bids" share a finite whole-tree extension budget; heading a shoot spawns watersprouts (`s.head`), removal of a whole branch sets `release` on the parent union. Over-pruning past `budget()` (0.27, peach 0.32) adds stress and watersprout surge.
- **Light** (`exposures`): sun-aligned depth sweep depositing optical depth into projected cells; three seasonal sun positions averaged into `q.light`. Independent of foliage display — do not couple it to rendered leaf instances.
- **Pruning loop**: `pick` (screen-space capsule picking) → `propose` → `cutPlan` (forks `T`, derives the hypothetical model) → `assess` (grades light/structure/balance/damage to a 0–100 cut score) → `confirmCut`/`undoCut` (`undoLog` stores original and removed edges). The rooted stem is protected and refuses cuts.
- **Rendering** (Three.js): instanced meshes throughout — wood capsules (`stickMatrix`), leaves, fruit + stems; custom sky `ShaderMaterial`; demand-driven render loop (`invalidate`). `rebuild()` regenerates all instances from `M` and is the single entry point after any state change.
- **UI**: plain DOM driven by element ids via `$()`; tabs, HUD, cut-preview panel. No framework. Fullscreen has a CSS fallback (`#app.expanded`) for frames that block the Fullscreen API.
- **Profiles and caps**: `profiles` are cultivar parameter sets (vigor `v`, apical dominance `ap`, union `angle`, heading response `react`, sag, caliber, fruiting mode `spur|tip|mixed|sweet|tart|peach`) that drive both simulation and the advice text; `caps` are quality tiers bounding segment/leaf-cluster budgets and pixel ratio.

## Invariants

- Edges stay sorted by id and parents precede children; `undoCut` re-sorts by id when restoring removed edges.
- All randomness flows from `(T.seed, edge id, channel)` — never from call order or a mutable RNG stream.
- `derive(T)` is the only way to compute `M`; cut previews must go through `cutPlan` + `derive`, not mutate `T` in place.
- Segment count is budgeted (`C.max`); new instanced geometry must respect the `caps` tiers.
- `dist/` is build output only; the committed copy is regenerated by the pre-commit hook.
