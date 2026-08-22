# vedanta-systems

The unified portal at [vedanta.systems](https://vedanta.systems). Its current
React + shadcn/ui frontend and Express BFF host UIs for an ecosystem of
self-hosted projects (found-footy, spin-cycle, long-exposure) and surface live
system monitoring (btop on the luv + joi nodes). Caddy fronts the portal and
Cloudflare Tunnel exposes the public host; everything else stays internal or
tailnet-only.

## Stack

- **Current frontend**: React 18, TypeScript, Vite, Tailwind, shadcn/ui.
  Filesystem-style URL navigation (paths like `~/workspace/<project>`). The
  approved re-foundation retains React and progressively replaces visual and
  behavior contracts with a source-owned component system; implementation is
  currently paused during btop transport work and design-language development.
- **API**: Express, served by `tsx`. Per-project routers under `src/server/routes/`,
  plus a cached, server-authenticated GitHub contribution projection.
- **Prod ingress**: Cloudflare Tunnel → Caddy → in-container nginx → SPA / API / OG meta server.
- **Dev ingress**: workspace Caddy → Vite dev server (HMR) → API via Vite's built-in proxy.
- **System monitoring**: the live legacy path runs duplicate luv btop
  containers and luv-hosted SSH collectors for joi; joi is currently down. The
  replacement is one native exporter per node, consumed by its control plane
  and relayed through NATS to same-origin browser SSE.

The current visual baseline is a lavender, black, square-edged
corpo-terminal. The active design direction adds crisp container geometry over
a projected data plane without sacrificing clarity or response.

## Develop locally

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Dev URLs (replace `<base-domain>` with the workspace `BASE_DOMAIN`):

- Frontend: `http://vedanta-systems-dev.<base-domain>/`
- API direct: `http://vedanta-systems-dev-api.<base-domain>/api/health`

The dev SPA proxies `/api/*` to the API container through Vite, so normal
browser requests stay same-origin. Express currently enables wildcard CORS
globally; API hardening will narrow it.

## Deploy

Bring-up reference: [`deploy/INFRA-NOTES.md`](./deploy/INFRA-NOTES.md). The deploy depends on the workspace proxy stack at `~/workspace/proxy/` (Caddy + dnsmasq + cloudflared); that repo is the cross-project infra.

```bash
docker compose -f docker-compose.yml up -d --build
```

## Surfaced projects

| Project | What it does | Source |
|---|---|---|
| **found-footy** | Automated football goal clip aggregator. Monitors live fixtures, detects goals, finds and archives video clips from social media. | [`vedantadhobley/found-footy`](https://github.com/vedantadhobley/found-footy) |
| **spin-cycle** | News claim verification pipeline. Ingests transcripts, extracts claims, delivers structured verdicts with full evidence chains. | [`vedantadhobley/spin-cycle`](https://github.com/vedantadhobley/spin-cycle) |
| **long-exposure** | A full day of IEX market activity, rendered into something you can read. Parses the exchange's order-by-order feed nightly, detects microstructure events, narrates them through a locally-hosted LLM. | [`vedantadhobley/long-exposure`](https://github.com/vedantadhobley/long-exposure) |
| **btop-luv / btop-joi** | Real-time node monitor. luv still uses the legacy in-repo image; the failed joi SSH collectors are disabled. The target uses native exporters and owning control-plane relays. | Legacy image: [`btop/`](./btop); target contract: [`docs/btop.md`](./docs/btop.md) |

## Architecture + deep dives

- [`docs/README.md`](./docs/README.md) — documentation routing index
- [`docs/architecture.md`](./docs/architecture.md) — full request paths, network model, btop's host-network exception
- [`docs/full-project-audit-2026-08-20.md`](./docs/full-project-audit-2026-08-20.md) — first whole-project audit and remediation order
- [`docs/plans/frontend-refoundation.md`](./docs/plans/frontend-refoundation.md) — approved frontend runtime and component-system migration
- [`docs/design.md`](./docs/design.md) — living design brief and product constraints
- [`docs/btop.md`](./docs/btop.md) — btop deployment, control-plane relay, NATS, and browser SSE
- [`docs/btop-source.md`](./docs/btop-source.md) — source authority, public-display profile, and AMD APU limitation
- [`docs/ports.md`](./docs/ports.md) — host-port allocation (btop only; HTTP services go through Caddy)
- [`docs/found-footy-timezone.md`](./docs/found-footy-timezone.md) — found-footy's fixture-visibility rule × timezone toggle
- [`docs/found-footy-live-data.md`](./docs/found-footy-live-data.md) — current stream lifecycle and target wake/reconnect/midnight contract
- [`docs/decisions.md`](./docs/decisions.md) — architectural decisions log
- [`docs/todo.md`](./docs/todo.md) — active work + deferred items

## For agents

[`AGENTS.md`](./AGENTS.md) is the front door — read it first. The workspace contract that vedanta-systems conforms to lives at `~/workspace/proxy/CONVENTIONS.md`.

---

Built as an operational interface for Vedanta's systems.
