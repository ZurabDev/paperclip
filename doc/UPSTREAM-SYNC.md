# Synchronizing `ZurabDev/paperclip` with upstream

## Remote and branch contract

```text
origin   git@github.com:ZurabDev/paperclip.git
upstream git@github.com:paperclipai/paperclip.git
branch   master
```

Use the repository skill `.agents/skills/sync-upstream/SKILL.md`. Its Node runner works on macOS,
Linux, and Windows and refuses a dirty tree, the wrong branch, or unexpected remotes.

## Procedure

1. Confirm production backup and record the currently deployed image digest.
2. Run `node .agents/skills/sync-upstream/scripts/sync-upstream.mjs status`.
3. Create `sync/upstream-YYYYMMDD` from an up-to-date fork `master`.
4. Run `node .agents/skills/sync-upstream/scripts/sync-upstream.mjs merge`.
5. Resolve conflicts semantically. Do not use blanket ours/theirs resolution.
6. Reapply and review the fork overlay: `AGENTS.md`, `CLAUDE.md`, `doc/CNT-*`, `doc/UPSTREAM-*`,
   `doc/FORK-*`, `.agents/skills/{sync-upstream,deploy-cnt}`, release workflow guards, and the
   sibling `connect-ai/k8s/zworkers` chart.
7. Run the script's `verify` command, plus any tests named by upstream migration notes.
8. Review schema migration count/last migration and the Dockerfile runtime contract.
9. Commit the merge, push the sync branch, open a PR using the repository template, and merge only
   after CI is green.
10. Publish/deploy with the `deploy-cnt` skill. Never combine an unresolved upstream merge with a
    production deployment.

## Conflict policy

Upstream owns product behavior. The fork owns CNT deployment, operational instructions, secrets
boundaries, and the guard preventing upstream npm publication. Prefer upstream application code
unless it breaks a documented fork requirement. Every retained divergence must remain small,
named, tested, and described in the sync commit.

If migrations are destructive or require backfill, stop automatic deployment after image
publication, document the forward and rollback path, take a fresh backup, then execute the
reviewed migration window.
