# btop browser acceptance

The [btop migration](./btop.md) keeps the existing fixed-cell renderer and
visual design. Tests cover both the isolated component and the normal dev
page with real luv frames from Control's packaged exporter and relay.
They do not deploy production or change Found Footy's broker.

## Browser freshness contract

- A valid full frame starts each connection. Deltas require that base.
- Only received frames renew the live indicator. HTTP health, SSE comments,
  and an open connection do not prove that the displayed data is current.
- Five seconds without a frame makes the indicator offline at the next
  one-second watchdog tick. Retain the last screen; do not call it live.
- Errors, invalid frames, and silent stalls close the stream and retry with
  exponential delays from one to 30 seconds. Reset the delay only after a
  valid frame or a deliberate resume/network-recovery signal.
- Hidden/page-cache-suspended monitors disconnect. Visibility restoration,
  `pageshow`, and network recovery start a new stream and require a full frame.
  Unmount removes listeners, timers, and the stream. Old stream callbacks
  cannot mutate a new connection.
- Do not use `navigator.onLine` to prohibit connections. WebKit in the isolated
  network reported false while HTTP/SSE remained reachable. This follows the
  [browser API's documented limitation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).

These changes are active in the existing dev frontend, not the public frontend.
The health endpoints remain available for operations; the component no longer
polls them.

## Private phone preview

Use the normal page on the existing dev frontend:
`http://vedanta-systems-dev.<base-domain>/workspace/vedanta-systems`.
Its luv tile now uses `/api/btop/luv` and shows real data from Control
candidate `2026-09-10.3`. The layout, colors, and legacy offline joi tile are
unchanged. There is no separate human-preview frontend, BFF, hostname, or
Caddy access rule. The `/tests/btop-browser/index.html` entry remains a
component test fixture, not the primary place to view the integration.

This source change also affects the next production build. Do not deploy it
until the standing exporter/relay and production NATS/ingress path are ready.
There is no automatic fallback to the old luv collector.

The first attempt added an unnecessary container and hostname. Its immediate
peer filter returned "Private preview" to the user's phone. That path was
removed; a host-side HTTP check did not establish phone reachability.
Human component previews belong on the existing dev frontend and API. The
standalone test server below is only for disposable automated acceptance.

`docker-compose.btop-preview.yml` is now an overlay on the normal dev Compose.
It joins the existing dev API to Control's isolated test network and points
only `BTOP_NATS_URL` at that broker. Found Footy retains the workspace broker,
qualified as `nats.luv-dev` to avoid the two networks' shared `nats` alias.
Both connections were verified to have distinct broker identities.
The existing frontend's same-origin `/api` proxy requires no route change.

The exporter still exposes only its private Unix socket. The only additional
temporary services are the exporter, relay, and broker (448 MiB total ceiling).
The existing dev frontend/API keep their current caps. Production services,
the live broker configuration, and auth are unchanged.

After starting Control's digest-selected socket-test stack, from this repo:

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.btop-preview.yml up -d --no-deps api
```

To test the actual dev URL, set `BASE_DOMAIN` to the existing dev routing
domain and `BTOP_BROWSER_ARTIFACTS` to a private directory, then run:

```bash
docker compose -f docker-compose.btop-browser-test.yml -f docker-compose.btop-browser-dev-test.yml run --rm --no-deps browsers
```

This starts only a disposable browser runner on `proxy`, not another frontend.
It exercises the normal page, including route navigation and browser Back.

On the phone, try Safari and Chrome: watch the clock/readings advance, lock
and unlock, background and return, then switch Wi-Fi/cellular while keeping
Tailscale connected. Frames should resume without reloading; a stalled stream
must not keep the live indicator lit. Navigate up to workspace and return to
test a fresh component mount. Test standalone-app behavior on this normal
app-shell path too; the isolated component page is not a PWA.

To retire the temporary broker, first move the dev BFF to an accepted
standing relay/broker or restore the luv tile's old `/api/btop-luv` prefix.
Removing the override alone would leave the new tile without a producer.
Then restore the base dev API declaration:

```bash
docker compose -f docker-compose.dev.yml up -d --no-deps api
```

That removes the temporary broker override/network from the existing dev API.
Then stop Control's socket-test stack and remove its disposable socket volume
using its runbook. Do not run `down` on the normal dev stack. No persistent
application data is held by the test exporter/relay/broker.

Actual phone results remain user acceptance; local/browser automation must not
be reported as confirmation that a physical phone can open the page.

Verified after the correction: Chromium and mobile-sized WebKit pass against
the existing dev URL through Caddy, including fresh frames, palette, stale
indication, reconnect, and repeated mounts. The dev homepage remains HTTP 200.
Type-check and scoped lint pass; rendered Compose comparison proves the
overlay changes only the dev API's broker settings and network membership.
The extra UI container and hostname are removed; production containers were
not restarted.

The normal dev page now also passes Chromium and mobile-sized WebKit checks:
fresh lavender frames, stale/offline recovery, visibility/page-cache recovery,
route navigation and browser Back, one active luv stream, and no legacy luv
requests or page exceptions. The header, footer, and joi tile remain present.
Physical-phone interruption acceptance and production cutover remain open.

The [recovery hardening](./btop-recovery.md) records the later `.3` candidate,
physical-port profile, collector supervision, and isolated restart tests.

## Harness

Control owns the native exporter, relay, pinned image references, and the
isolated `control-telemetry-socket-test_broker` network. Follow the owning
acceptance instructions routed through the
[multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md).
Start that stack first, using packaged images with no source overlay.

From this repo, with its container-installed dependencies present:

```bash
bash tests/btop-browser/build.sh
export BTOP_BROWSER_ARTIFACTS="$(mktemp -d /tmp/vedanta-btop-browser.XXXXXX)"
docker compose --env-file /dev/null -f docker-compose.btop-browser-test.yml up -d --wait preview
docker compose --env-file /dev/null -f docker-compose.btop-browser-test.yml exec -T preview npx --no-install tsc --noEmit -p tests/btop-browser/tsconfig.json
docker compose --env-file /dev/null -f docker-compose.btop-browser-test.yml run --rm --no-deps browsers
docker compose --env-file /dev/null -f docker-compose.btop-browser-test.yml down
```

Stop this preview before removing Control's isolated stack and socket volume.
The screenshots remain in the selected private temporary directory. Success
ends with `BTOP_BROWSER_ACCEPTANCE_PASS`; a failed assertion exits nonzero and
writes a failure screenshot plus bounded connection diagnostics. Set
`-e BTOP_BROWSER_ENGINE=webkit` or `chromium` on the runner for one engine.

The preview serves only the real monitor and real BFF router, without the
portal's unrelated project providers. It loads no checkout environment file.
Both services run non-root on the isolated broker network with read-only source
mounts, no host ports, no credentials, and no Docker socket. The preview has a
1 GiB cap/768 MiB Node heap; the sequential browser runner has a 1 GiB cap,
384 MiB Node heap, and 256 MiB shared memory. Its temporary image builder is
capped at 4 GiB/two CPUs and removed on exit.

The [Playwright image](https://playwright.dev/docs/docker) and SDK versions
match. They live only in the test image, not the portal dependency tree.

## Automated checks and limits

Chromium desktop and mobile-sized WebKit exercise:

- Real full-frame rendering, a 132×43 grid, the packaged lavender palette,
  and no horizontal viewport overflow.
- Reachability despite an offline browser heuristic.
- A deliberately suppressed data stream: the live indicator expires and
  the component recovers without a page reload.
- Browser network loss/restoration, visibility changes, and page-cache
  lifecycle events.
- Repeated mount/unmount, exactly one active stream, full-frame-first after
  reconnect, and no page exceptions.

The separate `docker-compose.btop-socket-test.yml` runs BFF sequence, session,
freshness, backpressure, allowlist, and real SSE reconnect regressions against
the same isolated stack. Control owns hardware-counter comparison and actual
collector freeze/resume/exit/replacement tests.

Synthetic page events and [device emulation](https://playwright.dev/docs/emulation)
are not physical iPhone acceptance. Before a public tile switch, test actual
Safari/Chrome sleep and resume, background-tab recovery, standalone-app
behavior, and network switching. Also exercise the final ingress path and
coordinated broker/producer/BFF interruption. Keep these gates open; a passing
headless run does not close them.

## 2026-09-10 checkpoint

Control candidate `2026-09-10.2` uses exporter/relay source `18e523e` and btop
`4aca040`. Both images were pulled by their published digests before the final
Chromium/WebKit run. All cases above passed, as did the separate 22-check
protocol suite, source type-check, and scoped lint. Existing Found Footy and
scroll checks passed serially: 40 passes and one optional live-NATS skip.
Their first parallel run inside the preview hit its PID cap; they were rerun
in the separate test container, without changing that cap or product code.

No public release occurred. The exact image record and remaining node gates
are routed through the multi-node plan. Screenshots are temporary acceptance
artifacts, not public assets or a visual redesign.
