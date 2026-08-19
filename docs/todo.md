# TODO

Active work, deferred items, and known cleanup. Top of file is the
freshest priorities. Items move to `docs/decisions.md` when they
become "done" in a way that captures a permanent decision; otherwise
they're deleted from this file when the work lands.

---

## Now — frontend re-foundation through Found Footy

The [frontend re-foundation plan](./plans/frontend-refoundation.md) is the
authoritative sequence. Begin with Found Footy's route-owned runtime: separate
live intent from the selected date, reconcile REST after every disconnected
interval, protect request ordering, and handle wake, page restore, network
recovery, midnight, and timezone changes.

Then land shared input, focus, dialog, disclosure, and media primitives with
the first complete two-plane route slice. The
[2026-08-19 frontend audit](./frontend-audit.md) owns the evidence; the plan
owns implementation order. Do not duplicate their full finding lists here.

---

## Now — long-exposure UI roadmap

Major v2 landed end of May (`5b53ea5` rich browser + `f798b8d` date
navigator + week view + `3136387` day-arc timeline strip, plus
`b0210b8` + `d5f2ca8` bug fixes). What's still queued:

- **Ticker filtering.** `/api/long-exposure/symbol/:symbol` already
  returns per-ticker history. Add a filter affordance (URL param +
  visible chip) for drilling into one symbol across dates.
  Component not wired yet — flagged in `5b53ea5`'s commit msg.
- **Reusable timeline / group / card primitives extensible to
  quarterly.** DayView and WeekView are structurally similar but
  don't share extracted primitives yet — building QuarterView as
  another sibling will mean rewrites unless we extract first. Hold
  the actual quarterly implementation until upstream long-exposure
  finalizes it, but the extraction can happen any time.
- **Component splitting.** `long-exposure-browser.tsx` is now ~1200
  LOC after the v2 landings. Natural breakpoints:
  `DateNavigator` / `DatePicker` / `ViewToggle`,
  `DayView` + `DayTimelineStrip`, `WeekView`, `EventCard`. Not
  blocking — matches `found-footy-browser.tsx`'s scale. Worth
  considering before quarterly lands so we extract once, not twice.
- **Open architectural question — how the frontend learns about
  new days when the nightly pipeline lands them.** See
  "Decide — long-exposure data refresh pattern" below.

References: API contract in `src/server/routes/long-exposure.ts`;
type shapes in `src/types/long-exposure.ts`. Upstream long-exposure
narration pipeline lives at `~/workspace/dev/long-exposure/`.

---

## Decide — long-exposure data refresh pattern

Long-exposure produces daily output (the nightly narration pipeline
runs overnight). Right now the frontend fetches
`/api/long-exposure/latest` on mount and never refetches — if the
user keeps the page open across the nightly cycle they don't see
the new day until manual refresh. Three options:

- **(a) Do nothing.** Acceptable for a daily-cadence product;
  manual refresh is a known workflow. Zero code change.
- **(b) Periodic poll of `/latest`** (every 5–15 min). On change,
  surface a "new day available" toast or auto-update. Light touch,
  no upstream change.
- **(c) SSE push from the long-exposure pipeline** — same shape
  found-footy uses. Worker calls `/api/long-exposure/refresh`
  (internal-only, 404'd at nginx) on vs-api, vs-api fans out an
  SSE event. Most consistent with the other projects, but a notify
  hook in long-exposure's pipeline is overkill for daily cadence.

Default lean: **(a)** for now. Revisit before quarterly lands —
if quarterly grows an intra-day update pattern, the answer is
probably (b) or (c).

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

- **found-footy. ✅ Done (both envs).** `src/server/routes/found-footy.ts` is now
  a Pattern-B shim over the Go read API (`found-footy-{env}-api:8081`) + the NATS
  live-feed bridge (`found-footy.<env>.>` → SSE) + share_id video re-proxy. Dev
  landed 2026-08-13, prod cut over 2026-08-15 — see `docs/decisions.md`. No more
  mongo/minio peers.
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

## Found Footy — timezone navigation (fold into the re-foundation)

Surfaced 2026-08-11 while auditing the found-footy ingest/retention
tz contract from the Go-rebuild side. Both items live in the
timezone-scoping path documented in `docs/found-footy-timezone.md`.
The active re-foundation captures these in its Found Footy slice rather than
patching the legacy provider in isolation. The slice must address #1.

1. **"One future day" splits a tz-straddling match day for eastern
   users.** `navigableDates` (`FootyStreamContext.tsx`) keeps every
   past date + today + exactly ONE `firstFuture` local date. But a
   single match day (one UTC calendar day of kickoffs) tz-spills into
   *two* local calendar days for users east of UTC — e.g. a 20:00-UTC
   Saturday kickoff is Sunday 05:00 for Tokyo (+9). So the match day's
   later kickoffs land on `firstFuture + 1`, which is **not
   navigable** while those fixtures are still `staging`. The eastern
   user previews only the earlier half of the next match day. (Once
   the fixtures go active/completed they're always visible, so the gap
   is staging-preview only — but it's a real gap.) The rule counts
   *local calendar days* when it should reason about *match days*. The
   edge case is already half-acknowledged in
   `found-footy-timezone.md` §"Fixture straddles midnight".

2. **The date index uses one current fixed offset, not an IANA timezone.**
   The client calls `/dates?tz=<tzMin>` with the browser's offset at request
   time. The BFF applies that offset to every fixture in the window, while
   `getDateForTimestamp()` uses the browser's date rules for each timestamp.
   Historical fixtures across a daylight-saving boundary can therefore be
   indexed an hour differently from their final client bucketing. Replace the
   fixed-offset index contract or prove the retained window cannot expose the
   mismatch.

---

## Active — native multi-node btop migration

The cross-node deployment belongs to the workspace btop, joi, Nexus, NATS,
and dhobley repos. This repo owns the browser-facing consumer:

- [x] Add the sequence-aware NATS frame store and
  `/api/btop/<node>/{health,stream}` routes without replacing the live path.
- [x] Add the sequence-aware frame encoder prototype and versioned schema in
  the shared NATS repo. Its disabled direct-agent publisher is superseded and
  must not be deployed.
- [x] Reconcile the public-display child against current upstream btop as
  configurable operator/public profiles (`feature/vedanta-profiles`,
  `6f76ec6`) and verify GPU plus non-GPU builds.
- [ ] Move node-agent packaging to the authoritative `~/workspace/btop/src`
  checkout and retire this repo's stale embedded `btop/src` child.
- [ ] Remove the direct NATS publisher from the node agent and implement the
  same private-stream relay contract in joi-control-plane and
  nexus-control-plane. Give each relay publish rights only for its owned nodes.
- [ ] Bind each agent's HTTP/SSE endpoint to the compute network and restrict
  it to its owning control plane. NATS remains internal to luv.
- [ ] Point the luv tile at the new route after the first native agent proves
  startup, reconnect, sequence-gap, and periodic-full recovery.
- [ ] Move joi only after its NixOS-hosted native agent is healthy; do not
  revive the SSH collector.
- [ ] Make the monitor list data-driven before adding Nexus nodes.
- [ ] Remove `mountBtopProxy`, both btop Compose pairs, their host-port
  exceptions, and the dead nginx viewer block after cutover.

The two-plane visual system is not part of this migration.

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
