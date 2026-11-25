# 0001. Minified, committed dist built by the pre-commit hook

Date: 2026-11-24
Status: Superseded by 0002

## Context

The app is one self-contained HTML file with inline JS/CSS. GitHub Pages must
deploy from `./dist`, and the build to `./dist` should happen at pre-commit.
Open questions: whether dist is committed or CI-built, whether the build copies
or minifies, and how Pages gets the artifact (branch-based Pages can only serve
`/` or `/docs`, never `/dist`).

## Decision

- `src/index.html` is the source of truth — a stable name; versions live in
  git history, not filenames. `build.mjs` globs exactly one `src/*.html` and
  fails on zero or many.
- The build minifies (`html-minifier-terser`: whitespace, comments, inline
  JS/CSS) to `dist/index.html`. Node's `--check` on the extracted module and a
  JSON parse of the importmap gate the build in review.
- `dist/` is committed. The pre-commit hook runs lint-staged, then
  `npm run build`, then `git add dist`, so every commit carries an in-sync
  artifact and history stays bisectable at the artifact level.
- `.github/workflows/deploy.yml` deploys the committed `./dist` on push to
  `main` via `actions/upload-pages-artifact` + `actions/deploy-pages`. CI does
  not rebuild: what is reviewed is what is deployed.

## Consequences

- `dist/index.html` diffs are unreadable — generated, never edited by hand.
- Source-only commits do not exist; each carries its artifact (~50 KB).
- A stale artifact can only reach main if commits bypass the hook
  (`--no-verify`); CI will not catch it since it does not rebuild.
- Rejected: copy (no minification) — payload is small but the build then adds
  no value over a plain file; CI rebuild — the deployed artifact could drift
  from the reviewed one; `gh-pages` branch — extra moving part, and Actions
  deployment from `./dist` was the requirement.
