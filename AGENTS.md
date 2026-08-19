# Vedanta Systems — Agent Context

`vedanta.systems` — the unified portal that hosts UIs for my project
ecosystem (found-footy, spin-cycle, long-exposure) plus live system
monitoring (btop on luv + joi). The current implementation is a React +
shadcn/ui frontend with an Express BFF API, fronted by Caddy and exposed
publicly through Cloudflare Tunnel. The single public surface; everything else
stays internal/tailnet-only.

This repo is one half of the workspace's "project hub." Its sibling
is `~/workspace/proxy/` — the Caddy + dnsmasq + cloudflared stack that
routes every URL on this node. Most changes here pair with a change
there; don't think of them in isolation.

This file is your front door. Read it first; follow the imports below.

## Cross-cutting context

Workspace-wide rules, node topology, and cross-project decisions live in [`~/workspace/vedanta-dhobley/`](../../vedanta-dhobley/). Every agent session reads its global `AGENTS.md` automatically via symlinks (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`); this pointer exists so anyone browsing the repo sees the pattern.

- [`AGENTS.md`](../../vedanta-dhobley/AGENTS.md) — operating model, commit conventions, Docker-first policy, host-port scheme, `mem_limit` rules, tailnet FQDN rule, privacy preferences
- [`docs/topology.md`](../../vedanta-dhobley/docs/topology.md) — aerial view of nodes, services, routing, messaging, roadmap
- [`docs/decisions.md`](../../vedanta-dhobley/docs/decisions.md) — timestamped rationale for locked-in choices
- [`docs/plans/2026-08-15-cutover.md`](../../vedanta-dhobley/docs/plans/2026-08-15-cutover.md) — vedanta-systems' frontend redesign is a workstream in this plan

**Where things belong:** if a decision in this project turns out to be cross-project, raise it in dhobley — do not duplicate it here.

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

- **Current frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui.
  Filesystem-style URL navigation (`~/workspace/<project>` paths;
  React Router DOM v7). The active re-foundation retains React and migrates
  route ownership plus a source-owned component system progressively.
- **Express API server** (`src/server/index.ts`): TypeScript via `tsx`.
  Per-project routers under `src/server/routes/{found-footy,spin-cycle,long-exposure}.ts`,
  plus a fixed-user GitHub contribution router (`src/server/routes/github.ts`;
  server-only `GITHUB_TOKEN`, 15-minute cache),
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
| **found-footy** | **Pattern B, live both envs.** Proxies the Go read API (`found-footy-{env}-api:8081`) for fixtures/search/events (reshaped by the shim), plus a NATS live-feed bridge (`found-footy.<env>.>` → SSE) and share_id video re-proxy (302 → presigned Garage). Dev 2026-08-13, prod 2026-08-15. | Done — no direct mongo/minio peers. |
| **spin-cycle** | Reads `spin-cycle-{env}-postgres` directly (Pattern A) | `spin-cycle-{env}-api:3000` already exists — vs-api just needs to swap from pg pool to HTTP proxy. |
| **long-exposure** | Reads `long-exposure-{env}-postgres` directly (Pattern A, by design until LE grows its own API) | Pattern B once LE has a separate api service. The `caddy.d/long-exposure.caddy` file documents the current design. |
| **btop-luv / btop-joi** | Express proxies `/api/btop-{luv,joi}/{health,stream}` to the per-node btop container via host gateway (4102/4103 dev, 3102/3103 prod). | n/a — `network_mode: host` is incompatible with Caddy fronting. |
| **legal-tender** | Not surfaced. | Pattern B from day one when it lands. |

Pattern A vs B is the central architectural call here — see
[`docs/decisions.md`](./docs/decisions.md) for the rationale.

## Where to look first

- @README.md — public-facing project description
- @docs/design.md — **the living design brief**: confirmed clarity/response constraints, working BR2049 × lavender-phosphor direction, references, and open questions. References and existing code are not authority.
- @docs/design-system.md — working two-plane interface contract: crisp container plane above luminous phosphor data, composite controls, reusable primitives, and progressive adoption from the current UI
- @docs/plans/frontend-refoundation.md — **active frontend plan**: runtime correctness, route ownership, accessibility, component-system boundaries, and migration gates
- @docs/plans/frontend-redesign.md — historical shell studies and instrument workbench log; not the active migration plan
- @docs/frontend-audit.md — dated evidence for lifecycle, input, accessibility, performance, and component-boundary problems
- @src/components/UI-PATTERNS.md — current production interaction and video behavior; migration evidence, not the new component API
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

- **Container names = URLs** per `~/workspace/proxy/CONVENTIONS.md`. The container `vedanta-systems-prod` (bare project name) is the documented exception — it's the only frontend in the workspace.
- **Pattern A → Pattern B** for cross-project integration. Don't add new direct-DB peers in vs-api; new projects get Pattern B from day 1.
- **No host HTTP ports** for vs-prod / vs-prod-api / vs-dev / vs-dev-api. Routing is through Caddy on the `proxy` external docker network.
- **Tailnet identifier**: `.env` is gitignored; use `<base-domain>` or `{$BASE_DOMAIN}` as the stand-in per the workspace tailnet-FQDN rule.
- **Dependency installs**: `docker exec` into the running container per the workspace Docker-first policy. Edit `package.json` directly when changing the dependency list.

## Things to check before doing X

- **Adding a new surfaced project.** Read `~/workspace/proxy/CONVENTIONS.md` first — naming, networks, role vocabulary, and Pattern A vs B are all there. New projects should be Pattern B (vs-api proxies HTTP to a per-project `<project>-{env}-api`). Add the Caddy route in `~/workspace/proxy/caddy/caddy.d/<project>.caddy`; not in this repo.
- **Touching the prod request path.** Edits often span this repo *and* `~/workspace/proxy/`. The path is browser → Cloudflare → cloudflared → `proxy-caddy:80` → `vedanta-systems-prod:3000` → in-container nginx → (SPA or `vedanta-systems-prod-api:3001`). Caddy = hostname routing only; nginx = crawler-to-OG routing, internal-webhook 404s, SSE buffering, video range-request handling. Don't conflate.
- **Touching the dev request path.** No nginx involved. The Vite dev server runs inside `vedanta-systems-dev` and Vite's built-in proxy maps `/api/*` → `vedanta-systems-dev-api:3001`. If `/api/*` 502s in dev, check `vite.config.ts` first — that proxy target was wrong recently (host-port that didn't exist; fixed in `62ba907`).
- **Adding a project route.** Under the current architecture, follow the
  long-exposure route/BFF/type pattern and mount it in `src/server/index.ts`
  plus `src/App.tsx`. During the frontend re-foundation, also give the route a
  lazy surface and route-owned provider; do not add another global provider.
- **Adding any route that writes / refreshes / triggers anything.** Add a `location = /api/<project>/<write-path> { return 404; }` block in `nginx.conf` so internet traffic can't reach it. Internal callers (other containers on `luv-prod`) hit `vedanta-systems-prod-api:3001` directly, bypassing nginx — they keep working.
- **btop changes.** AMD APU patches live in `btop/src/`. The known iGPU-busy-pct bug (Vulkan workloads read 0%) is a kernel/driver gap that can't be patched in btop itself — point users at `amdgpu_top` on the node instead.
- **Anything social-link related** (OG cards, Twitter cards, embed unfurls). Served by `og-server.js` via nginx's crawler routing (`error_page 418`). Production-only (dev doesn't run nginx).

## Active state

- **Frontend re-foundation active**: Found Footy is the first full route slice.
  The production interface remains the behavior baseline. The active plan
  combines wake/reconnect/date correctness, route ownership, accessible input
  primitives, and the two-plane component system; the instrument workbench is
  evidence only. See @docs/plans/frontend-refoundation.md.
- **found-footy Pattern B — live both envs (prod cutover 2026-08-15)**: `src/server/routes/found-footy.ts` shims the Go read API (`found-footy-{env}-api:8081`; fixtures/search/events reshaped to the legacy frontend shape) + a NATS→SSE bridge (env-scoped to `found-footy.<env>.>`) + share_id video/download re-proxy (302 → presigned `garage:3900`, streamed same-origin). **Load-bearing:** `found-footy-{env}-garage` must be aliased `garage` on `luv-{env}` or video 502s; the NATS broker is open mode (env isolation is by subject token, no creds). Dev landed 2026-08-13, prod verified end-to-end 2026-08-15 — see @docs/decisions.md.
- **Caddy migration**: complete and load-bearing. cloudflared moved out of vs-prod into `~/workspace/proxy/` (commit `6c8c480`). Vite dev proxy target fixed to `vedanta-systems-dev-api:3001` (commit `62ba907`). Internal in-container nginx kept — it's not redundant with Caddy.
- **Long Exposure surfaced**: the current browser includes date navigation,
  day/week views, and the day timeline over the Pattern-A Postgres route.
  Ticker filtering, accessible timeline interaction, correct exchange-time
  handling, and quarterly-extensible primitives remain in @docs/todo.md.
- **Spin-cycle**: route active. Project itself is scheduled for maintenance (out-of-band). vs-api spin-cycle route is gated on `SPIN_CYCLE_POSTGRES_URI` at startup but doesn't currently degrade gracefully if the upstream goes away mid-flight. Decide-during-maintenance is in @docs/todo.md.
- **Legal Tender**: not surfaced. It must use Pattern B when it lands.
- **btop**: working on luv + joi via per-node containers. Known issue: Vulkan iGPU busy% reads 0% (kernel/driver gap; see `docs/btop.md`).
- **Open infra question**: `nginx.conf`'s `/btop-luv/` location block references `vedanta-systems-prod-btop` (singular) — predates the luv/joi split where the actual container is `vedanta-systems-prod-btop-luv`. Probably stale/dead; verify before pruning. Tracked in @docs/todo.md.

## Memory model (for me, the agent)

This project uses **`AGENTS.md` (this file) as the canonical agent
context**, not auto-memory. Auto-memory at
`~/.claude/projects/-home-vedanta-workspace-dev-vedanta-systems/memory/`
should hold only **user-scoped preferences** that don't belong in a
versioned repo file. Per the anti-pattern note in the shared
[`AGENTS.md`](../../vedanta-dhobley/AGENTS.md),
project facts go here in the repo so they're version-controlled and
visible to all tools.

## When something I learn doesn't fit anywhere

- **Project fact** → update the relevant `docs/*.md` (or this file if it's load-bearing front-door context)
- **Architectural decision** → append to @docs/decisions.md with date
- **Deferred work / TODO** → @docs/todo.md
- **Workspace-wide convention** → `~/workspace/proxy/CONVENTIONS.md` (not here)
- **Cross-project user preference** →
  [`vedanta-dhobley/AGENTS.md`](../../vedanta-dhobley/AGENTS.md) (not here)
- **Project-specific user preference** → auto-memory
