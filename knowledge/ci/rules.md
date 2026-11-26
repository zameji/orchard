# CI — rules (confirmed — apply by default)

None yet. Promotion policy: a hypothesis that has been confirmed 5+ times
moves here; a rule contradicted by new data demotes back to hypothesis.

Until then, the working defaults (not yet rules):

- Keep Pages `build` and `deploy` in separate jobs; never merge them into
  one job to "simplify" — see ci/knowledge.md on the metadata race.
- `cancel-in-progress: false` for the `pages` concurrency group.
