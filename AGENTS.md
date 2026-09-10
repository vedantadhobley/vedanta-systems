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
  plus the NATS-backed btop router (`src/server/routes/btop.ts`) and legacy
  host-gateway proxies. The dev luv tile uses NATS; production still uses
  the legacy image and routes.
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
- **btop monitor**: the live legacy path still duplicates the luv collector by
  environment. Both luv-hosted SSH collectors for joi are stopped and gated
  behind the `legacy-joi` profile after joi's NixOS and network migration. The
  replacement is one native exporter per physical node;
  its owning control plane consumes a private HTTP/SSE stream and publishes
  ordered frames through Core NATS to the BFF. The durable reconciled source
  is now `~/workspace/btop/vedanta-profiles` at `4aca040`; the old dirty
  `~/workspace/btop/src` remains preserved. Control's `feat/btop-telemetry`
  branch owns the standing luv exporter/relay used by the existing dev page
  through workspace NATS; the public frontend remains on the legacy path.
  This repo's `btop/src` is the stale public-display child
  used by the legacy image. See `docs/btop.md`.

## Surfaced projects (vs-api integration status)

| Project | What vs-api does today | Target shape |
|---|---|---|
| **found-footy** | **Pattern B.** Proxies the Go read API, resolves targeted `fixture.update`/`event.update` hints, forwards inline `fixture.status`, and re-proxies share-id media. FF-085/FF-086 is deployed in production and validating natural event delivery. | Done — no direct mongo/minio peers. |
| **spin-cycle** | Reads `spin-cycle-{env}-postgres` directly (Pattern A) | `spin-cycle-{env}-api:3000` already exists — vs-api just needs to swap from pg pool to HTTP proxy. |
| **long-exposure** | Reads `long-exposure-{env}-postgres` directly (Pattern A, by design until LE grows its own API) | Pattern B once LE has a separate api service. The `caddy.d/long-exposure.caddy` file documents the current design. |
| **btop-luv / btop-joi** | Both dev tiles use `/api/btop/{luv,joi}` through NATS. Production retains the legacy bundle. | One native exporter per node → Control relay → Core NATS → BFF/SSE. |
| **legal-tender** | Not surfaced. | Pattern B from day one when it lands. |

Pattern A vs B is the central architectural call here — see
[`docs/decisions.md`](./docs/decisions.md) for the rationale.

## Where to look first

- @README.md — public-facing project description
- @docs/design.md — **the living design brief**: confirmed clarity/response constraints, working BR2049 × lavender-phosphor direction, references, and open questions. References and existing code are not authority.
- @docs/design-system.md — working two-plane interface contract: crisp container plane above luminous phosphor data, composite controls, reusable primitives, and progressive adoption from the current UI
- @docs/plans/frontend-refoundation.md — active frontend architecture and migration gates; the neutral shell and layout-stability foundation precedes further visual component work
- @docs/plans/frontend-shell.md — active viewport, scroll-owner, safe-area, bottom-navigation, and structural-handoff contract
- @docs/plans/frontend-redesign.md — historical shell studies and instrument workbench log; not the active migration plan
- @docs/frontend-audit.md — dated evidence for lifecycle, input, accessibility, performance, and component-boundary problems
- @docs/full-project-audit-2026-08-20.md — first whole-project audit across frontend, BFF, security, deployment, dependencies, runtime, and docs
- @docs/found-footy-live-data.md — FF-077 NATS/SSE/REST contract, targeted updates, recovery, live intent, and carryover behavior
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
- **Adding any route that writes / refreshes / triggers anything.** Enforce
  authorization or an internal network boundary in Express and block the full
  public path family in nginx. An exact nginx location alone is insufficient
  because Express accepts trailing slashes. Internal callers (other containers
  on `luv-prod`) hit `vedanta-systems-prod-api:3001` directly, bypassing nginx.
- **btop changes.** Btop C++ hardware/public-display changes belong in the
  durable `~/workspace/btop/vedanta-profiles` checkout. Control owns packaging,
  exporter/relay behavior, and explicit per-node configuration profiles.
  BFF transport and browser integration belong here. Do not patch the stale embedded
  `btop/src` child; migrate packaging to the authoritative source instead.
- **Anything social-link related** (OG cards, Twitter cards, embed unfurls). Served by `og-server.js` via nginx's crawler routing (`error_page 418`). Production-only (dev doesn't run nginx).

## Active state

- **Audit containment and btop transport active**: contain the credential,
  development-container, public HTTP, refresh-path, restart-storm, and memory
  risks before another public deployment. This repo then owns the btop BFF and
  browser migration; exporter, relay, NATS, and node-deployment work stays in
  its cross-project owners. See @docs/todo.md.
- **Frontend visual/component re-foundation paused**: FF-077 has landed the
  Found Footy data foundation in source: backend-owned presentation, targeted
  live updates, live/pinned intent, carryover, and recovery. Route ownership,
  explicit freshness UI, accessible primitives, and the two-plane visual
  migration remain. Do not apply the visual system until its design is ready.
- **FF-085/FF-086 deployed, validating (2026-09-08)**: production runs
  consumer `ca1f8e5` with Found Footy `3723ce2` (includes producer `dbc2a76`)
  and shared schemas `fcfb28f`. Only `event.update` / SSE `event_update` is
  accepted, with full event upserts, missing-parent recovery, and bounded
  diagnostics. Release identities, public REST, NATS subscription, and SSE
  connection/heartbeat/reopening passed independent checks. Natural clip and
  no-candidate completion delivery to React remains unproven. Existing tabs
  need the new browser bundle; reconnect alone cannot replace old JavaScript.
  Keep producer and consumer wire contracts matched. See
  [the live-data release gate](./docs/found-footy-live-data.md#coordinated-release-gate).
- **found-footy FF-077 live, validating**: the coordinated production rollout
  landed 2026-08-30 with Found Footy `e26966a`, this consumer `81db099`, and
  shared schema `fb04fee`; Found Footy records rollout evidence in `36fcf62`.
  Public REST serves one fixture collection with the root presentation
  projection; the production NATS bridge is connected.
  Natural matches still need to validate inline status transitions and the
  targeted fixture/video paths. **Load-bearing:** `found-footy-{env}-garage`
  must be aliased `garage` on `luv-{env}` or video 502s; NATS environment
  isolation is currently by subject token, not creds.
- **Caddy migration**: complete and load-bearing. cloudflared moved out of vs-prod into `~/workspace/proxy/` (commit `6c8c480`). Vite dev proxy target fixed to `vedanta-systems-dev-api:3001` (commit `62ba907`). Internal in-container nginx kept — it's not redundant with Caddy.
- **Long Exposure surfaced**: the current browser includes date navigation,
  day/week views, and the day timeline over the Pattern-A Postgres route.
  Ticker filtering, accessible timeline interaction, correct exchange-time
  handling, and quarterly-extensible primitives remain in @docs/todo.md.
- **Spin-cycle**: route active. Project itself is scheduled for maintenance (out-of-band). vs-api spin-cycle route is gated on `SPIN_CYCLE_POSTGRES_URI` at startup but doesn't currently degrade gracefully if the upstream goes away mid-flight. Decide-during-maintenance is in @docs/todo.md.
- **Legal Tender**: not surfaced. It must use Pattern B when it lands.
- **btop**: production luv remains on the legacy path; both dev tiles use NATS
  on the normal `/workspace/vedanta-systems` page without visual changes. The
  old duplicate collectors remain running for rollback. joi's failed
  legacy collectors are stopped and disabled because that path SSHes from luv
  into the pre-migration host.
  The NATS consumer, shared frame schema, and current-upstream source
  profile have landed. The un-deployed direct agent publisher was a boundary
  mistake and is superseded. Control's permanent luv exporter/relay uses
  workspace NATS with automatic startup; the temporary test stack is removed.
  Release `2026-09-10.3` serves dev and passes packaged hardware,
  crash/freeze/broker/BFF recovery, and Chromium/WebKit acceptance. Its explicit
  physical-port profile, capture supervision, and five-second snapshots are
  documented in `docs/btop-recovery.md`. The private luv socket, bounded BFF
  streams, full-frame reconnect, and browser frame-based freshness are tested.
  Joi's same-image native Docker exporter is now activated through NixOS with
  a luv-only private firewall rule and a separate Control relay on luv.
  Hardware checks and exporter/relay recovery pass without changing inference.
  Both nodes pass Chromium/WebKit on the real dev page.
  Standing exporter/relay restart recovery passes; physical node reboot and actual
  iPhone/final-ingress acceptance and Vulkan utilization remain; no production
  tile has switched. The next production build selects both new routes, so
  do not deploy this branch before final-ingress and phone acceptance.
  See `docs/btop.md`.
  Phone acceptance uses the existing dev frontend/API and workspace broker.
  The showcase HTML, test UI server, and preview-only overlays are removed.
  Do not add another human-preview UI container or hostname. Control's btop
  worktree is a live bind-mount dependency; preserve it until a separate path
  migration. See `docs/btop-browser-acceptance.md` for the owning runbook.
- **NATS authentication deferred to joi's production transition (2026-09-10)**:
  follow the [cross-project decision](../../vedanta-dhobley/docs/decisions/2026-09-10-defer-nats-authentication.md).
  Authentication is not a btop migration gate. Both BFF bridges
  now accept `NATS_CREDS_FILE`, with an optional `BTOP_NATS_CREDS` override.
  NATS owns the isolated JWT/account candidate; Control owns luv's private
  Unix-socket exporter/relay. Authenticated terminal/SSE and Found Footy
  event/REST reconnect tests pass. Keep credential support and tests staged;
  leave live credential settings unset. Physical-device and final-ingress
  acceptance remain btop gates; credential provisioning and coordinated
  broker/client activation belong to the later authentication rollout.
  The live broker configuration is unchanged; the standing luv relay now uses it.

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
