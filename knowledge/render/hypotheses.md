# Render — hypotheses (need more data)

- A mid-parent child chain rooted inside the parent tube leaves a visible
  crease at the fork. Accepted as a tradeoff (no C2 blending), but no browser
  smoke has confirmed it reads acceptably on all four training forms.
  Confirm visually before promoting to "fine as-is".
- The blend-ring zone width (`0.25 * min(adjacent segment lengths)`) may be
  too narrow on short annual extensions and too wide on long ones. Needs
  screenshots across species/cultivar scales.
- One draw call for all main limbs should cut frame time on the low tier
  (`caps.max` 1500, `sides` 5), but it has not been measured; the old path
  was one instanced draw, so the win may be smaller than expected.
- Slot slack sized for the insert case assumes no rewrite ever adds more than
  one ring. True for the current `truncateRings`, but a future cut mode that
  splits a chain would overflow and throw — the throw is the safety net, not
  a design.
- Tests that exercise `mergeChains` (the `mergeGeometries` path) do not cover
  the production `LoftCache.writeChain` path. Hypothesis: routing every cache
  test through `LoftCache` would have caught the index-rebasing bug; worth
  doing if the cache grows further.