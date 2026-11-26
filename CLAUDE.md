# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Orchard Fieldwork — Pruning Studio: an interactive 3D tree-pruning simulator and teaching tool for apple, cherry, and peach training systems. The source is TypeScript under `src/js/`; `src/index.html` holds the markup, CSS, and the Three.js import map. `dist/` is a generated multi-file artifact built by CI and deployed to GitHub Pages; it is never committed.

## Commands

- `npm ci` — install dev tooling from the lockfile (also installs the git hooks via husky).
- `npm test` — Vitest characterization suite for the simulation core (golden values for fixed seeds plus structural invariants).
- `npm run typecheck` — `tsc --noEmit` (strict).
- `npm run lint` — ESLint 9 flat config over the TypeScript sources.
- `npm run build` — `tsc` emitting `dist/js/*.js`, then copy `src/index.html` to `dist/index.html`. No bundler, no minification.
- `npm run format` / `npm run format:check` — Prettier write/check (dist and node_modules ignored).

To validate a source change: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, then serve `dist/` from a local static server and open it in a WebGL 2 browser (the import map loads Three.js from jsDelivr, so first load needs network). Rendering and DOM are outside the test suite — browser smoke is the check for render-layer changes.

## Pre-commit hook

`.husky/pre-commit` runs lint-staged only (eslint --fix + prettier on staged files). `dist/` is not committed and not staged: `ci.yml` gates pull requests with lint, typecheck, tests and build, and `deploy.yml` runs the same build before uploading `dist/` to Pages (see `docs/adrs/0002-modular-typescript-sources.md`). Never edit `dist/` by hand.

## Repository layout

- `src/index.html` — markup, CSS, and the Three.js CDN import map; its module script is a single `js/main.js` reference.
- `src/js/sim/` — browser-free simulation: `random.ts` (`mulberry32`, `noise`), `types.ts`, `caps.ts`, `axes.ts` (axis vocabularies + `TreeSpec`), `species.ts`, `habits.ts`, `cultivars.ts`, `systems.ts` (registries), `spec.ts` (`resolve`, selectors), `tree.ts` (`Tree`), `model.ts` (`Canopy`), `plan.ts` (`CutPlanner`, `Grader`), `light.ts` (`exposures`).
- `src/js/app/` — orchestration: `studio.ts` (`Studio`), `advice.ts` (`Advisor`), `ui.ts` (`Ui`, `UiHooks`).
- `src/js/render/` — Three.js display: `scene.ts` (`Stage`), `tree-mesh.ts` (`TreeMesh`), `picking.ts` (`Picker`), `loft.ts` (ring-loft chains + range maps, pure), `geometry.ts` (shared helpers/materials).
- `src/js/main.ts` — composition root: constructs `Stage`, `TreeMesh`, `Tree`, `Advisor`, `Ui` and injects them into `Studio`.
- `src/js/util.ts` — DOM and math helpers.
- `tests/` — Vitest characterization suite (simulation core only) plus `helpers.ts`.
- `build.mjs` — build glue: globs exactly one `src/*.html`, copies it to `dist/index.html`; `tsc` emits `dist/js/`.
- `docs/adrs/` — architecture decision records.

## Architecture

Everything is plain data + derived model + display, in that order. Keep the layers one-directional: display never feeds back into simulation state.

- **Determinism** (`mulberry32`, `noise` in `sim/random.ts`): all bud, fruit, and foliage placement comes from stateless `noise(seed, edgeId, channel)` draws, never from a running RNG. This keeps bud sites stable across cut preview, undo, and redraw. Any new visual randomness must use this pattern with a distinct channel constant.
- **Tree state** (`Tree`, `sim/tree.ts`): plain-data edge list in parent-before-child order; each edge is one annual extension with rest direction `d`, role (`leader`/`scaffold`/`sprout`), `born`, `head` (heading year), `release` (collar-cut year). Rest directions never accumulate display deformation — sag is recomputed on every derivation. `Tree` is the only place mutating the edge graph: `append`, `advance(m, spec, caps)`, `forkCut(q, at)` (non-mutating hypothetical surgery), `applyCut(plan)`, `undo(entry)`.
- **Derived model** (`Canopy`, `sim/model.ts`): `new Canopy(t, spec)` computes geometry (pipe-model radii, fruit-load sag, parent-shape inheritance), light, per-edge crop (`crop`/`potential`), flaw flags (`narrow`, `rival`, `inward`, `cross` via `findCrossings`), and aggregate canopy score. Cut previews work by building a hypothetical `Tree` (`forkCut`) and deriving a `Canopy` from it — no special-case display path.
- **Year advance** (`Tree.advance`): one season of growth. Competing bud "bids" share a finite whole-tree extension budget; heading a shoot spawns watersprouts (`s.head`), removal of a whole branch sets `release` on the parent union. Growth shape follows the training form (`spec.form`): open-center forms stop the rooted stem extending. Over-pruning past the species budget (0.27, peach 0.32) adds stress and watersprout surge.
- **Light** (`exposures` in `sim/light.ts`): sun-aligned depth sweep depositing optical depth into projected cells; three seasonal sun positions averaged into `q.light`. Independent of foliage display — do not couple it to rendered leaf instances.
- **Pruning loop**: `Picker.pick` (merged-mesh face→edge picking, sprout instances, screen-space capsule fallback) → `Studio.propose` → `CutPlanner.plan` (forks the tree, derives the hypothetical model) → `Grader.assess` (grades light/structure/balance/damage to a 0–100 cut score) → `Studio.confirmCut`/`undoCut` (`Tree.applyCut`/`Tree.undo`; the undo log stores original and removed edges). The rooted stem is protected and refuses cuts.
- **Rendering** (Three.js): main-limb wood is one merged ring-loft mesh per tip-continuation chain (`render/loft.ts`: welded parallel-transport rings, analytic radial normals, per-edge vertex colors and face→edge maps; see ADR 0007); sprouts, fruit stems, leaves and fruit stay instanced (`stickMatrix`, `woodG`). Ring vertices follow `caps.sides`; segment budgets follow `caps.max`. Custom sky `ShaderMaterial`; demand-driven render loop (`Stage.invalidate`). `TreeMesh.rebuild(ctx)` regenerates all geometry from the model and is the single entry point after any state change; the `refresh()` tail around it also runs `Stage.updateSun`, recommendations, and HUD so they cannot go stale.
- **UI** (`Ui`, `app/ui.ts`): plain DOM driven by element ids via `$()`; tabs, HUD, cut-preview panel. No framework. `Ui` reports user intent through the `UiHooks` interface; `Studio` implements the hooks and owns the sim state and loop. Fullscreen has a CSS fallback (`#app.expanded`) for frames that block the Fullscreen API.
- **Composition root** (`main.ts`): constructor dependency injection all the way down (`new Studio({ tree, stage, treeMesh, advisor, ui })`); no import-time singletons. `tree` and `advisor` are per-configuration collaborators renewed by `plant()`/`onForm()`/`onPractice()` when the configuration changes.
- **Axis model**: a tree is composed from four registries resolved into a `TreeSpec` (`sim/spec.ts` `resolve`) — species (biology + `SpeciesRender` display traits), habit (bearing strategy + advice), cultivar (growth parameters), training form (architecture + its guide line, leader-cut penalty and recommendation rules) — plus `PracticeMode` (`normal`/`renovate`) for the advisor's program. Consumers read trait fields; only the registries branch on ids. `caps` (`sim/caps.ts`) are quality tiers bounding segment/leaf-cluster budgets and pixel ratio. See ADRs 0004–0005.

## Invariants

- Edges stay sorted by id and parents precede children; `Tree.undo` re-sorts by id when restoring removed edges.
- All randomness flows from `(T.seed, edge id, channel)` — never from call order or a mutable RNG stream.
- `new Canopy(t, spec)` is the only way to compute the derived model; cut previews must go through `CutPlanner.plan` + `Canopy`, never mutate a `Tree` in place.
- Species/habit/cultivar/form ids never branch in consumers; behavior differences go through `TreeSpec` traits so new registry rows need no consumer edits.
- The sim layer (`src/js/sim/`) stays headless: no DOM, no renderer or scene objects. `three` appears there only as vector math (`Vector3` types, `V`/`UP` helpers), never as display code.
- Segment count is budgeted (`C.max`); new instanced geometry must respect the `caps` tiers.
- `dist/` is build output only and never committed; `npm run build` is the only way to produce it.
- The characterization goldens in `tests/` are the behavior oracle; changing sim behavior must move goldens deliberately, never accidentally.
