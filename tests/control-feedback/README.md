# Control feedback acceptance

Use the existing dev workspace page and capped Playwright image; no additional UI
server or public route is created. The runner mounts real shared components
only in its private browser page, through Vite's test-module import.

```bash
BASE_DOMAIN=<base-domain> BTOP_BROWSER_ARTIFACTS=/tmp \
  docker compose -f docker-compose.btop-browser-test.yml run --rm --no-deps \
  --entrypoint node browsers /app/tests/control-feedback/run.mjs
```

The existing [browser image build](../btop-browser/build.sh) supplies Playwright
if the image is absent. This check requires Vite, not a production static build.

Coverage: real breadcrumb/up-arrow hover, hold and release; rapid repetition;
shared Button, BreadcrumbLink, Badge and Switch motion defaults; keyboard
activation/focus; disabled controls; touch taps; Chromium touch delivery and
cancellation; and preservation of independent status animation. It runs desktop
and touch-sized Chromium/WebKit in separate input contexts. Physical iPhone long-press behavior
remains a device check; WebKit taps are not proof of a held iOS touch. Raw CDP
touch injection delivered trusted events but did not activate CSS `:active`
in the tested Chromium build, so it does not prove visual long-press feedback.

## 2026-09-13 verification

All four configurations passed on the existing dev frontend. Type-check and
the production Vite build passed; GitHub contribution and other independent
animation sources are unchanged. The build ran in a separate capped container
after an attempt inside the 1 GiB dev API container exhausted that container's
memory budget. Do not run frontend bundle builds inside the serving API.
This is source/dev acceptance, not a production deployment or physical-iPhone
long-press acceptance.

### Production follow-up

The [frontend-only rollout](../../deploy/INFRA-NOTES.md#5-frontend-only-rollout--2026-09-13)
subsequently deployed `3767bf9`. Separate checks on the actual public workspace
page passed in desktop and mobile-sized Chromium/WebKit, without importing
the Vite-only fixtures. Desktop holds/releases settle immediately to the
expected colors; mobile checks cover motion defaults and taps. The GitHub
graph retains its separate fade. Mobile WebKit initially cancelled navigation
before page load; two isolated repeats passed. Physical iPhone long-press
acceptance remains open.
