# Releasing the CNT Paperclip fork

## Artifact model

Pushes to `ZurabDev/paperclip` `master` publish the production Docker target to
`ghcr.io/zurabdev/paperclip`. The fork must not publish upstream npm packages. The `Release`
workflow is administratively disabled in `ZurabDev/paperclip`; keep its upstream source unchanged
so upstream workflow contract tests continue to pass. Verify `gh workflow list --all` reports it
as `disabled_manually` after every fork recreation.

Deploy immutable `sha-<short-sha>` tags. Optional human release tags use
`vYYYY.DDD.PATCH-cnt.N`; the Docker workflow also publishes the corresponding semver tag. Never
deploy `latest`.

## Release gate

```sh
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm test:run
pnpm build
node --test .agents/skills/sync-upstream/scripts/sync-upstream.test.mjs
node .agents/skills/deploy-cnt/scripts/preflight.mjs
```

Then commit and push. Wait for the `Docker` workflow and verify the expected manifest exists:

```sh
gh run watch --repo ZurabDev/paperclip
docker buildx imagetools inspect ghcr.io/zurabdev/paperclip:sha-$(git rev-parse --short HEAD)
```

Update `k8s/zworkers/values.yaml` in the private sibling `connect-ai` repository to that exact tag,
render the chart, commit the infrastructure change, and deploy with `nelm`. The detailed command
sequence and rollback rules live in `../connect-ai/k8s/zworkers/RUNBOOK.md`.

## Rollback

Rollback uses the previous immutable image only after checking whether the new release applied
forward-only database migrations. If schema compatibility is not guaranteed, restore the
pre-release database backup and PVC snapshot before reinstalling the old image. Preserve all
signing and encryption secrets across rollbacks.
