# Fixture schedule acceptance

Mount the actual Found Footy browser in a private test browser on the existing
Vite dev page. No service, public route, or backend fixture is created.

```bash
BASE_DOMAIN=<base-domain> BTOP_BROWSER_ARTIFACTS=/tmp \
  docker compose -f docker-compose.btop-browser-test.yml run --rm -T --no-deps \
  --entrypoint node browsers /app/tests/fixture-schedule/run.mjs
```

The [existing browser image](../btop-browser/build.sh) supplies Playwright.
This test requires Vite; it does not run against the production static bundle.
It covers upcoming → playing → halftime → finished, deferred and roundless
fixtures, grouped/search views, expansion, Local/UTC, long team names, and
independent title/metadata widths at desktop, 320 px, and mobile-WebKit sizes.
It also asserts that scheduled kickoff owns the metadata row's right edge and
that the countdown grows to its left without moving that anchor.
It advances browser time through scheduled kickoff and two overdue minutes
while the fixture remains upcoming, then confirms the backend playing state
removes the signed countdown. Pure formatting tests cover zero, sub-minute
rounding, hours, and invalid timestamps in the Found Footy regression suite.
It is browser emulation, not physical-iPhone acceptance.

2026-09-16: all three browser configurations, source type-check, the existing
Found Footy regressions (optional broker integration skipped), and the production
Vite build passed. No BFF/backend change or production deployment is required
to test this in dev.

The subsequent [frontend-only production rollout](../../deploy/INFRA-NOTES.md#6-fixture-schedule-rollout--2026-09-16)
deployed both changes as `47c2a1f`. Separate public Chromium and mobile-WebKit
checks passed on real fixtures in all four presentation states. Those checks
use a separate REST read (the page can cancel its initial fetch on SSE recovery),
scope fixture selection to the displayed local date, and wait for the countdown
mount effect. No production data was changed to simulate a delayed kickoff.

2026-09-18: the countdown-before-kickoff order passed the three browser
configurations, type-check, Found Footy regressions, and the production Vite
build. The browser assertions compare the kickoff element itself—not its wider
countdown wrapper—with the status and metadata right edges. This correction is
verified in dev and is not yet deployed.
