# CNT fork overlay checklist

Preserve and semantically review these paths after every upstream merge:

- `AGENTS.md` CNT private-fork section and root `CLAUDE.md`
- `doc/CNT-SELF-HOSTING.md`, `doc/UPSTREAM-SYNC.md`, `doc/FORK-RELEASE.md`
- `.agents/skills/sync-upstream/` and `.agents/skills/deploy-cnt/`
- `.claude/commands/sync-upstream.md` and `.claude/commands/deploy-cnt.md`
- the fork repository setting that keeps `.github/workflows/release.yml` disabled
- `.github/workflows/docker.yml` production-target GHCR publication
- sibling `../connect-ai/k8s/zworkers/` image tag, env contract, probes, backup, and ingress

Recheck these upstream-sensitive contracts:

- all domain/API queries remain company-scoped;
- public authenticated bootstrap behavior has not changed;
- required signing/encryption environment variables still exist;
- migration auto-apply semantics and the last migration name/count;
- Docker runtime UID, entrypoint, port, health path, and `/paperclip` storage;
- transactional email remains unsupported unless upstream added a tested mail transport.
