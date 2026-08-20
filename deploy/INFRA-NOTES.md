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
    reverse_proxy vedanta-systems-prod:3000
}

# in caddy.d/vedanta-systems.caddy
http://vedanta-systems-dev.{$BASE_DOMAIN}     { reverse_proxy vedanta-systems-dev:3000 }
http://vedanta-systems-dev-api.{$BASE_DOMAIN} { reverse_proxy vedanta-systems-dev-api:3001 }
```

The audited public block serves plaintext HTTP instead of redirecting it. This
is current state, not the desired security contract. Change the owning proxy
route to redirect HTTP to HTTPS and add the agreed response headers before the
next public deployment.

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
