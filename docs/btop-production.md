# btop production cutover

## 2026-09-10 authorization and scope

The user accepts interruption of the legacy production collectors and does
not require them as a fallback. The incomplete physical-phone matrix is a
follow-up, not a blocker for this cutover. Keep public-ingress verification;
do not claim a physical reboot or phone test that has not run.

Deploy only this portal's frontend and BFF from the tested commit. Both native
producers already feed the production BFF through Core NATS. No Control image,
node host configuration, broker, inference, Found Footy service, or database
change is required. No migration or authentication rollout is part of this.

Remove the remaining legacy prod luv collector and port 3102. Its host binds
are read-only statistics or device access, not owned data: never delete those
paths. Retain images and versioned source, but do not keep a running duplicate.
Old tabs must reload the frontend bundle; old `/api/btop-{luv,joi}` routes
will return 404 rather than being redirected to a compatibility proxy.

## Release verification

Record the exact source commit and resulting frontend/API image IDs. Build
with a temporary 4 GiB/two-CPU builder; the frontend build has a 1.5 GiB Node
heap ceiling. Recreate only `frontend` and `api` with `--no-deps`.

Check public HTTP health, both node health endpoints, a full SSE frame followed
by deltas, and a new full frame after reconnection. Run the existing browser
harness against `https://vedanta.systems/workspace/vedanta-systems` using its
`BTOP_BROWSER_URL` override. Its simulated offline/lifecycle faults are confined
to the test browser; never interrupt the shared broker for a public check.

Verify the old paths return 404, port 3102 has no listener, no legacy collector
container remains, and the Found Footy service and broker identities are
unchanged. Retain the public page's existing layout and palette.

## Deferred source archive

The embedded `btop/src` has its own Git metadata and four modified C++ files.
Preserve it until a separate archive records that nested history and working
diff. It is excluded from current image builds and is not a live dependency.
New source work belongs in the durable btop profile checkout and Control's
shared telemetry tree, as routed through the
[multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md).
