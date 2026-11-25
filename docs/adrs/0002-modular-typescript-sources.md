# 0002. Modular TypeScript sources, CI-built multi-file dist

Date: 2026-11-25
Status: Accepted
Supersedes: 0001

## Context

`src/index.html` grew to ~2800 lines with a ~2100-line inline module: simulation,
rendering and UI in one script with shared mutable state. A deep, class-based
rewrite was approved (with tests first), which requires importable, typed modules.
That collides with 0001's single-file artifact: bundling back into one inline
script would keep the artifact but discard module boundaries at the deploy
surface, and committed dist conflicts with a multi-file build.

## Decision

- Source is TypeScript under `src/js/` — `sim/` (browser-free simulation),
  `render/` (Three.js), `app/` (orchestration, advice, DOM), and `main.ts` as the
  composition root. `src/index.html` keeps the markup, CSS, and the Three.js CDN
  import map; its module script is a single `js/main.js` reference.
- Relative imports carry explicit `.js` extensions so `tsc` output is directly
  loadable as native ES modules — no bundler. `three` stays a bare specifier
  resolved by the import map at runtime; `three@0.169.0` is a devDependency for
  types only.
- The build is `tsc` (emitting `dist/js/*.js`) plus a copy of `src/index.html` to
  `dist/index.html`. No minification: the artifact is never committed or diffed,
  GitHub Pages compresses on the wire, and readable stack traces beat ~25 KB.
- `dist/` is not committed. `.github/workflows/deploy.yml` runs `npm ci` and
  `npm run build` before uploading `dist/`; `ci.yml` gates pull requests with
  lint, typecheck, tests and build. The pre-commit hook keeps lint-staged only.
- Vitest covers the simulation core (golden outputs for fixed seeds plus
  structural invariants). Rendering and DOM stay out of the suite and are checked
  in a WebGL 2 browser.

## Consequences

- The deployed artifact can drift from a reviewed source tree if CI's build is
  broken at deploy time — accepted: CI now builds the same command developers
  run, and the previous trade-off (unreadable committed artifact, pre-commit
  coupling) is gone.
- A build step is now mandatory before any local `dist/` check; `src/` served
  raw is not runnable (TS + bare specifiers).
- `dist/` diffs disappear from history; versioning rides source history alone.
- Rejected: bundling back into one file (defeats the modular deploy surface);
  keeping committed dist (multi-file generated output would bloat every commit);
  minified emit (payload is small, opacity cost real).

## Amendment (2026-11-25)

`three` and `@types/three` are pinned at exact `0.187.0`, matching the import
map, instead of the `0.169.0` named above: the pin drifted during a reinstall
and was aligned forward to the installed version, smoke-tested in a WebGL 2
browser.
