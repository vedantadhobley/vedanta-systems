# Ports

After the workspace Caddy migration, **HTTP services in this repo
have no host ports**. Everything goes through Caddy on the `proxy`
external docker network, and Cloudflared bridges the public side.
See `~/workspace/proxy/README.md` for the proxy stack itself.

All legacy btop collectors and proxies are removed. Ports 3102, 3103, 4102,
and 4103 have no listener after the 2026-09-10 production cutover. Both dev
and production tiles use `/api/btop/{luv,joi}` through the BFF's NATS store.
Control owns the native exporters' private endpoints, not this repository.

The retired btop bindings were explicit exceptions, not a numeric project
band. The old 300x infrastructure band and 3X0Y project slots are retired.
Workspace routing and the exception register live in
`~/workspace/proxy/CONVENTIONS.md` and
`~/workspace/vedanta-dhobley/docs/topology.md`.
