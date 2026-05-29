# TODO

Active work, deferred items, and known cleanup. Top of file is the
freshest priorities. Items move to `docs/decisions.md` when they
become "done" in a way that captures a permanent decision; otherwise
they're deleted from this file when the work lands.

---

## Now — long-exposure UI roadmap

Minimal v1 just landed: today's narrated events grouped by scorer
(`src/components/long-exposure-browser.tsx` v1). Queued enhancements
build on the API surface already exposed in
`src/server/routes/long-exposure.ts`:

- **Daily synthesis pane.** `/api/long-exposure/synthesis/:date`
  serves the day's themes paragraph (the SYNTHESIZE output). Render
  it as a header above the event groups.
- **Weekly aggregate view.** `/api/long-exposure/aggregate/latest`
  and `/aggregate/:weekStart` serve the weekly rollup. Own view —
  either its own URL within `~/workspace/long-exposure` or a toggle
  in the long-exposure page.
- **Single-event drill-down.** `/api/long-exposure/event/:id`
  returns the full payload (prose + blueprint + raw score breakdown
  + verifier notes + interpretation). Currently the browser doesn't
  navigate into individual events; this is the panel that exposes
  the "why this event?" detail.
- **Reusable components extensible to quarterly.** Long-exposure
  will eventually grow a quarterly view too. Design the daily +
  weekly + drill-down components so quarterly drops in without
  rewrites — generic timeline/group/card primitives, not
  "this-is-a-day"-shaped logic. **Hold quarterly until the upstream
  implementation is finalized**, but build daily + weekly with
  re-use in mind.
- **Ticker filtering.** `/api/long-exposure/symbol/:symbol` already
  returns per-ticker history. Add a filter affordance (URL param +
  visible chip) for drilling into one symbol across dates.

References: API contract in `src/server/routes/long-exposure.ts`;
type shapes in `src/types/long-exposure.ts`. Upstream long-exposure
narration pipeline lives at `~/workspace/dev/long-exposure/`.

---

## Now — spin-cycle maintenance posture

spin-cycle is scheduled to come down for maintenance (out-of-band of
this repo). The vs-api spin-cycle route is gated on
`SPIN_CYCLE_POSTGRES_URI` at startup (so it won't mount if the env is
unset), but it doesn't degrade gracefully if the upstream postgres
goes away mid-flight — calls will surface as 500s from the pg pool.

**Decide before the maintenance window opens:**

- (a) Blank `SPIN_CYCLE_POSTGRES_URI` in the active `.env` so the
      route doesn't mount during downtime. Simplest. Users hitting
      `/api/spin-cycle/*` get 404 from Express; the spin-cycle page
      surfaces "backend offline" via the SSE health check.
- (b) Leave as-is. Accept 5xx from the spin-cycle path until the
      project returns. No code change.
- (c) Add a maintenance-mode handler in `src/server/routes/spin-cycle.ts`
      that catches pg errors and returns 503 with a "maintenance"
      payload. Most user-friendly; small code change.

Default lean is (a) until a decision is made — it's reversible
without code changes.

---

## Pattern A → Pattern B migration (per project)

Decision rationale in `docs/decisions.md`. Per-project backlog:

- **found-footy.** vs-api reads `found-footy-{env}-mongo` +
  `-minio` directly. `found-footy-dev-api:8080` already exists per
  `caddy.d/found-footy.caddy`. Migration: swap
  `src/server/routes/found-footy.ts` from mongo+minio clients to an
  HTTP proxy to `found-footy-{env}-api:8080`. The SSE refresh hook
  (`/api/found-footy/refresh`, internal-only — nginx 404s the public
  path) needs to keep working; the new shape just changes who's on
  the other side.
- **spin-cycle.** vs-api reads `spin-cycle-{env}-postgres`.
  `spin-cycle-{env}-api:3000` exists. Migration: swap
  `src/server/routes/spin-cycle.ts` from `pg` pool to HTTP proxy.
  Same internal-only `/refresh` consideration as found-footy.
- **long-exposure.** Pattern A by design until LE grows its own
  API. Revisit when that lands; the route file header explicitly
  notes the current choice.

Bundle each migration with the next feature touching that project's
data surface. Don't migrate proactively.

---

## Verify — `nginx.conf` cleanup

`nginx.conf` is still load-bearing in prod (crawler routing to OG
server, internal-only webhook 404s, SSE/range quirks, video
streaming). One specific block looks stale:

- The `/btop-luv/` location block sets `$btop_upstream` to
  `vedanta-systems-prod-btop` — a container name that no longer
  exists. The actual containers are `vedanta-systems-prod-btop-luv`
  and `vedanta-systems-prod-btop-joi` (post luv/joi split), and they
  both run `network_mode: host` so they're not reachable via docker
  DNS anyway. Btop traffic goes through the Express API
  (`/api/btop-{luv,joi}/*`), which reaches host ports via
  `host-gateway`. The `/btop-luv/` block in `nginx.conf` appears
  dead — verify and remove.

Related minor cleanup: `og-server.js` is alive (serves dynamic OG
meta tags for crawlers via the `error_page 418` path; `start.sh`
launches it alongside nginx). But its second responsibility —
SSR-style data injection — is dead: the `$needs_footy_data` map in
`nginx.conf` is commented out (preload added 1.3MB and crashed
mobile). The dead code path in `og-server.js` could be trimmed; no
behavior impact, just less surface area.

## Future projects in the portal

Parking lot — not active work.

- **legal-tender** — queued ≥1 week out per current priorities. Will
  be Pattern B from day one (no direct ArangoDB peer in vs-api). When
  it lands: add `src/server/routes/legal-tender.ts` (HTTP proxy),
  `src/types/legal-tender.ts`, `src/components/legal-tender-browser.tsx`,
  and wire into `App.tsx` like long-exposure.
- **cross-wired** — not running yet. Same shape as spin-cycle when it
  stands up; same Pattern B integration path.
