# btop production cutover

## Deployed release

Live on 2026-09-10 at 23:09 UTC from
`2dcb75ab06185a8d46c67b2e2196d183676f30d8`:

- Frontend image: `sha256:125226df9a0f2ea7006b79cc606b649db90a3c3d18108a32805004b12574fa70`.
- API image: `sha256:179fca1acada014c7db0b1390c8e40f98c72881d28b8465a4db52c0667721b3a`.
- Public bundle: `index-C4ANtf6Q.js`.
- Both image revision labels identify the complete source commit.

Type-check, Found Footy, btop, optional-auth regressions, production image
builds, and nginx configuration checks passed. Public HTTPS health and both
node streams passed full-frame-first, subsequent deltas, and a full frame
after reopening. Old route roots, health, and stream paths return 404.
Chromium desktop and mobile-sized WebKit pass for both nodes through the
actual public URL, including stale data, offline/online, page lifecycle,
route/Back cleanup, and no legacy requests or page errors.

The final legacy luv collector was removed after the switch. No listener
remains on 3102, 3103, 4102, or 4103. All four old collector images remain
available; no host bind contents, SSH sockets, or persistent data were deleted.
Found Footy production service IDs/start times, workspace NATS, and native
Control telemetry service IDs/start times matched the pre-deployment baseline.
Those services were not redeployed. The frontend/API have zero restarts and
no OOM flags at verification. No new Control image or remote host action ran.

The previous portal images remain tagged `vedanta-systems-frontend:pre-btop-cutover`
and `vedanta-systems-api:pre-btop-cutover`. A rollback to their old browser would
also need a restored legacy collector; this is not an automatic fallback.
Nothing was pushed upstream. Complete physical-phone and host-reboot tests
remain open, and repository-wide lint retains its pre-existing baseline.

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
