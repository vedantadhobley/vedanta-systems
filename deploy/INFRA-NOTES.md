# Deploy notes — what changes outside this repo

The application code is fully contained in this repo. The host-level
infrastructure changes needed to run vedanta-systems on luv live in the
workspace's `~/workspace/proxy/` stack and `~/.cloudflared/` config — they
aren't tracked here because they're cross-cutting, but they're listed here
so the deploy is reproducible from one place.

## 1. Caddyfile additions (luv)

Append to `~/workspace/proxy/Caddyfile`:

```caddy
# ─── vedanta-systems (public — Cloudflare tunnel entry) ────────────────────
vedanta.systems, www.vedanta.systems {
    reverse_proxy vedanta-systems-prod:3000
}

# ─── vedanta-systems (dev — tailnet only) ──────────────────────────────────
http://vedanta-systems-dev.{$BASE_DOMAIN}     { reverse_proxy vedanta-systems-dev:3000 }
http://vedanta-systems-dev-api.{$BASE_DOMAIN} { reverse_proxy vedanta-systems-dev-api:3001 }
```

Then: `docker compose -f ~/workspace/proxy/docker-compose.yml restart caddy`.

There is intentionally **no `vedanta-systems-prod.<BASE_DOMAIN>` tailnet
route**. Tailnet users hit the public `vedanta.systems` like everyone else
(it resolves and works on the tailnet too). Add a tailnet-only route only
if you want to hit prod via http instead of https.

## 2. Cloudflare tunnel ingress (luv)

Cloudflared no longer runs inside the vs-prod container — it was extracted
into `~/workspace/proxy/` as a sibling of caddy. The tunnel name
`vedanta-systems-prod` and credentials at `~/.cloudflared/` are unchanged.

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
docker compose -f docker-compose.yml up -d --build         # prod
# or
docker compose -f docker-compose.dev.yml up -d --build     # dev
```

## 4. Verify

```bash
curl -sI https://vedanta.systems/                                  # prod (public)
curl -sI http://vedanta-systems-dev.luv/                           # dev frontend (tailnet)
curl -sI http://vedanta-systems-dev-api.luv/api/found-footy/health # dev api (tailnet)
```

The api container has no published host port and is not directly fronted
by Caddy in prod (the prod frontend has its own internal nginx that proxies
`/api/*` to `vedanta-systems-prod-api:3001` over `vedanta-systems-prod`).
That's intentional — keeps the prod API behind same-origin, no CORS.
