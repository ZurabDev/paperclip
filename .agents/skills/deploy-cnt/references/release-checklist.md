# CNT release checklist

- Correct context: `admin-api.cnt.app`
- Paperclip worktree clean and commit pushed
- Full typecheck, Vitest, and build green
- `ghcr.io/zurabdev/paperclip:sha-<short-sha>` multi-arch manifest present
- Pre-upgrade `zworkers-backup` job complete
- `connect-ai/k8s/zworkers` chart renders without secrets in Git
- shared PostgreSQL NetworkPolicy includes namespace `zworkers`
- app and database Secrets already exist and are preserved
- TLS secret `cnt-me-ssl` synchronized into `zworkers`
- rollout complete; no CrashLoopBackOff or migration errors
- in-pod and ingress `/api/health` return success
- browser auth, company switch/isolation, issue, and invitation flows checked
- deployed image digest and rollback image recorded in the release commit
