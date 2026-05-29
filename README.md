# vedanta-systems

The unified portal at [vedanta.systems](https://vedanta.systems). React + shadcn/ui frontend + Express BFF API that hosts UIs for an ecosystem of self-hosted projects (found-footy, spin-cycle, long-exposure) and surfaces live system monitoring (btop on the luv + joi nodes). Fronted by Caddy and exposed publicly through Cloudflare Tunnel; everything else stays internal / tailnet-only.

## Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind, shadcn/ui. Filesystem-style URL navigation (paths like `~/workspace/<project>`).
- **API**: Express, served by `tsx`. Per-project routers under `src/server/routes/`.
- **Prod ingress**: Cloudflare Tunnel → Caddy → in-container nginx → SPA / API / OG meta server.
- **Dev ingress**: workspace Caddy → Vite dev server (HMR) → API via Vite's built-in proxy.
- **System monitoring**: custom-patched btop in a per-node container, broadcast over SSE.

Cyberpunk corpo-terminal aesthetic throughout — lavender + dark theme, monospace font, no border-radius.

## Develop locally

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Dev URLs (replace `<base-domain>` with the workspace `BASE_DOMAIN`):

- Frontend: `http://vedanta-systems-dev.<base-domain>/`
- API direct: `http://vedanta-systems-dev-api.<base-domain>/api/health`

The dev SPA proxies `/api/*` to the api container via Vite's built-in proxy — same-origin, no CORS to deal with.

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
| **btop-luv / btop-joi** | Real-time system monitor for the luv node (this host) and joi (separate node, reached via SSH from container). Custom-patched btop for AMD Strix Halo APUs. | in-repo: [`btop/`](./btop) |

## Architecture + deep dives

- [`docs/architecture.md`](./docs/architecture.md) — full request paths, network model, btop's host-network exception
- [`docs/btop.md`](./docs/btop.md) — btop integration, AMD APU patches, SSE protocol, theme
- [`docs/ports.md`](./docs/ports.md) — host-port allocation (btop only; HTTP services go through Caddy)
- [`docs/found-footy-timezone.md`](./docs/found-footy-timezone.md) — found-footy's fixture-visibility rule × timezone toggle
- [`docs/decisions.md`](./docs/decisions.md) — architectural decisions log
- [`docs/todo.md`](./docs/todo.md) — active work + deferred items

## For agents

[`AGENTS.md`](./AGENTS.md) is the front door — read it first. The workspace contract that vedanta-systems conforms to lives at `~/workspace/proxy/CONVENTIONS.md`.

---

Built for the cyberpunk corpo-terminal aesthetic.
