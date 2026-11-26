# CI — hypotheses (need more data)

- **Split build/deploy jobs eliminate the artifact-metadata race.**
  Evidence so far: theory + GitHub starter shape + widespread reports.
  Test: next 5+ deploys on `main` run without "No artifacts named
  github-pages". Promote to rule after 5 clean deploys.
- **The metadata lag window is worse during GitHub load/incidents.**
  The failure clustered (user: "often fails"), which fits a variable lag.
  Test: compare failure timestamps against githubstatus.com history.
- **Third-party retry around deploy-pages would be belt-and-braces but is
  probably unnecessary once jobs are split.** Test: if the race survives the
  split, revisit (a new dependency needs user approval first).
