# btop browser acceptance

The [btop migration](./btop.md) keeps the existing fixed-cell renderer and
visual design. Automated browser checks run on the normal dev page with real
luv frames from the permanent Control exporter and relay.

## Browser freshness contract

- A valid full frame starts each connection. Deltas require that base.
- Only received frames renew the live indicator. HTTP health, SSE comments,
  and an open connection do not prove that the displayed data is current.
- Five seconds without a frame makes the indicator offline at the next
  one-second watchdog tick. Retain the last screen; do not call it live.
- Errors, invalid frames, and silent stalls close the stream and retry with
  exponential delays from one to 30 seconds. A valid frame or deliberate
  resume/network-recovery signal resets the delay.
- Hidden/page-cache-suspended monitors disconnect. Visibility restoration,
  pageshow, and network recovery start a new stream requiring a full frame.
  Unmount removes listeners, timers, and the stream; old callbacks cannot
  mutate a new connection.
- Do not use navigator.onLine to prohibit connections: it can report offline
  while the BFF remains reachable, as noted in the
  [browser API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).

These changes are active in dev, not the public frontend. Health endpoints
remain available for operations; the browser no longer polls them.

## Private phone preview

Use the normal page on the existing dev frontend:
`http://vedanta-systems-dev.<base-domain>/workspace/vedanta-systems`.

The luv tile uses /api/btop/luv and Control release 2026-09-10.3 on the
existing workspace NATS broker. Found Footy uses the same broker with its
own environment-scoped subscription. The base dev Compose uses the explicit
nats.luv-dev address; no btop broker override or test network is required.
The layout, colors, and offline legacy joi tile are unchanged.

The separate showcase HTML, React entrypoint, test UI server, and preview
Compose overlays were removed on 2026-09-10. The earlier extra hostname and
UI container had already been removed. Do not recreate a separate human
preview or reintroduce a second frontend just to run these browser checks.

The temporary socket-test exporter, relay, broker, network, and disposable
socket volume were retired after the existing dev BFF moved to the standing
producer. The normal dev frontend was not recreated; only its API changed.
No production container or workspace broker was restarted.

The [multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md)
routes to Control's exact standing declaration, image pins, live worktree
dependency, startup, and rollback instructions. Docker boot activation and
container restart policies are checked; a physical host reboot is not.

On the phone, try Safari and Chrome: watch the readings advance, lock and
unlock, background and return, then switch Wi-Fi/cellular while keeping
Tailscale connected. Frames should resume without reloading; stale data must
not retain a live indicator. Navigate up to workspace and back, and test the
installed standalone app. Report these physical-device results separately
from synthetic browser lifecycle tests.

Production cutover remains separate. The next frontend build selects the
NATS luv route; verify the public ingress and physical-device checks before
deploying. There is no automatic fallback to the legacy collector.

## Harness

With the existing dev page running, build the disposable browser runner if
needed and select a private artifact directory:

```bash
bash tests/btop-browser/build.sh
export BTOP_BROWSER_ARTIFACTS="$(mktemp -d /tmp/vedanta-btop-browser.XXXXXX)"
# Set BASE_DOMAIN to the existing dev domain, or use its gitignored .env value.
docker compose -f docker-compose.btop-browser-test.yml run --rm --no-deps browsers
```

This starts only a browser runner on the proxy network, not a frontend, BFF,
or broker. It mounts source read-only, receives no credentials or Docker
socket, and has no host ports. Its cap is 1 GiB, with a 384 MiB Node heap and
256 MiB shared memory. The temporary image builder is capped at 4 GiB and
two CPUs and removed on exit. Screenshots remain private temporary files.

Success ends with BTOP_BROWSER_ACCEPTANCE_PASS. A failed assertion exits
nonzero and records a screenshot plus bounded diagnostics. Select one
engine with -e BTOP_BROWSER_ENGINE=webkit or chromium on the runner.
The [Playwright image](https://playwright.dev/docs/docker) and SDK versions
match and live in the test image, not the portal dependency tree.

## Automated checks and limits

Chromium desktop and mobile-sized WebKit cover real full-frame rendering,
the 132-by-43 grid, lavender palette, viewport fit, offline heuristics, silent
stalls, offline/online recovery, visibility/page-cache recovery, route/Back
cleanup, one active luv stream, and no legacy luv requests or page errors.
Both passed on the standing path after the 2026-09-10 cutover.

The separate isolated NATS/BFF/SSE tests and
[recovery harness](./btop-recovery.md) remain; they create no showcase page.
Run fault injection against disposable brokers, never the workspace broker.
Physical iPhone sleep/resume and actual host reboot acceptance remain open.

User feedback on 2026-09-10 confirms the normal dev page works well on their
phone. This accepts the observed phone behavior; it does not establish the
full browser/network-change matrix or a physical host reboot test.
