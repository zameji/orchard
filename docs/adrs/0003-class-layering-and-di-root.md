# 0003. Class layering with a constructor-injected composition root

Date: 2026-11-25
Status: Accepted

## Context

The extraction into TypeScript modules (0002) left module-level functions
sharing mutable module state (`T`, `M`, `selected`, undo log, …) and import-time
singletons for the render objects. Dependencies were hidden in module scope,
replant/config changes had implicit lifecycle, and the simulation core could not
be exercised without a browser. A deep class rewrite was approved, tests first:
a characterization suite pins the sim behavior (golden outputs for fixed seeds
plus structural invariants) before any restructuring.

## Decision

- Classes with constructor dependency injection; `src/js/main.ts` is the sole
  composition root. No import-time singletons.
- One-directional layering: `sim/` (`Tree`, `Canopy`, `CutPlanner`, `Grader`) is
  browser-free; `render/` (`Stage`, `TreeMesh`, `Picker`) and `app/`
  (`Advisor`, `Studio`, `Ui`) sit on top; `main.ts` wires the graph
  (`new Studio({ tree, stage, treeMesh, advisor, ui })`).
- `Tree` is the only place mutating the edge graph (`append`, `advance`,
  `forkCut`, `applyCut`, `undo`); `new Canopy(t, profile)` is the only
  derivation; cut previews fork a hypothetical tree and re-derive, never mutate
  in place.
- `Ui` reports user intent through the `UiHooks` interface; `Studio` implements
  the hooks and owns sim state plus the rebuild loop. Display never feeds state
  back into the simulation.
- `Stage.updateSun` keeps explicit parameters `(hour, guideSun, m)` instead of
  hidden Stage state.
- `tree` and `advisor` are per-configuration collaborators: replant and system
  changes renew them (an advisor frozen at boot would serve stale config).
  `Picker` is constructed inside `Studio` from the injected `Stage`/`TreeMesh`.
- The characterization suite (Vitest, sim core only) is the behavior oracle —
  goldens must not move across the rewrite. Rendering and DOM stay out of the
  suite and are validated by WebGL 2 browser smoke.

## Consequences

- The object graph is explicit; sim tests run headless, and a class's
  dependencies read off its constructor.
- Config changes re-instantiate collaborators instead of mutating them — small
  allocation cost, clear lifecycle.
- Render-layer regressions (e.g. a dropped rebuild tail leaving the sun rig and
  HUD stale) remain invisible to the sim suite; browser smoke stays mandatory
  for render changes.
- Rejected: keeping module singletons with lazy init (hidden dependencies
  survive); letting display state feed the sim (breaks determinism); extending
  the suite to Three.js/DOM (slow and brittle where smoke is sufficient).
