---
name: sync-upstream
description: Safely inspect, merge, verify, and prepare publication of changes from paperclipai/paperclip into the ZurabDev/paperclip fork. Use for periodic upstream synchronization, upstream divergence checks, merge-conflict resolution, or auditing fork overlays after an upstream update. The bundled Node runner is cross-platform and never pushes or deploys implicitly.
---

# Sync Upstream

Keep the fork close to upstream while preserving the small CNT operations overlay. Read
`../../../doc/UPSTREAM-SYNC.md` before changing refs and
`references/fork-overlay.md` while reviewing the merge.

## Workflow

1. Confirm the current production image and a fresh database backup.
2. Inspect divergence:

   ```sh
   node .agents/skills/sync-upstream/scripts/sync-upstream.mjs status
   ```

3. Start `sync/upstream-YYYYMMDD` from current `origin/master`.
4. Merge without rebasing or rewriting upstream history:

   ```sh
   node .agents/skills/sync-upstream/scripts/sync-upstream.mjs merge
   ```

5. If Git reports conflicts, inspect every conflicted hunk against product intent and the fork
   overlay. Never use repository-wide ours/theirs resolution. Complete or abort the merge before
   proceeding.
6. Review migrations, Docker runtime settings, auth defaults, and all overlay paths listed in
   `references/fork-overlay.md`.
7. Verify:

   ```sh
   node .agents/skills/sync-upstream/scripts/sync-upstream.mjs verify
   ```

8. Review the diff and create a PR using `.github/PULL_REQUEST_TEMPLATE.md`.
9. After the PR is merged, use `$deploy-cnt`; syncing is not complete until the immutable image
   and production smoke checks succeed.

## Runner contract

`status` fetches `origin/master` and `upstream/master`, validates both remotes, and reports
left/right commit counts. `merge` requires a clean tree and an allowed branch (`master` or
`sync/upstream-*`). `verify` performs frozen install, typecheck, Vitest, and production build.
`all` runs status, merge, and verify. `--dry-run` prints mutating/test commands without executing
them. The runner never commits, pushes, tags, opens PRs, or deploys.

If the upstream change introduces a destructive migration or invalidates rollback compatibility,
stop before production release and document an explicit forward/restore procedure.
