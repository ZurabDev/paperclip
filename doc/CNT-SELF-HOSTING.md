# Paperclip self-hosting in CNT Kubernetes

## Production contract

- Public URL: `https://zworkers.cnt.me`
- Kubernetes namespace and Helm release: `zworkers`
- Application image: `ghcr.io/zurabdev/paperclip:sha-<commit>`
- Infrastructure source: sibling private repo `../connect-ai/k8s/zworkers`
- Database: shared CloudNativePG service `postgres-rw.postgres.svc.cluster.local`, dedicated
  database and role `paperclip`
- Application state: one `ReadWriteOnce` PVC mounted at `/paperclip`
- TLS: wildcard `cnt-me-ssl`, synchronized from `cnt-prod`

Paperclip is a portfolio control plane. Companies are first-class records and operational data
is scoped by `company_id`, so one deployment hosts all supported companies while keeping their
data isolated. Creating one pod/database/domain per company defeats the intended model and is
not the default architecture.

## Request and execution flow

The production image runs one Node process on port 3100. Express serves `/api`, Better Auth, live
updates, and the built Vite UI from the same origin. Agent adapters execute from the application
pod unless an adapter is configured for a remote runtime. A single replica is intentional while
local workspaces live on a `ReadWriteOnce` volume.

PostgreSQL is authoritative for companies, memberships, agents, issues, approvals, audit data,
and auth tables. `/paperclip` holds config, encrypted-secret metadata, uploads, workspaces, and
other instance-local state. Both the database and the PVC are required for complete recovery.

## Authentication and invitations

Production uses:

```text
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=public
PAPERCLIP_PUBLIC_URL=https://zworkers.cnt.me
PAPERCLIP_ALLOWED_HOSTNAMES=zworkers.cnt.me
BETTER_AUTH_TRUSTED_ORIGINS=https://zworkers.cnt.me
```

Public exposure disables browser-first anonymous board claiming. Bootstrap the first CEO from a
running pod:

```sh
kubectl -n zworkers exec deploy/zworkers -- pnpm paperclipai auth bootstrap-ceo
```

Open the printed one-time URL over HTTPS and create/sign in to the first account. After the first
operator exists, set `auth.disableSignUp=true` in the chart and redeploy. In the CNT fork this is
invite-only mode: ordinary public sign-up is rejected, while a new human following a valid,
unexpired targeted invitation may create the matching account. The invite token is passed in a
dedicated request header and checked against the address before Better Auth creates the user.

Human invites in authenticated mode require `inviteeEmail`. Paperclip creates a high-entropy,
single-use URL, sends it synchronously through SMTP or Resend, and records the delivery timestamp,
provider, and provider message ID.
The API returns success only after the provider accepts the message. A rejected provider request revokes the
new token before returning `502`, so an operator can retry without leaving a live undistributed
invite. Acceptance is also bound to the signed-in account email. Agent invites remain token-based
because agents do not own mailboxes.

CNT uses the same Resend API and official provider SDK as Multica. The application also retains
SMTP as a portable self-hosting fallback, but Stalwart is not part of the ZWorkers delivery path.
Production configuration is:

```text
PAPERCLIP_EMAIL_PROVIDER=resend
PAPERCLIP_EMAIL_FROM=ZWorkers <noreply@updates.cnt.app>
PAPERCLIP_RESEND_API_KEY=<RESEND_API_KEY from zworkers-email Secret>
```

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are accepted as Multica-compatible aliases. Provider
requests use a stable per-invite idempotency key, preventing duplicate messages on API retries.

## Secrets

The chart stores generated application secrets in the `zworkers-app` Kubernetes Secret and
preserves existing values on upgrades:

- `BETTER_AUTH_SECRET`
- `PAPERCLIP_AGENT_JWT_SECRET`
- `PAPERCLIP_TOOL_ACTION_SIGNING_SECRET`
- `PAPERCLIP_DECISION_SIGNING_SECRET`
- `PAPERCLIP_SECRETS_MASTER_KEY`

The database URL is stored separately in `zworkers-db`. Never rotate the encrypted-secrets master
key without decrypting/re-encrypting stored secrets. Never print or commit secret values.
The Resend API key is stored in `zworkers-email` and mounted only into the application container.

## Migrations, backup, and recovery

The deployment sets `PAPERCLIP_MIGRATION_AUTO_APPLY=true`; startup refuses stale or incompatible
schemas. Before every upgrade, create an on-demand database dump in addition to the shared
CloudNativePG WAL/base backup:

```sh
kubectl -n zworkers create job --from=cronjob/zworkers-backup zworkers-backup-manual-$(date +%Y%m%d%H%M)
kubectl -n zworkers wait --for=condition=complete job -l app.kubernetes.io/component=backup --timeout=10m
```

The chart backup CronJob uses a PostgreSQL client image because the Paperclip image does not ship
`pg_dump`. Built-in Paperclip database backups are disabled. Restore order is database first,
then the `/paperclip` PVC, then the exact prior image and the unchanged application secrets.

## Verification

```sh
kubectl -n zworkers rollout status deploy/zworkers --timeout=10m
kubectl -n zworkers get pods,svc,ingress,pvc,cronjob
kubectl -n zworkers exec deploy/zworkers -- node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(console.log)"
curl --resolve zworkers.cnt.me:443:212.41.1.178 https://zworkers.cnt.me/api/health
```

The `--resolve` smoke test works before public DNS exists. After DNS is added, repeat without it
and perform sign-in, company switch, company creation, and invitation-link smoke tests.
For an invitation smoke, send to a controlled mailbox, verify the message appears, create/sign in
through its link, and confirm that a different account email receives `403` on acceptance.
