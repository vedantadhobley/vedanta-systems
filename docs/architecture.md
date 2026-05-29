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
        ├─ /api/*/refresh               → return 404 (internal-only webhook paths; bypassable from inside the docker network)
        ├─ /api/btop-{luv,joi}, .../    → return 404 (only /stream + /health exposed; standalone viewer not public)
        └─ User-Agent matches crawler   → error_page 418 → og-server.js on 127.0.0.1:3002 (dynamic OG meta tags)
```

In prod, Caddy = outside vs-prod, nginx = inside vs-prod. Different
jobs, not a duplicated layer. Caddy only knows host headers; nginx
knows paths.

### Dev — tailnet

No nginx in dev. Vite owns same-origin /api proxying.

```
browser
  → http://vedanta-systems-dev.<base-domain>/        (Caddy → Vite dev server in vedanta-systems-dev:3000)
  → http://vedanta-systems-dev-api.<base-domain>/    (Caddy → vedanta-systems-dev-api:3001, direct, for curl testing)
```

Inside the dev frontend container, Vite's built-in proxy
(`vite.config.ts`) maps `/api/*` → `vedanta-systems-dev-api:3001`,
so the SPA stays same-origin. If `/api/*` 502s in dev, that proxy
target is the first place to check — it was wrong recently (host
port that didn't exist; fixed in commit `62ba907`).

### Cross-project — non-HTTP

Express on `vedanta-systems-{env}-api` reaches into other projects
over the `luv-{env}` shared docker network. Today's connections
(Pattern A — see `docs/decisions.md`):

| Caller | Callee | Network |
|---|---|---|
| `vedanta-systems-{env}-api` | `found-footy-{env}-mongo` | `luv-{env}` |
| `vedanta-systems-{env}-api` | `found-footy-{env}-minio` | `luv-{env}` |
| `vedanta-systems-{env}-api` | `spin-cycle-{env}-postgres` | `luv-{env}` |
| `vedanta-systems-{env}-api` | `long-exposure-{env}-postgres` | `luv-{env}` |

Pattern B target: each project ships its own `<project>-{env}-api`
and vs-api proxies HTTP. Migration is tracked per project in
`docs/todo.md`.

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

## Network model

| Network | Purpose | Who's on it |
|---|---|---|
| `proxy` | HTTP ingress through workspace Caddy | `vs-prod`, `vs-dev`, `vs-dev-api` (NOT `vs-prod-api` — see below) |
| `luv-prod` / `luv-dev` | Cross-project data plane (DB, internal API) | `vs-{env}-api`, `vs-{env}` (the frontend joins for cross-project reachability via nginx → api → other projects) |
| `vedanta-systems-prod` / `vedanta-systems-dev` | Project-internal | `vs-{env}` ↔ `vs-{env}-api` only |

**Why `vs-prod-api` is NOT on `proxy`.** Intentional. In prod, the API is
reached only via in-container nginx (`/api/*` → `vedanta-systems-prod-api:3001`)
over the project-internal `vedanta-systems-prod` network. Same-origin,
no CORS, no public Caddy hostname for the API. The dev API *is* on
`proxy` because direct access via `vedanta-systems-dev-api.<base-domain>`
is useful for poking endpoints with curl during development.

## Container shape (per workspace conventions)

```
vedanta-systems-{prod,dev}            frontend — nginx (prod only) + Vite-built SPA
vedanta-systems-{prod,dev}-api        Express BFF
vedanta-systems-{prod,dev}-btop-luv   patched btop + Python SSE, network_mode:host
vedanta-systems-{prod,dev}-btop-joi   same image, SSH out to joi
```

Per `~/workspace/proxy/CONVENTIONS.md`, the bare `vedanta-systems-{env}`
name (no `-frontend` suffix) is the documented exception — it's the
only frontend in the workspace.

## Where the layers are configured

| Layer | File | Notes |
|---|---|---|
| Cloudflare tunnel ingress | `~/.cloudflared/config.yml` (host-side) | `vedanta.systems` → `http://proxy-caddy:80` |
| Caddy public host | `~/workspace/proxy/caddy/caddy.d/public.caddy` | The `vedanta.systems` Cloudflare entry |
| Caddy dev tailnet hosts | `~/workspace/proxy/caddy/caddy.d/vedanta-systems.caddy` | `vedanta-systems-dev.<base-domain>` + `vedanta-systems-dev-api.<base-domain>` |
| In-container nginx | `nginx.conf` | Crawler routing, internal webhook 404s, SSE/range quirks, btop legacy block (see todo) |
| Express + project routers | `src/server/index.ts`, `src/server/routes/<project>.ts` | Per-project routers (currently Pattern A) + inline btop proxy |
| Vite dev proxy | `vite.config.ts` | `/api/*` → `vedanta-systems-dev-api:3001` |
| OG meta server | `og-server.js` + `start.sh` | Runs in vs-prod alongside nginx; data-injection half is currently disabled |

For agent-facing context that ties it together, start at `AGENTS.md`
(this repo) and `~/workspace/proxy/CONVENTIONS.md` (the workspace
contract).
