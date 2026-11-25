# Orchard Fieldwork — Pruning Studio

A pruning simulator, one-shot coded by GPT-6.2-Astra and since modularized into
TypeScript sources. `src/index.html` holds the markup, styles, and the Three.js
import map; simulation, rendering, and UI live in `src/js/`. It teaches apple,
cherry, and peach training systems by letting you prune a living 3D tree and
watch the consequences play out over seasons.

**[Try it →](https://zameji.github.io/orchard/)**

## Currently supported features

- **Three species, six growth habits** — apple (spur-bearing upright, tip-bearing
  spreading, vigorous standard), cherry (sweet upright leader, tart/bush
  spreading), and peach (open-vase renewal), each with its own vigor, apical
  dominance, union angles, heading response, and fruiting mode.
- **Interactive 3D tree** — orbit, zoom, pan, fit-to-tree, fullscreen (with a
  CSS fallback for blocked frames), foliage and fruit display toggles.
- **Cut preview and scoring** — tap wood to inspect a collar or heading cut; a
  coral preview shows exactly what would be removed, graded 0–100 across light
  gain, structure/angles, canopy balance, and damaged wood removed. Confirm or
  cancel; undo restores the tree until you advance the year.
- **Year advance** — one season per step: harvest standing fruit, grow a new
  canopy, update the canopy score.
- **Sun path inspector** — solar-time slider with morning/noon/evening presets,
  live wood shading, an exposure overlay, and a sun guide; fruit set uses a
  three-moment daily light average.
- **Learn mode** — guided practice for central leader/spindle, open center/vase,
  and a three-year renovation plan for neglected trees, with per-tree
  recommendations.
- **Tree setup** — species, growth habit, starting year, unsigned seed, and
  detail cap (1.5k–20k segments) for weaker devices.
- **Deterministic worlds** — every bud, fruit, and foliage site comes from
  stateless noise keyed by `(seed, edge id, channel)`, so a seed always grows the
  same tree and cut previews never shuffle the canopy.

## Currently inbuilt dynamics

- **Finite extension budget** — competing buds bid for a whole-tree growth
  budget each year; vigor and apical dominance shape who wins. Capacity grows
  with tree age and tapers as the tree matures.
- **Pruning response** — heading a shoot spawns watersprouts proportional to the
  cultivar's heading response; removing a whole branch releases the parent
  union, which then receives preferential growth flow.
- **Over-pruning stress** — cutting past the removal budget (27% of live shoot
  length, 32% for peach) adds stress and a watersprout surge. Budgets track
  shoot length, not fruit count.
- **Light model** — a sun-aligned depth sweep deposits optical depth into
  projected canopy cells; three seasonal sun positions are averaged into a light
  score per edge. Shaded interior wood declines and can die back.
- **Structural flaws** — narrow crotches, rival leaders, inward growth, and
  crossing branches are flagged from geometry and fed into cut grading.
- **Fruit load and sag** — pipe-model wood radii, fruit-load bending recomputed
  on every derivation, and parent-shape inheritance for natural branch angles.
- **Canopy score** — a 0–100 aggregate of light, structure, health, and crop
  index, dinged for over-removal and excessive heading.

## Extending this

This project is meant to be tinkered with. Ideas to take and run:

- new species or cultivar profiles (add an entry to `profiles` in
  `src/js/sim/config.ts`),
- other training systems for the Learn tab,
- richer cut-grading rules or new flaw detectors,
- alternative light models, weather, or disease pressure,
- better accessibility and mobile input.

The code is deliberately plain: tree state (`Tree`) → derived model (`Canopy`) →
display, with `new Canopy(tree, profile)` the only bridge. Cut previews work by
deriving a hypothetical tree, so new simulation behavior automatically shows up
in previews. Start with
`CLAUDE.md` for the architecture and invariants, and
`docs/adrs/` for recorded decisions. Issues and PRs welcome.

## Development

```sh
npm ci              # install dev tooling (also installs git hooks)
npm test            # Vitest characterization suite (simulation core)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint over the TypeScript sources
npm run build       # tsc → dist/js/*.js + copy index.html → dist/
npm run format      # Prettier write (format:check to verify)
```

`dist/` is generated and not committed — CI builds it before deploy. To validate
a change by hand: typecheck, test, lint, build, then serve `dist/` from a local
static server and open it in a WebGL 2 browser (Three.js loads from jsDelivr, so
the first load needs network). Rendering and DOM are outside the test suite;
browser smoke is the check for render-layer changes.

MIT licensed.
