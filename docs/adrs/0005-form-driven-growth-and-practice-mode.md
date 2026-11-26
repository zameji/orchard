# 0005. Training form drives growth; renovation is a practice mode

Date: 2026-11-25
Status: Accepted

## Context

Growth shape used to be implied by the fruiting mode (`vase = peach ||
tart`), so a tree grew open or leader-like regardless of the training
system the user chose — tip-bearing apple grew like a spindle even when
trained as a vase. "Renovate" was conflated with the training system as a
third `system` value, mixing an architecture with a correction program.

## Decision

- `Tree.advance` derives its growth form from `spec.form` (the training
  system): open-center forms stop the rooted stem extending and spread
  rooted scaffolds at the form's fixed angle; leader forms keep the trunk
  chain and derive scaffold angle from the cultivar union angle. The
  habit's temporary `growsOpen` flag is deleted.
- `PracticeMode = 'normal' | 'renovate'` is independent of the form. The
  advisor's 3-year renovation program runs over whichever form is active;
  guide text and recommendations branch on practice first, then form.

## Consequences

- Selecting a form now changes simulated growth — the pedagogical point.
  Only tip-bearing apple changed shape at the switch; its behavior was
  ungilded, so no characterization golden moved. A divergence test pins
  that the same habit grows differently under the two forms.
- Cultivars and habits stay form-agnostic; alternative-form pairings are
  first-class (the advisor labels them "an alternative form").
- The leader-cut penalty is a form trait (`leaderCutPenalty`) and renovation
  practice exempts it: the old three-way system select skipped the penalty
  for `'renovate'`, and the renovation program deliberately leaves height
  reassessment on the table. Grading the trunk cuts the renovation advisor
  invites would contradict it, so `Grader` takes the practice mode.
