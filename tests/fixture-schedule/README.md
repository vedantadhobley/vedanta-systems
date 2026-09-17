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
It advances browser time through scheduled kickoff and two overdue minutes
while the fixture remains upcoming, then confirms the backend playing state
removes the signed countdown. Pure formatting tests cover zero, sub-minute
rounding, hours, and invalid timestamps in the Found Footy regression suite.
It is browser emulation, not physical-iPhone acceptance.

2026-09-16: all three browser configurations, source type-check, the existing
Found Footy regressions (optional broker integration skipped), and the production
Vite build passed. No BFF/backend change or production deployment is required
to test this in dev; production still needs its separate frontend rollout.
