---
name: deploy-cnt
description: Verify, publish, deploy, smoke-test, or roll back the ZurabDev/paperclip fork on the CNT Kubernetes cluster. Use for releases to zworkers.cnt.me, GHCR image publication, Helm or nelm operations, database migration/backup checks, TLS ingress verification, or production incident recovery.
---

# Deploy CNT

Deploy one multi-company Paperclip instance at `zworkers.cnt.me`. Read
`../../../doc/CNT-SELF-HOSTING.md`, `../../../doc/FORK-RELEASE.md`, and
`references/release-checklist.md` before changing production.

## Mandatory sequence

1. Run `node .agents/skills/deploy-cnt/scripts/preflight.mjs`.
2. Verify the Paperclip commit with frozen install, typecheck, tests, and build.
3. Commit and push Paperclip. Wait for the fork `Docker` workflow to publish both architectures.
4. Resolve the exact `sha-<short-sha>` manifest; never deploy `latest`.
5. Create and verify an on-demand `zworkers-backup` job.
6. In the private sibling `connect-ai` repo, update only `k8s/zworkers/values.yaml`, render the
   chart, review the diff, commit, and deploy with `nelm release install`.
7. Wait for the deployment rollout and inspect events/logs on any failure.
8. Verify in-pod `/api/health`, TLS ingress using `curl --resolve` before DNS, then the public URL
   after DNS.
9. Perform authenticated browser smoke tests: sign in, create/switch companies, open an issue,
   send an invitation email through Resend, confirm provider acceptance, and redeem it with the
   matching account.

Do not change shared cluster resources outside the chart except the documented PostgreSQL
consumer allowlist/role and the one-time namespace secrets. Do not delete releases, PVCs,
databases, or secrets as a retry strategy.

## First deployment

On a fresh database, keep sign-up enabled only long enough to claim the first CEO through
`pnpm paperclipai auth bootstrap-ceo` in the running pod. Then disable general sign-up in chart
values and redeploy. The CNT fork interprets disabled sign-up as invite-only account creation: the
public auth page cannot create accounts, while a valid targeted email invite can create its exact
recipient. Confirm the `zworkers-email` Secret exists and the Resend SDK accepts a probe before
calling the deployment ready. Never copy a human invite URL as the normal delivery path.

## Rollback decision

If the failed release did not apply incompatible migrations, redeploy the previous immutable
image. If schema or encrypted local state is incompatible, stop writes, restore the pre-release
database/PVC together, retain all signing/encryption secrets, then deploy the previous image.
