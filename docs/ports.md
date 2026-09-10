# Ports

After the workspace Caddy migration, **HTTP services in this repo
have no host ports**. Everything goes through Caddy on the `proxy`
external docker network, and Cloudflared bridges the public side.
See `~/workspace/proxy/README.md` for the proxy stack itself.

The remaining **legacy prod luv btop** container is the documented exception. It uses
`network_mode: host` so they can see real host network / process
state, which means they bind directly to host ports rather than
being reachable via docker DNS or Caddy.

| Host port | Container | Env | Notes |
|---|---|---|---|
| `3102` | `vedanta-systems-prod-btop-luv` | prod | luv node, local |

Reached from the browser via the Express API:
`/api/btop-luv/{health,stream}` →
`host-gateway` (prod) on the port
above. See `mountBtopProxy` in `src/server/index.ts`.

The dev luv collector and both obsolete SSH joi collectors were removed from
Docker and Compose on 2026-09-10; ports 4102, 3103, and 4103 are retired.
Both dev tiles now consume the NATS-backed BFF routes. Control owns the
native exporters' private endpoints, not this repository.

These btop bindings are explicit exceptions, not members of a numeric project
band. The old 300x infrastructure band and 3X0Y project slots are retired.
Workspace routing and the exception register live in
`~/workspace/proxy/CONVENTIONS.md` and
`~/workspace/vedanta-dhobley/docs/topology.md`.
