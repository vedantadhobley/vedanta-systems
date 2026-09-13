# Deploy notes — what changes outside this repo

The application code is contained in this repo. Cross-project ingress belongs
to `~/workspace/proxy/`; workspace topology and recovery ownership belong to
`~/workspace/vedanta-dhobley/`. This file records only the vedanta-systems
slice and points to those authorities.

At the 2026-08-20 audit, nonsecret Cloudflare tunnel configuration still lived
under untracked `~/.cloudflared/`. That is a recovery gap, not the target
convention. Move nonsecret configuration into the proxy stack and keep only
credentials in a declared gitignored data path.

## 1. Caddy routes (luv)

The Caddy config on luv is split per-project. vedanta-systems is special
because it owns both the public Cloudflare entry point and a dev tailnet
route — these live in two different files:

```
~/workspace/proxy/caddy/caddy.d/public.caddy            # Cloudflare entry (vedanta.systems)
~/workspace/proxy/caddy/caddy.d/vedanta-systems.caddy   # dev tailnet routes
```

Reference content (current source of truth is the files above):

```caddy
# in caddy.d/public.caddy
http://vedanta.systems, http://www.vedanta.systems {
    @edge_https header X-Forwarded-Proto https

    handle @edge_https {
        header {
            -Server
            Strict-Transport-Security "max-age=31536000; includeSubDomains"
            X-Content-Type-Options "nosniff"
            Referrer-Policy "strict-origin-when-cross-origin"
            X-Frame-Options "DENY"
            Permissions-Policy "camera=(), microphone=(), geolocation=()"
        }
        reverse_proxy vedanta-systems-prod:3000
    }

    handle {
        redir https://{host}{uri} permanent
    }
}

# in caddy.d/vedanta-systems.caddy
http://vedanta-systems-dev.{$BASE_DOMAIN}     { reverse_proxy vedanta-systems-dev:3000 }
http://vedanta-systems-dev-api.{$BASE_DOMAIN} {
    reverse_proxy vedanta-systems-dev-api:3001 {
        header_up X-Vedanta-Public "1"
    }
}
```

Cloudflare supplies the visitor scheme in `X-Forwarded-Proto`. Caddy redirects
edge-HTTP requests and serves edge-HTTPS requests with the baseline response
headers. The dev API marker distinguishes browser ingress from direct
service-to-service calls to internal webhook routes; Vite applies the same
marker to its `/api` proxy.

After editing either file, reload Caddy without restarting the container:

```bash
docker exec proxy-caddy caddy reload --config /etc/caddy/Caddyfile
```

(The proxy stack uses a directory bind mount, so atomic-write edits to
files inside `caddy/` flow through and `caddy reload` picks them up.
See `~/workspace/proxy/README.md` for the gotcha mechanics.)

There is intentionally **no `vedanta-systems-prod.<BASE_DOMAIN>` tailnet
route**. Tailnet users hit the public `vedanta.systems` like everyone else
(it resolves and works on the tailnet too). Add a tailnet-only route only
if you want to hit prod via http instead of https.

## 2. Cloudflare tunnel ingress (luv)

Cloudflared no longer runs inside the vs-prod container — it was extracted
into `~/workspace/proxy/` as a sibling of caddy. The tunnel name is
`vedanta-systems-prod`. Credentials are currently under `~/.cloudflared/`; the
recovery follow-up above must move them to a declared gitignored workspace-data
location without committing their contents.

The ingress rule in `~/.cloudflared/config.yml` should look like:

```yaml
ingress:
  - hostname: vedanta.systems
    service: http://proxy-caddy:80
  - hostname: www.vedanta.systems
    service: http://proxy-caddy:80
  - service: http_status:404
```

If you're recovering from scratch, you'll also need:

- `~/.cloudflared/<tunnel-uuid>.json` — the tunnel credentials file
- `~/.cloudflared/cert.pem` — the cloudflared origin cert
- A DNS record in Cloudflare for `vedanta.systems` (and `www.vedanta.systems`)
  → CNAME to `<tunnel-uuid>.cfargotunnel.com`, proxied = on

Restart cloudflared:

```bash
docker compose -f ~/workspace/proxy/docker-compose.yml restart cloudflared
```

## 3. Bring up

```bash
cd ~/workspace/dev/vedanta-systems
cp .env.example .env
$EDITOR .env                                  # set the secrets
chmod 600 .env
docker compose -f docker-compose.yml up -d --build         # prod
# or
docker compose -f docker-compose.dev.yml up -d --build     # dev
```

## 4. Verify

Replace `<base-domain>` with the configured workspace base domain.

```bash
curl -sI https://vedanta.systems/                                  # prod (public)
curl -sI http://vedanta-systems-dev.<base-domain>/                 # dev frontend (tailnet)
curl -sI http://vedanta-systems-dev-api.<base-domain>/api/health   # dev api (tailnet)
```

The api container has no published host port and is not directly fronted
by Caddy in prod (the prod frontend has its own internal nginx that proxies
`/api/*` to `vedanta-systems-prod-api:3001` over `vedanta-systems-prod`).
That's intentional and keeps the browser path same-origin. Express currently
enables wildcard CORS globally despite not needing it for production; replace
that with route-specific behavior during API hardening.

## 5. Frontend-only rollout — 2026-09-13

Instant control feedback is deployed from
`3767bf924e71023027ea8dba7e0c990ff40462bb` at 19:30 UTC:

- Frontend image: `sha256:0688a88dfcff3f07224475f29e30540264ab7476f8db9428b19dffae2344c781`.
- Image tags: `vedanta-systems-prod-frontend` and
  `vedanta-systems-frontend:3767bf9`; its revision label identifies the source above.
- Public assets: `index-CXQjM2FB.js` and `index-BAlnLF7q.css`.
- API remains on the [btop cutover release](../docs/btop-production.md#cutover-release),
  image `sha256:179fca1acada014c7db0b1390c8e40f98c72881d28b8465a4db52c0667721b3a`.

The production image build passed TypeScript and Vite with the declared
production API URLs. A temporary 4 GiB/two-CPU builder enforced the resource
budget; the Node build heap stayed capped at 1536 MiB. It was removed after
the build. Only `frontend` was recreated with
`docker compose -f docker-compose.yml up -d --no-deps --no-build frontend`.

Verification passed:

- nginx configuration, public home/workspace/Found Footy routes, new assets,
  portal/Found Footy health, and both online/synchronized btop feeds.
- Public Chromium and WebKit desktop checks: breadcrumb and up-arrow colors
  settle at the next paint, with no CSS transition during repeated holds and
  releases; line/fill icons still swap. Mobile-sized Chromium/WebKit checks
  confirm the same motion defaults and working taps.
- The GitHub graph retains its independent `opacity 0.3s` fade. No page errors
  occurred in the completed checks. Mobile WebKit's first navigation was
  cancelled before loading; two isolated repeat runs passed.
- API, NATS, telemetry relays, Found Footy, and ingress container identities
  stayed unchanged. The frontend has zero restarts and no OOM flag.

Physical iPhone held-touch acceptance remains separate from browser emulation;
see [control feedback acceptance](../tests/control-feedback/README.md).
Existing tabs need one reload to obtain the new bundle. No upstream push,
database migration, remote-node action, or application data repair was performed.
Existing dependency/engine, bundle-size, and lint debt was not addressed here.

Rollback is frontend-only: the prior image is retained as
`vedanta-systems-frontend:pre-control-feedback-20260913`
(`sha256:125226df9a0f2ea7006b79cc606b649db90a3c3d18108a32805004b12574fa70`).
If rollback is authorized, retag that exact image as
`vedanta-systems-prod-frontend`, recreate only `frontend` with `--no-deps
--no-build`, and repeat public verification. No legacy btop collector is needed
for this rollback; both images use the current NATS path.
