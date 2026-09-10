# btop browser acceptance

The [btop migration](./btop.md) keeps the existing fixed-cell renderer and
visual design. This isolated harness tests that component with real luv
frames from Control's packaged exporter and relay. It does not deploy a tile,
connect to workspace NATS, or change Found Footy.

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

These changes are active in the private preview, not the public frontend.
The health endpoints remain available for operations; the component no longer
polls them.

## Private phone preview

The user-approved temporary preview is running at
`http://vedanta-systems-dev-btop-preview.<base-domain>/`. Connect the phone to
Tailscale and use the existing private DNS domain. The root redirects to the
acceptance page. It shows real luv data from Control candidate `2026-09-10.2`,
not fixture data or a mock screen.

`docker-compose.btop-preview.yml` reuses the capped runtime in
`docker-compose.btop-preview-base.yml`. Only this BFF/Vite service joins
`proxy`; the relay and test broker remain on their isolated network. The
exporter still exposes only its private Unix socket. No workspace NATS,
production service, normal dev homepage, or authentication policy changes.

Caddy owns the matching hostname in the proxy repo. It admits immediate
tailnet/compute peers and loopback; Docker bridge peers are denied even with
spoofed forwarding headers. The preview's Vite host allowlist is explicit.
There is no Cloudflare route, host port, or automatic restart. The combined
preview/exporter/relay/broker memory ceiling is 1472 MiB for manual acceptance.

After starting Control's digest-selected socket-test stack, from this repo:

```bash
# BASE_DOMAIN is read from the existing gitignored Compose environment.
docker compose -f docker-compose.btop-preview.yml up -d --wait
```

Do not start the automated harness's separate `preview` service at the same
time: both advertise `preview` on the test network. Its browser runner can
reuse the manual preview with `run --rm --no-deps browsers` and the existing
artifact-directory setting.

On the phone, try Safari and Chrome: watch the clock/readings advance, lock
and unlock, background and return, then switch Wi-Fi/cellular while keeping
Tailscale connected. Frames should resume without reloading; a stalled stream
must not keep the live indicator lit. The hide/show button also tests a fresh
component mount. A standalone-app test belongs to the final app-shell path;
this minimal preview is not a PWA.

Stop after manual acceptance:

```bash
docker compose -f docker-compose.btop-preview.yml down
```

Then stop Control's socket-test stack and remove its disposable socket volume
using its runbook. Remove the temporary Caddy block and reload through the
proxy owner when retiring the preview. No persistent application data is held
by this stack.

Verified 2026-09-10: private page HTTP 200; fresh full frame followed by live
frames through Caddy; environment files blocked; bridge/forwarded-header and
untrusted-host probes denied. Type-check, scoped lint, Chromium, and WebKit
pass against the manual preview. Actual phone results remain user acceptance.

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
