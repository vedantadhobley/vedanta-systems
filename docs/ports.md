# Ports

After the workspace Caddy migration, **HTTP services in this repo
have no host ports**. Everything goes through Caddy on the `proxy`
external docker network, and Cloudflared bridges the public side.
See `~/workspace/proxy/README.md` for the proxy stack itself.

The **btop** containers are the documented exception. They use
`network_mode: host` so they can see real host network / process
state, which means they bind directly to host ports rather than
being reachable via docker DNS or Caddy.

| Host port | Container | Env | Notes |
|---|---|---|---|
| `3102` | `vedanta-systems-prod-btop-luv` | prod | luv node, local |
| `3103` | `vedanta-systems-prod-btop-joi` | prod | joi node, via SSH from container |
| `4102` | `vedanta-systems-dev-btop-luv` | dev | luv node, local |
| `4103` | `vedanta-systems-dev-btop-joi` | dev | joi node, via SSH from container |

Reached from the browser via the Express API:
`/api/btop-{luv,joi}/{health,stream}` →
`host-gateway` (prod) / `host.docker.internal` (dev) on the port
above. See `mountBtopProxy` in `src/server/index.ts`.

These btop bindings are explicit exceptions, not members of a numeric project
band. The old 300x infrastructure band and 3X0Y project slots are retired.
Workspace routing and the exception register live in
`~/workspace/proxy/CONVENTIONS.md` and
`~/workspace/vedanta-dhobley/docs/topology.md`.
