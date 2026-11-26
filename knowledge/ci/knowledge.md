# CI — facts and patterns

## GitHub Pages deploy pipeline

- Flow: `actions/upload-pages-artifact@v3` (wraps upload-artifact v4) uploads
  a tar artifact named `github-pages`; `actions/deploy-pages@v4` then looks
  that artifact up **by metadata API** (`listWorkflowRunArtifacts`) before
  deploying.
- The artifact metadata API is eventually consistent. Calling
  `deploy-pages` in the same job as the upload can see "Found 0 artifact(s)"
  → `No artifacts named "github-pages" were found for this workflow run`,
  even though the upload step succeeded. Failed runs are green up to the
  deploy step — the upload is not the problem.
- GitHub's own starter workflows (`static.yml` etc.) split `build` and
  `deploy` into separate jobs with `needs: build`; the job boundary gives
  the metadata time to settle. This repo now follows that shape
  (`.github/workflows/deploy.yml`).
- "Re-run failed jobs" on a split workflow re-runs only the deploy job and
  reuses the artifact uploaded earlier in the same run — a cheap retry that
  a single-job workflow cannot offer.
- `concurrency: group: pages` serializes deploys;
  `cancel-in-progress: false` is the safe value (GitHub starter comment:
  a cancelled run "can leave the deployment in a broken state"). A burst of
  pushes queues; each run deploys the newest state at its own commit.
- `actions/configure-pages@v5` reads site config from the Pages API, so the
  build job token needs `pages: read` at least. Workflow-level
  `permissions: {contents: read, pages: write, id-token: write}` covers both
  jobs; per-job least-privilege scoping needs a live run to verify.
- The error text also points at githubstatus.com: a real GitHub incident
  produces the same "Fetching artifact metadata failed" symptom. Distinguish
  from the race by frequency — the race is intermittent on every deploy,
  incidents cluster in time.
