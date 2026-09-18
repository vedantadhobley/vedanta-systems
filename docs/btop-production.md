# btop production cutover

## Cutover release

The [2026-09-18 kickoff-anchor rollout](../deploy/INFRA-NOTES.md#7-kickoff-anchor-rollout--2026-09-18)
supersedes the frontend image below. It leaves the API and btop transport
unchanged. The following records the original btop cutover, not the latest
frontend image.

The exporter-only [`.4` rollout](./btop-recovery.md#capture-delay-rollout--deployed-2026-09-10)
later updated both native producers. It did not change the frontend/API release
recorded below, either relay, the broker, or any application service.

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

## Retired source archive — 2026-09-11

The retired `btop/` tree is removed from this checkout. Before removal, a
private archive preserved the entire tree, including the nested `src/.git`,
working files, refs, reflogs, index, and locally available objects. The original
directory was then moved into that archive as `original-btop/`; it was not
destroyed. The parent repo records removal of 154 tracked files and the unused
`test:btop-agent` script. Current BFF tests remain under `test:btop`.

Recovery inputs:

- Parent source checkpoint: `5ecff7747ccdcffe9c0cb30b4c027ce3a20b98a4`.
- Nested HEAD: `abcb906c951d1e79ccc1c03d219f55d2e5c52655`, branch `main`.
- The nested repository was shallow with one reachable commit. The archive
  preserves all locally available history, not missing upstream ancestors.
  No alternate object store or linked worktree is required.
- Four nested working modifications: `src/btop_config.cpp`,
  `src/btop_draw.cpp`, `src/btop_shared.cpp`, and `src/linux/btop_collect.cpp`.
  The archive also contains their binary-capable patch, refs, status, HEADs,
  metadata manifests, and checksums. Do not publish the private archive or
  nested Git configuration.

Private location on luv:

```text
/home/vedanta/workspace/data/vedanta-systems/archives/legacy-btop-2026-09-11T045822Z/
```

`legacy-btop.tar.gz` SHA-256:
`dc1a5d7b0c4587cc20d639d87903d59b53494a691ba57ea87b216f96849de0c2`.
`nested-working-tree.patch` SHA-256:
`175fd5d239ca2e4577fdecf332958c11fdeb03fc7602f47f82df18cdc92009eb`.

Verification passed: archive checksums, independent extraction, byte-for-byte
tree comparison including hidden Git files, file types/modes, nested Git
integrity, HEAD, refs, status, and the four-file diff. Git commands can refresh
a restored index's stat cache; compare raw files before inspecting the restore
with Git. The preserved original also matched an untouched second extraction.

Restore into a new directory, never over a live checkout:

```bash
archive_dir=/home/vedanta/workspace/data/vedanta-systems/archives/legacy-btop-2026-09-11T045822Z
(cd "$archive_dir" && sha256sum -c SHA256SUMS)
restore_dir=$(mktemp -d /tmp/legacy-btop-restore.XXXXXX)
tar --acls --xattrs -xzf "$archive_dir/legacy-btop.tar.gz" -C "$restore_dir"
git -C "$restore_dir/btop/src" fsck --full
git -C "$restore_dir/btop/src" status --short
```

This archive is local recovery, not an off-node backup. It is outside the
portal's source mount. The tree was already excluded from image builds, no
running service consumed it, and no runtime source changed. No production
rebuild, service restart, image prune, or upstream push is part of this cleanup.
After removal, all 22 BFF btop tests and type-check passed. Both public node
health endpoints remained online and synchronized; frontend/API image IDs,
start times, and zero restart counts matched the pre-cleanup release.

New source work belongs in the durable btop profile checkout and Control's
shared telemetry tree, as routed through the
[multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md).
