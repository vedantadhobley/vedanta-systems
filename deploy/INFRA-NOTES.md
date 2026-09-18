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

## 6. Fixture schedule rollout — 2026-09-16

Deployed frontend `47c2a1f92374320033b1cf704f0e92c55821c978` at
2026-09-17 01:12 UTC (September 16 EDT). This includes retained kickoff times
from `1a13005` and the signed upcoming countdown from `47c2a1f`.

- Image: `sha256:8cd8d28a4f43d6a42fb54fad8ceb83913e24cb45c82bff09a442c32564c2e147`.
- Tags: `vedanta-systems-prod-frontend` and `vedanta-systems-frontend:47c2a1f`;
  the revision label matches the source commit above.
- Public assets: `index-D4BfK4Pf.js` and unchanged `index-BAlnLF7q.css`.
- API image/revision remains unchanged from the preceding rollout.

The 4 GiB/two-CPU temporary builder passed TypeScript and Vite with the
production API URLs and 1536 MiB Node heap. Only `frontend` was recreated,
using `--no-deps --no-build`. The temporary builder was removed afterward.

nginx validation, public home/Found Footy routes, assets, portal/Found Footy
health, and both btop health endpoints passed. Public desktop Chromium and
mobile-sized WebKit checked actual upcoming, playing, finished, and deferred
fixtures: scheduled kickoff persists, countdown is upcoming-only, clock/status
and metadata rows align, and no page errors occur. The smoke check waits for
the countdown mount effect and selects fixtures from the displayed local date;
early test attempts did not respect those conditions. No source correction
was needed during rollout. Negative-countdown boundaries and the transition
to playing passed the [deterministic dev regression](../tests/fixture-schedule/README.md)
before deployment; no production fixture or clock was altered to stage a delay.

API, NATS, both telemetry relays, and Found Footy API container identities and
start times matched the baseline. The frontend has zero restarts and no OOM
flag. No backend deployment, database migration, upstream push, or remote-node
action occurred. Physical-device acceptance and existing audit debt remain
separate. Existing tabs need a reload to load the new JavaScript.

Rollback image: `vedanta-systems-frontend:pre-fixture-schedule-20260916`,
`sha256:0688a88dfcff3f07224475f29e30540264ab7476f8db9428b19dffae2344c781`.
If rollback is authorized, retag it as `vedanta-systems-prod-frontend`, recreate
only `frontend` with `--no-deps --no-build`, and repeat public checks.

## 7. Kickoff-anchor rollout — 2026-09-18

Deployed frontend `cc4a67e52fa120f8a6e46ba851539b6e1ad3c0f8` at
2026-09-18 08:46 UTC. Upcoming fixtures now render countdown before kickoff,
for example `9h 43m · 14:30 EDT`, so the kickoff element owns the stable
right edge before and after the countdown disappears.

- Image: `sha256:998bb4a6f9b5d96743b95696bac85c12d1245f2b8984ce5c816bef9cce8f2120`.
- Tags: `vedanta-systems-prod-frontend` and `vedanta-systems-frontend:cc4a67e`;
  the revision label matches the source commit above.
- Public assets: `index-BDY4_aho.js` and unchanged `index-BAlnLF7q.css`.
- The API image/revision remains unchanged.

The 4 GiB/two-CPU temporary builder passed TypeScript and Vite with the
production API URLs and 1536 MiB Node heap. Only `frontend` was recreated with
`--no-deps --no-build`; the temporary builder was removed afterward.

nginx validation, public home/Found Footy routes, new assets, portal/Found
Footy health, and both btop health endpoints passed. On the same real upcoming
fixture, public desktop Chromium and mobile-sized WebKit both rendered the
countdown before kickoff and proved that kickoff, its metadata wrapper, and
the status above share the same right edge. No page errors occurred.

API, NATS, both telemetry relays, and the Found Footy API container matched
the immediate pre-deployment identities and start times. Found Footy had been
recreated independently before this rollout; this deployment did not touch it.
The frontend has zero restarts and no OOM flag. No backend deployment, database
migration, upstream push, or remote-node action occurred. Existing tabs need
one reload to obtain the new bundle.

Rollback image: `vedanta-systems-frontend:pre-kickoff-anchor-20260918`,
`sha256:8cd8d28a4f43d6a42fb54fad8ceb83913e24cb45c82bff09a442c32564c2e147`.
If rollback is authorized, retag it as `vedanta-systems-prod-frontend`, recreate
only `frontend` with `--no-deps --no-build`, and repeat public checks.

## 8. Found Footy search-provenance rollout — 2026-09-18

Deployed API/BFF `10c73a19a4bd8c4fccbb108df58b8c3c0f484e33` at
2026-09-18 18:01 UTC. The BFF now trusts Found Footy's additive
`search_match` provenance instead of repeating case-sensitive display-string
matching. The existing React client continues to render its `_search`
projection, so the frontend image and public assets did not change.

- API image: `sha256:e381eb5abb0521cff2d25f5f6ad01dbb2d10f6c0901054f037f9ae0f229e6543`.
- Image tags: `vedanta-systems-prod-api` and
  `vedanta-systems-api:10c73a1`; the revision label matches the source commit.
- Frontend remains on `cc4a67e`, image
  `sha256:998bb4a6f9b5d96743b95696bac85c12d1245f2b8984ce5c816bef9cce8f2120`.

The focused Found Footy suite passed all 38 active tests; its external NATS
integration remained intentionally skipped. TypeScript and `git diff --check`
passed. Only `api` was recreated with `--no-deps --no-build`.

Production verification passed the portal health endpoint and both NATS bridge
connections. For the real `mbappe` query, Found Footy returned six complete
fixtures with ten declared event matches; the public BFF returned the same ten
matched event IDs. The preceding BFF exposed only three because it repeated
accent-sensitive matching locally.

The frontend, Found Footy, NATS, telemetry relays, databases, and application
data were untouched. Found Footy had been recreated independently about
14 minutes before this rollout; its earlier start time confirms that this
scoped deployment did not recreate it. No upstream push occurred.

Rollback image: `vedanta-systems-api:pre-search-provenance-20260918`,
`sha256:179fca1acada014c7db0b1390c8e40f98c72881d28b8465a4db52c0667721b3a`.
If rollback is authorized, retag it as `vedanta-systems-prod-api`, recreate
only `api` with `--no-deps --no-build`, and repeat the public search and health
checks.
