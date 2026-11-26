# Persistence — hypotheses (need more data)

- Last-writer-wins across tabs may bite real users (studio open in two tabs,
  one silently clobbers the other). Out of scope until it hurts; if reports
  arrive, `storage`-event arbitration or tab scoping is the next step.
- The 300 ms debounce window was chosen by feel. No measurement yet that it
  is the right trade-off between write churn and lost work.
- Session size against the ~5 MB localStorage quota is unknown territory:
  trees at the segment cap with long undo logs have not been measured.
- Same-major forward compatibility ("unknown fields ignored") is asserted,
  but never exercised against a real later schema change.
