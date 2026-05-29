# Decisions

Append-only log of architectural decisions for vedanta-systems.
Newest at the bottom. Each entry: date · short title · context ·
decision · consequences. When a decision is later reversed, *add a
new entry* — never edit history in place.

---

## 2026-05-28 — Adopt AGENTS.md + docs/ as the front-door pattern

**Context.** The repo accumulated several top-level MDs over its life
(`README.md`, `QUICKSTART.md`, `CLOUDFLARE-SETUP.md`,
`CONTAINER-ARCHITECTURE.md`, `MONITORING_PANE.md`, `PORT-ALLOCATION.md`,
`BTOP-INTEGRATION.md`, `TIMEZONE-FIXTURE-SCOPING.md`) without a clear
front-door for agents — each was a topic page; none was the entry
point. Sibling projects `found-footy/` and `legal-tender/` use an
`AGENTS.md` (front door) + `CLAUDE.md` symlink + `docs/` (topic pages)
pattern and reference each other through it.

**Decision.** Adopt the same shape here: `AGENTS.md` at the root,
`CLAUDE.md` symlinked to it, `docs/` directory for subordinate topic
docs. Auto-memory under `~/.claude/projects/<project>/memory/` stays
minimal — project facts belong here in the versioned repo, not in
per-machine memory.

**Consequences.** The legacy root MDs are now migration targets, not
the source of truth. The detailed cleanup checklist lives in
`docs/todo.md` ("Doc cleanup pass"). New project facts land in
`docs/*.md`; new architectural decisions append below this entry.

---

## 2026-05-28 — Pattern A → Pattern B for cross-project integration

**Context.** `~/workspace/proxy/CONVENTIONS.md` lays out two patterns
for how vedanta-systems' Express BFF surfaces other projects:

- **Pattern A** — vs-api opens direct DB connections into each
  project (mongo, minio, postgres) and serves data from there. Schema
  knowledge and credentials for every project end up in vs-api.
- **Pattern B** — each project ships its own `*-api`, and vs-api is
  a thin HTTP proxy: `/api/<project>/*` →
  `<project>-{env}-api:<port>`. Each project owns its data plane;
  vs-api owns presentation routing only.

Current snapshot (2026-05-28):

| Project | Status |
|---|---|
| found-footy | Pattern A — `src/server/routes/found-footy.ts` reads mongo + minio directly. A `found-footy-dev-api:8080` already exists per `~/workspace/proxy/caddy/caddy.d/found-footy.caddy`. |
| spin-cycle | Pattern A — reads `spin-cycle-{env}-postgres` directly via `pg`. `spin-cycle-{env}-api:3000` already exists upstream. |
| long-exposure | Pattern A by design (for now) — reads `long-exposure-{env}-postgres` directly. There is no separate long-exposure API yet; `caddy.d/long-exposure.caddy` documents the current single-source-of-truth choice. |
| legal-tender | Not surfaced yet. Pattern B from day one when it lands. |

**Decision.** Pattern B is the target. Migrate per project when next
touched for feature work — no "migrate for its own sake" bundles.
New project integrations don't add direct-DB peers in
`src/server/index.ts` or new routers in
`src/server/routes/<project>.ts` that import database clients.

**Consequences.**

- For new projects: scaffold a thin HTTP proxy router; the project
  itself ships an `<project>-{env}-api` and a Caddyfile entry. Done.
- For found-footy + spin-cycle: bundle the migration with the next
  feature that touches each project's data surface. Don't reshuffle
  proactively.
- For long-exposure: revisit when LE grows its own API service. The
  current `src/server/routes/long-exposure.ts` is acceptable
  technical debt — explicitly called out as such in the file header.

See `docs/todo.md` "Pattern A → Pattern B migration" for the per-project
backlog.

---

## 2026-05-29 — Doc reorganization: legacy MDs migrated into `docs/`

**Context.** Two days after the AGENTS.md/docs/ bootstrap landed, the
legacy root MDs needed disposition. They split into three buckets after
a code-verification pass: still-current (`BTOP-INTEGRATION.md`,
`TIMEZONE-FIXTURE-SCOPING.md` — the latter surprised me, but its
contract matches `src/contexts/timezone-context.tsx` and
`src/components/found-footy-browser.tsx` today), worth-rewriting-from-
current-truth (`CONTAINER-ARCHITECTURE.md`, `PORT-ALLOCATION.md`), and
fully-superseded (`CLOUDFLARE-SETUP.md`, `QUICKSTART.md`,
`MONITORING_PANE.md`). The `scripts/` directory + its README turned
out to be wholly dead too — every script in there targeted
`~/projects/prod/vedanta-systems` (retired workspace path) or
provisioned cloudflared as a systemd service (cloudflared now runs
as a docker container in `~/workspace/proxy/`).

**Decision.** Migration map (this commit):

| From | To | How |
|---|---|---|
| `BTOP-INTEGRATION.md` | `docs/btop.md` | `git mv` — content preserved |
| `TIMEZONE-FIXTURE-SCOPING.md` | `docs/found-footy-timezone.md` | `git mv` — content preserved, namespaced for future per-project timezone notes |
| `CONTAINER-ARCHITECTURE.md` | `docs/architecture.md` | fresh write from current truth (Caddy + in-container nginx + Vite-in-dev + btop host-network exception) |
| `PORT-ALLOCATION.md` | `docs/ports.md` | fresh write — only btop's host ports are current; HTTP services use Caddy |
| `CLOUDFLARE-SETUP.md` | — (pruned) | superseded by `deploy/INFRA-NOTES.md` + `~/workspace/proxy/` |
| `QUICKSTART.md` | — (pruned) | superseded by README + `~/workspace/proxy/` |
| `MONITORING_PANE.md` | — (pruned) | the portal page itself plays this role now |
| `scripts/setup-cloudflare-tunnel.sh` | — (pruned) | host-systemd cloudflared scheme retired |
| `scripts/setup-auto-pull.sh`, `scripts/auto-pull.sh`, `scripts/README.md` | — (pruned) | targeted `~/projects/prod/`; retired |

`AGENTS.md`'s "Where to look first" section now points at the new
`docs/*.md` files; the "Legacy root MDs" section is gone.

**Consequences.** The repo root is no longer a scratchpad of stale
topic pages. New content goes under `docs/` and gets referenced from
`AGENTS.md`. The `.github/workflows/deploy.yml` is the only remaining
artifact of the retired auto-deploy scheme — flagged in
`docs/todo.md` for follow-up rather than bundled here.

---

## 2026-05-29 — Remove the dead GitHub Actions deploy workflow

**Context.** `.github/workflows/deploy.yml` SSHed to
`~/projects/prod/vedanta-systems` (retired workspace path) and did
`git pull && docker compose up`. Dead since the workspace layout
moved to `~/workspace/dev/`, and `~/workspace/prod/` (the prod
replica directory) is not yet set up per the layout note in
`~/.claude/CLAUDE.md`.

**Decision.** Delete. The planned replacement for "push-to-main
auto-rebuilds prod" is workspace-level — local code copy or local
pull into `~/workspace/prod/<project>` with no GitHub round-trip —
and lives in `~/workspace/` somewhere, not per-project. Carrying a
misleading per-project workflow until the workspace-level scheme
exists is worse than no workflow.

**Consequences.** Push-to-main has no auto-deploy effect for this
repo. Prod deploys are manual
(`docker compose -f docker-compose.yml up -d --build`) until the
workspace-level scheme lands. Not tracked here further; that work
isn't vedanta-systems' scope.

---
