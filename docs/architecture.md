# Architecture

How a request reaches the right place in vedanta-systems, and how the
containers wire together. Reflects post-Caddy-migration reality
(2026-05). Replaces the pre-Caddy `CONTAINER-ARCHITECTURE.md`.

For naming + cross-project conventions across the workspace, see
`~/workspace/proxy/CONVENTIONS.md`.

## Request paths

### Prod — public

```
browser
  → https://vedanta.systems  (TLS terminated at Cloudflare edge)
  → Cloudflare Tunnel  (cloudflared in ~/workspace/proxy/)
  → http://proxy-caddy:80  (Caddy on the proxy docker network)
  → reverse_proxy vedanta-systems-prod:3000  (caddy.d/public.caddy)
  → in-container nginx  (listening on :3000)
        ├─ /            and /assets/*   → /app/dist (Vite build, static)
        ├─ /api/*                       → vedanta-systems-prod-api:3001 (Express, project-internal network)
        ├─ /api/{found-footy,spin-cycle}/refresh[/...] → return 404
        ├─ /api/btop-{luv,joi}, .../    → return 404 (only /stream + /health exposed; standalone viewer not public)
        └─ User-Agent matches crawler   → error_page 418 → og-server.js on 127.0.0.1:3002 (dynamic OG meta tags)
```

In prod, Caddy = outside vs-prod, nginx = inside vs-prod. Different
jobs, not a duplicated layer. Caddy owns the edge-scheme redirect and baseline
response headers. nginx owns application paths and marks every proxied API
request as public before Express handles it.

### Dev — tailnet

No nginx in dev. Vite owns same-origin /api proxying.

```
browser
  → http://vedanta-systems-dev.<base-domain>/        (Caddy → Vite dev server in vedanta-systems-dev:3000)
  → http://vedanta-systems-dev-api.<base-domain>/    (Caddy → vedanta-systems-dev-api:3001, direct, for curl testing)
```

Inside the dev frontend container, Vite's built-in proxy
(`vite.config.ts`) maps `/api/*` → `vedanta-systems-dev-api:3001`,
so the SPA stays same-origin. Vite and the direct dev-API Caddy route overwrite
`X-Vedanta-Public: 1`; Express uses that marker to reject internal-only webhook
routes. Shared-network service callers reach the API container directly and do
not receive the marker. If `/api/*` 502s in dev, that proxy
target is the first place to check — it was wrong recently (host
port that didn't exist; fixed in commit `62ba907`).

## Frontend runtime

The current SPA statically imports the project browsers. Found Footy's provider
is mounted only while its route is visible, so its snapshot requests, target
lookups, timers, and SSE connection end on route exit. Spin Cycle's provider
still sits above the router and can fetch while another route is visible.
FF-077 gives Found Footy a complete authoritative snapshot plus targeted SSE
replacements and reconciles wake, reconnect, page restore, online, video
resume, midnight, and timezone changes. Visible freshness state remains open.

The active [frontend re-foundation plan](./plans/frontend-refoundation.md)
moves code, provider, request, and stream ownership to each route. Its
snapshot/SSE reconciliation and live-versus-pinned date contract landed in
FF-077, and the retained-share slice landed Found Footy's route ownership. The
remaining providers and component slices stay active plan work.

### Cross-project — the data plane

Express on `vedanta-systems-{env}-api` reaches other projects over the
`luv-{env}` shared docker network. Two shapes coexist:

**Pattern B (HTTP) — found-footy**, both envs as of the 2026-08-15 prod
cutover (`docs/decisions.md`):

| Caller | Callee | Purpose |
|---|---|---|
| `vs-{env}-api` | `found-footy-{env}-api:8081` | fixtures / search / event resolution — REST, reshaped by the shim |
| `vs-{env}-api` | `nats:4222` | live-feed bridge — subscribes `found-footy.<env>.>`, fans to SSE |
| `vs-{env}-api` | `garage:3900` | video/download — follows the Go API's 302 to a presigned Garage URL and re-streams the bytes (Garage isn't browser-reachable) |

**Pattern A (direct DB) — the remaining projects**, until each grows its
own API:

| Caller | Callee | Network |
|---|---|---|
| `vs-{env}-api` | `spin-cycle-{env}-postgres` | `luv-{env}` |
| `vs-{env}-api` | `long-exposure-{env}-postgres` | `luv-{env}` |

Pattern B is the target for all of them; migration is tracked per project
in `docs/todo.md`.

### Portal-owned external data — GitHub contributions

The contribution masthead reads GitHub through the Express BFF:

```
browser
  → GET /api/github/contributions
  → vedanta-systems-{env}-api
  → GitHub GraphQL API (server-only GITHUB_TOKEN)
```

The route is fixed to `vedantadhobley`; it is not a general GitHub proxy.
It returns only contribution date, count, and level, caches the upstream
response for 15 minutes, and serves the last successful response if a
refresh fails. The classic PAT has only `read:user`, which includes
publicized private contribution counts but grants no repository-content or
write access. Never pass this credential through a `VITE_*` variable:
Vite substitutes those values into the public browser bundle.

### btop — the host-network exception

btop needs real host process + network visibility, so its containers
run with `network_mode: host` and bind directly to host ports —
they're invisible to docker DNS and can't be Caddy-fronted.

```
browser
  → vedanta.systems/api/btop-luv/{health,stream}  (in-container nginx, prod)
    or /api/btop-luv/* directly via Vite proxy    (dev)
  → vedanta-systems-{env}-api  (Express; mountBtopProxy in src/server/index.ts)
  → http://host-gateway:3102 / 4102  (luv node, prod / dev)
    http://host-gateway:3103 / 4103  (joi node — same image, entrypoint SSHes to joi and runs btop there)
  → Python SSE broadcaster inside the btop container, capturing tmux running btop
```

Ports listed in `docs/ports.md`. The standalone viewer URL
(`/btop-luv/`) is 404'd by nginx in prod — only `/stream` and
`/health` are reachable from the browser.

This is the legacy path. The native multi-node migration now has a dormant
consumer at `src/server/routes/btop.ts`:

```text
node-local exporter -> private HTTP/SSE on the compute network
  -> owning control-plane relay -> Core NATS btop.<node>.frame
  -> Express in-memory reconstruction
  -> /api/btop/<node>/{health,stream}
  -> browser
```

The luv routes and collectors stay active until the native luv exporter proves
the new path. Both legacy joi SSH collectors are stopped and gated behind the
explicit `legacy-joi` Compose profile after joi's NixOS and network migration.
Do not revive them. The target has one native exporter per physical node, no
development/production duplication, and no browser-to-node or node-to-NATS
connection. joi-control-plane relays joi; nexus-control-plane relays its
workers. The luv path uses the same relay boundary locally. See the
[btop integration contract](./btop.md).

The target BFF inventory is the explicit `BTOP_NODES` allowlist. This preserves
offline entries for powered-down nodes and rejects arbitrary names at public
routing and NATS ingest. Current source enforces the public-route check but
still allocates any syntactically valid node received through NATS; fix that
before deployment. `BTOP_NATS_CREDS` supplies the BFF's future subscribe-only
credentials. The current broker is open mode, so publisher identity is not
authenticated yet. NATS stays on luv's internal service network; exporters
receive no broker credentials. The browser remains on same-origin SSE.

## Network model

| Network | Purpose | Who's on it |
|---|---|---|
| `proxy` | HTTP ingress through workspace Caddy | `vs-prod`, `vs-dev`, `vs-dev-api` (NOT `vs-prod-api` — see below) |
| `luv-prod` / `luv-dev` | Cross-project data plane (DB, internal API) | `vs-{env}-api` only |
| `vedanta-systems-prod` / `vedanta-systems-dev` | Project-internal | `vs-{env}` ↔ `vs-{env}-api` only |

**Why `vs-prod-api` is NOT on `proxy`.** Intentional. In prod, the API is
reached only via in-container nginx (`/api/*` → `vedanta-systems-prod-api:3001`)
over the project-internal `vedanta-systems-prod` network. The browser path is
same-origin and does not require CORS, although Express currently enables
wildcard CORS globally. There is no public Caddy hostname for the production
API. The dev API *is* on
`proxy` because direct access via `vedanta-systems-dev-api.<base-domain>`
is useful for poking endpoints with curl during development.

## Container shape (per workspace conventions)

```
vedanta-systems-{prod,dev}            frontend — nginx (prod only) + Vite-built SPA
vedanta-systems-{prod,dev}-api        Express BFF
vedanta-systems-{prod,dev}-btop-luv   patched btop + Python SSE, network_mode:host
vedanta-systems-{prod,dev}-btop-joi   disabled legacy SSH collector (`legacy-joi` profile only)
```

Per `~/workspace/proxy/CONVENTIONS.md`, the bare `vedanta-systems-{env}`
name (no `-frontend` suffix) is the documented exception — it's the
only frontend in the workspace.

## Where the layers are configured

| Layer | File | Notes |
|---|---|---|
| Cloudflare tunnel ingress | `~/.cloudflared/config.yml` (host-side) | `vedanta.systems` → `http://proxy-caddy:80` |
| Caddy public host | `~/workspace/proxy/caddy/caddy.d/public.caddy` | Edge-scheme redirect, baseline response headers, then the `vedanta.systems` frontend |
| Caddy dev tailnet hosts | `~/workspace/proxy/caddy/caddy.d/vedanta-systems.caddy` | `vedanta-systems-dev.<base-domain>` + `vedanta-systems-dev-api.<base-domain>` |
| In-container nginx | `nginx.conf` | Crawler routing, internal webhook 404s, SSE/range quirks, btop legacy block (see todo) |
| Express + project routers | `src/server/index.ts`, `src/server/routes/<project>.ts` | Per-project routers (found-footy Pattern B; spin-cycle/long-exposure Pattern A), legacy inline btop proxy, and the dormant NATS-backed btop router |
| GitHub contribution BFF | `src/server/routes/github.ts` | Fixed-user GraphQL projection; server-only token; 15-minute cache |
| Vite dev proxy | `vite.config.ts` | `/api/*` → `vedanta-systems-dev-api:3001` |
| OG meta server | `og-server.js` + `start.sh` | Runs in vs-prod alongside nginx; resolves retained Found Footy targets and includes video metadata only for available media |

For agent-facing context that ties it together, start at `AGENTS.md`
(this repo) and `~/workspace/proxy/CONVENTIONS.md` (the workspace
contract).
