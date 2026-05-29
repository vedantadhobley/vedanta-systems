# Vedanta Systems — Agent Context

`vedanta.systems` — the unified portal that hosts UIs for my project
ecosystem (found-footy, spin-cycle, long-exposure) plus live system
monitoring (btop on luv + joi). React + shadcn/ui frontend + Express
BFF API, fronted by Caddy and exposed publicly through Cloudflare
Tunnel. The single public surface; everything else stays
internal/tailnet-only.

This repo is one half of the workspace's "project hub." Its sibling
is `~/workspace/proxy/` — the Caddy + dnsmasq + cloudflared stack that
routes every URL on this node. Most changes here pair with a change
there; don't think of them in isolation.

This file is your front door. Read it first; follow the imports below.

## Run

```bash
docker compose -f docker-compose.dev.yml up -d --build         # dev
docker compose -f docker-compose.yml     up -d --build         # prod
```

URLs (replace `<base-domain>` with the value of `$BASE_DOMAIN`):

- Public prod: <https://vedanta.systems>
- Dev frontend (tailnet): `http://vedanta-systems-dev.<base-domain>/`
- Dev API (tailnet, direct): `http://vedanta-systems-dev-api.<base-domain>/api/health`

See `deploy/INFRA-NOTES.md` for Caddy routes + Cloudflare tunnel setup.
The proxy stack itself lives in `~/workspace/proxy/`; its
`CONVENTIONS.md` is the workspace contract this repo conforms to.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui.
  Filesystem-style URL navigation (`~/workspace/<project>` paths;
  React Router DOM v7).
- **Express API server** (`src/server/index.ts`): TypeScript via `tsx`.
  Per-project routers under `src/server/routes/{found-footy,spin-cycle,long-exposure}.ts`,
  plus a btop reverse-proxy mounted inline that targets the per-node
  btop containers via `host-gateway` (prod) / `host.docker.internal` (dev).
- **In-container nginx** (`nginx.conf`, prod only): the *internal*
  reverse proxy inside `vedanta-systems-prod`. Caddy fronts the outside
  of this container on `:3000`; nginx routes inside it between static
  files, the OG server (`og-server.js`, social link unfurls for
  crawlers via `error_page 418`), the API (`/api/*` →
  `vedanta-systems-prod-api:3001`), and btop SSE. Handles cache
  headers, 404s on internal-only webhook paths
  (`/api/{found-footy,spin-cycle}/refresh`), and SSE / range-request
  quirks. **Not redundant with Caddy** — Caddy = outside, nginx =
  inside. Dev doesn't use nginx — the Vite dev server proxies `/api`
  → api container directly via `vite.config.ts`.
- **Caddy** (`~/workspace/proxy/`): workspace-wide ingress.
  `vedanta.systems` flows through Cloudflare Tunnel →
  `proxy-caddy:80` → `vedanta-systems-prod:3000`. Tailnet dev hosts
  at `vedanta-systems-dev.<base-domain>` + `vedanta-systems-dev-api.<base-domain>`.
- **Cloudflared**: extracted to `~/workspace/proxy/` as a sibling of
  caddy in commit `6c8c480`. Tunnel name `vedanta-systems-prod`;
  credentials at `~/.cloudflared/`.
- **btop monitor**: a custom-patched btop + Python SSE broadcaster in
  its own container per node (luv + joi), with `network_mode: host`
  for true network/process visibility. luv = local; joi = same image
  but the entrypoint SSHes out to joi and runs btop there.
  AMD-APU-specific patches (GTT memory type, rocm-smi v1.x acceptance,
  custom theme) in `btop/src/`. See `docs/btop.md`.

## Surfaced projects (vs-api integration status)

| Project | What vs-api does today | Target shape |
|---|---|---|
| **found-footy** | Reads `found-footy-{env}-mongo` + `found-footy-{env}-minio` directly (Pattern A) | Proxy `/api/found-footy/*` → `found-footy-{env}-api:8080` (a dev api already exists per `~/workspace/proxy/caddy/caddy.d/found-footy.caddy`). |
| **spin-cycle** | Reads `spin-cycle-{env}-postgres` directly (Pattern A) | `spin-cycle-{env}-api:3000` already exists — vs-api just needs to swap from pg pool to HTTP proxy. |
| **long-exposure** | Reads `long-exposure-{env}-postgres` directly (Pattern A, by design until LE grows its own API) | Pattern B once LE has a separate api service. The `caddy.d/long-exposure.caddy` file documents the current design. |
| **btop-luv / btop-joi** | Express proxies `/api/btop-{luv,joi}/{health,stream}` to the per-node btop container via host gateway (4102/4103 dev, 3102/3103 prod). | n/a — `network_mode: host` is incompatible with Caddy fronting. |
| **legal-tender** | Not surfaced. | Pattern B from day one when it lands (≥1 week out). |

Pattern A vs B is the central architectural call here — see
[`docs/decisions.md`](./docs/decisions.md) for the rationale.

## Where to look first

- @README.md — public-facing project description (stale; rewrite queued in @docs/todo.md)
- @deploy/INFRA-NOTES.md — Caddy + Cloudflared bring-up reference for this repo's slice
- @docs/architecture.md — request paths (prod via Caddy → in-container nginx → SPA / api / og-server; dev via Caddy → Vite proxy → api), network model, btop's network_mode:host exception
- @docs/btop.md — btop integration deep dive (AMD APU patches, custom theme, SSE protocol, known iGPU Vulkan 0% issue)
- @docs/ports.md — host-port allocation (btop only; HTTP services go through Caddy)
- @docs/found-footy-timezone.md — fixture-visibility rule × timezone-toggle interaction (load-bearing for found-footy-browser.tsx)
- @docs/decisions.md — append-only architectural decisions log
- @docs/todo.md — active work + deferred items
- `~/workspace/proxy/CONVENTIONS.md` — workspace-wide naming + networking contract (cross-repo)
- `~/workspace/proxy/README.md` — proxy stack mechanics (Caddy / dnsmasq / cloudflared, the `caddy reload` bind-mount gotcha)

## Conventions

- **Commits**: no `Co-Authored-By: Claude` trailer. Lowercase prefix style: `feat:`, `fix:`, `chore:`, `docs:`, `perf:`, `refactor:`, `test:`. Scope in parens when useful (`fix(dev):`, `chore(api):`). Multi-paragraph messages via HEREDOC.
- **Container names = URLs** per `~/workspace/proxy/CONVENTIONS.md`. The container `vedanta-systems-prod` (bare project name) is the documented exception — it's the only frontend in the workspace.
- **Pattern A → Pattern B** for cross-project integration. Don't add new direct-DB peers in vs-api; new projects get Pattern B from day 1.
- **No host HTTP ports** for vs-prod / vs-prod-api / vs-dev / vs-dev-api. Routing is through Caddy on the `proxy` external docker network.
- **btop is the documented exception**: `network_mode: host` (needs real network/process visibility), so it binds host ports directly. The Express API proxies to it via `host-gateway` / `host.docker.internal`.
- **Tailnet identifier**: never commit the FQDN to tracked files. `.env` is gitignored; use `<base-domain>` or `{$BASE_DOMAIN}` as the stand-in.
- **Dependency installs go inside the running container** (`docker exec`), not on the host. Edit `package.json` directly when changing the dependency list.

## Things to check before doing X

- **Adding a new surfaced project.** Read `~/workspace/proxy/CONVENTIONS.md` first — naming, networks, role vocabulary, and Pattern A vs B are all there. New projects should be Pattern B (vs-api proxies HTTP to a per-project `<project>-{env}-api`). Add the Caddy route in `~/workspace/proxy/caddy/caddy.d/<project>.caddy`; not in this repo.
- **Touching the prod request path.** Edits often span this repo *and* `~/workspace/proxy/`. The path is browser → Cloudflare → cloudflared → `proxy-caddy:80` → `vedanta-systems-prod:3000` → in-container nginx → (SPA or `vedanta-systems-prod-api:3001`). Caddy = hostname routing only; nginx = crawler-to-OG routing, internal-webhook 404s, SSE buffering, video range-request handling. Don't conflate.
- **Touching the dev request path.** No nginx involved. The Vite dev server runs inside `vedanta-systems-dev` and Vite's built-in proxy maps `/api/*` → `vedanta-systems-dev-api:3001`. If `/api/*` 502s in dev, check `vite.config.ts` first — that proxy target was wrong recently (host-port that didn't exist; fixed in `62ba907`).
- **Adding a project route.** Pattern from long-exposure: drop `src/server/routes/<project>.ts` + `src/types/<project>.ts` + `src/components/<project>-browser.tsx`, then mount the router in `src/server/index.ts` and wire a folder card in `src/App.tsx` (`folderContents['~/workspace']` + `projectGithubLinks` + `projectDescriptions` + a `DirectoryListing` block).
- **Adding any route that writes / refreshes / triggers anything.** Add a `location = /api/<project>/<write-path> { return 404; }` block in `nginx.conf` so internet traffic can't reach it. Internal callers (other containers on `luv-prod`) hit `vedanta-systems-prod-api:3001` directly, bypassing nginx — they keep working.
- **btop changes.** AMD APU patches live in `btop/src/`. The known iGPU-busy-pct bug (Vulkan workloads read 0%) is a kernel/driver gap that can't be patched in btop itself — point users at `amdgpu_top` on the node instead.
- **Anything social-link related** (OG cards, Twitter cards, embed unfurls). Served by `og-server.js` via nginx's crawler routing (`error_page 418`). Production-only (dev doesn't run nginx).

## Active state

- **Caddy migration**: complete and load-bearing. cloudflared moved out of vs-prod into `~/workspace/proxy/` (commit `6c8c480`). Vite dev proxy target fixed to `vedanta-systems-dev-api:3001` (commit `62ba907`). Internal in-container nginx kept — it's not redundant with Caddy.
- **Long Exposure surfaced (v1, landed 2026-05-28)**: `src/components/long-exposure-browser.tsx` + `src/server/routes/long-exposure.ts` + `src/types/long-exposure.ts` + compose env wiring (`LONG_EXPOSURE_POSTGRES_URI` on dev + prod api containers) + a folder card / render block in `App.tsx`. Minimal v1 lists today's narrated events grouped by scorer. Drill-down / daily synthesis / weekly aggregate / quarterly-extensible reusable components are queued — see @docs/todo.md.
- **Spin-cycle**: route active. Project itself is scheduled for maintenance (out-of-band). vs-api spin-cycle route is gated on `SPIN_CYCLE_POSTGRES_URI` at startup but doesn't currently degrade gracefully if the upstream goes away mid-flight. Decide-during-maintenance is in @docs/todo.md.
- **Legal Tender**: not surfaced. ETA ≥1 week (out of band).
- **btop**: working on luv + joi via per-node containers. Known issue: Vulkan iGPU busy% reads 0% (kernel/driver gap; see `docs/btop.md`).
- **Open infra question**: `nginx.conf`'s `/btop-luv/` location block references `vedanta-systems-prod-btop` (singular) — predates the luv/joi split where the actual container is `vedanta-systems-prod-btop-luv`. Probably stale/dead; verify before pruning. Tracked in @docs/todo.md.

## Memory model (for me, the agent)

This project uses **`AGENTS.md` (this file) as the canonical agent
context**, not auto-memory. Auto-memory at
`~/.claude/projects/-home-vedanta-workspace-dev-vedanta-systems/memory/`
should hold only **user-scoped preferences** that don't belong in a
versioned repo file. Per the anti-pattern note in `~/.claude/CLAUDE.md`,
project facts go here in the repo so they're version-controlled and
visible to all tools.

## When something I learn doesn't fit anywhere

- **Project fact** → update the relevant `docs/*.md` (or this file if it's load-bearing front-door context)
- **Architectural decision** → append to @docs/decisions.md with date
- **Deferred work / TODO** → @docs/todo.md
- **Workspace-wide convention** → `~/workspace/proxy/CONVENTIONS.md` (not here)
- **Cross-project user preference** → `~/.claude/CLAUDE.md` (not here)
- **Project-specific user preference** → auto-memory
