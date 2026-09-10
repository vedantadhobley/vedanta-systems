# TODO

Active work, deferred items, and known cleanup. Top of file is the
freshest priorities. Items move to `docs/decisions.md` when they
become "done" in a way that captures a permanent decision; otherwise
they're deleted from this file when the work lands.

---

## Now — audit containment

The [2026-08-20 full-project audit](./full-project-audit-2026-08-20.md)
is the evidence record. Contain these risks before new public deployment:

- [x] Make the existing private Long Exposure database credential explicit in
  both gitignored environments, require it in Compose, and keep both `.env`
  files at mode `0600`. Pattern B removes the credential from this portal.
- [x] Remove the Docker socket and host SSH mounts from the development
  frontend. Restrict Vite's allowed hosts.
- [x] Change the public HTTP route to redirect to HTTPS and establish baseline
  security headers at the owning ingress layer.
- [x] Block trailing-slash variants of internal refresh endpoints and enforce
  the boundary in Express rather than relying only on nginx exact locations.
- [x] Disable the dead development and production joi SSH collectors so they
  stop restart-looping.
- [x] Add container memory/PID limits and a Node heap ceiling from the workspace
  memory budget.
- [ ] Reconcile the public Git recovery branch without blindly pushing local
  `main`. The revoked PAT remains public history until a deliberate coordinated
  rewrite.

Cross-project work belongs in dhobley's btop plan and the owning proxy, NATS,
btop, and Control repositories. Accept private exporter access before cutover.
NATS authentication is deferred to joi's production transition under the
[workspace decision](../../../vedanta-dhobley/docs/decisions/2026-09-10-defer-nats-authentication.md);
it is not a btop prerequisite.

---

## Now — Found Footy presentation and media correctness

These are production behavior defects. Fix them independently of the paused
visual redesign.

- [x] Consume Found Footy's backend-owned fixture presentation. Processing
  `state` remains separate data; `presentation_state` alone owns playing,
  finished, upcoming, and deferred grouping. Provider status codes remain
  display strings and are not interpreted by the BFF or React.
- [x] Implement FF-077 targeted live delivery. `fixture.status` patches the
  complete inline indicator without reordering; coalesced `fixture.update`
  IDs fetch only those fixtures; `event.video` fetches only that event. Full
  REST snapshots recover initial connection, stream/NATS reconnect, browser
  wake, page restore, online, video resume, midnight, and timezone changes.
- [x] Implement FF-085/FF-086 consumer recovery in source: `event.update` to
  SSE `event_update`, complete event upserts, targeted missing-parent recovery,
  non-destructive failed-read recovery, stale-response protection, and bounded
  BFF/browser diagnostics. No old-subject listener. This supersedes FF-077's
  `event.video` path in the coordinated 2026-09-08 production rollout.
- [x] Coordinate the FF-085/FF-086 hard cutover: production runs consumer
  `ca1f8e5`, Found Footy `3723ce2` (includes `dbc2a76`), and schemas `fcfb28f`.
  Independent release, REST, NATS subscription, and SSE checks passed.
- [ ] Trace natural clip changes and zero-candidate completion through client
  application before closing FF-085/FF-086. Existing browser tabs must load
  the new bundle; reconnect alone does not update JavaScript. The
  [live-data release gate](./found-footy-live-data.md#coordinated-release-gate)
  owns the checklist and test commands. The Mbappé incident's exact failed
  delivery hop remains unproven; do not close that question by inference.
- [x] Replace the video watchdog's `readyState >= 2` heuristic. Ordinary
  loading/buffering must never trigger pause/play recovery or the custom play
  overlay. A rejected `play()` may show **Play video**; a confirmed media error
  may show **Retry video**; a false-playing recovery requires buffered media
  ahead of `currentTime`, a non-loading network state, and no active user seek.
- [ ] Reproduce native-control scrubbing on physical iPhone Safari and Chrome.
  The app-wide `touch-action: pan-y` restriction is removed and the watchdog
  stops as soon as native controls appear. Confirm on-device that the complete
  drag, precision adjustment, and release gesture now remains browser-owned.
- [x] Remove the page-level iOS `pagehide` mutation that pauses every video and
  clears its `src` behind React. Mounted media now follows the browser's page
  lifecycle; React cleanup releases it only when the modal unmounts.
- [x] Synchronize React mute state with native `volumechange`; the custom
  unmute affordance must not disagree with native controls.
- [ ] Add a physical-device playback matrix covering ordinary clip clicks and
  shared links, Safari and Chrome on iPhone, desktop Chrome, slow startup,
  mid-play buffering, long/precision scrubs, deliberate pause, background and
  foreground, page restore, autoplay rejection, range seeking, and real media
  errors. Both entry paths must converge on one player contract.

  **Development validation blocked (2026-08-30):** the Found Footy development
  API container is present, but its binary exits on migration-chain drift for
  `20260825_01_add_terminal_observed_at`. The Vedanta Systems BFF therefore
  receives connection failures from that upstream. Focused mock-upstream tests
  cover the consumer contract; live browser verification resumes after the
  owning repo repairs its development migration state.

- [x] Add a BFF historical-share projection for the current `v` plus `s` URL.
  Preserve the targeted fixture/event instead of reducing it to a date, and
  derive `media.state` with a server-side `GET` to the existing Found Footy
  media route with redirects disabled: `302` available, `410` removed, `404`
  unknown. Do not follow the Garage redirect or download media. No new Found
  Footy endpoint is needed unless a later canonical URL removes `v` and keeps
  only the share ID.
- [x] Make retained GUI share links open their historical fixture/event and
  show **video no longer available** for authoritative removed media. Do not
  classify that terminal state as autoplay failure or a retryable media error.
  The BFF `/event/<event-id>` route returns the targeted fixture/event, and
  React keeps it separate from the bounded public window. It survives reload,
  reconnect, midnight, timezone changes, and its programmatic date switch while
  `v` remains present. Only a user date action—including a skip to the next
  non-empty date—pushes a clean history entry and releases it. Back and Forward
  restore both states.
- [x] Update crawler metadata to omit `og:video` when a known share is removed
  or unknown while keeping the historical fixture/event page card.

---

## Now — native multi-node btop consumer migration

This repo owns only the browser-facing BFF and tile. Exporter packaging,
control-plane relays, NATS authorization, firewall policy, and node deployment
are routed through the cross-project
[multi-node btop plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md).

- [x] Add the sequence-aware NATS frame store and
  `/api/btop/<node>/{health,stream}` routes without replacing the live path.
- [x] Resume source/transport work in the owning repos: durable btop profile
  `4aca040` builds both variants; Control's `feat/btop-telemetry` branch owns
  common `shared/telemetry/` implementation and isolated acceptance harness.
  See [source and packaging state](./btop-source.md). This does not close the
  host/device or private-access deployment gates.
- [x] Exercise luv's exposed counters and freeze/resume/exit handling in
  Control's read-only hardware probe. Vulkan utilization is still unproven;
  this is not a portal cutover or a standing host deployment.
- [x] Enforce `BTOP_NODES` as an allowlist before deploying the dormant route;
  a valid frame must not allocate an arbitrary node.
- [x] Register SSE cleanup before initial writes, honor write backpressure, and
  bound connection/memory use. This does not replace ingress rate limiting.
- [x] Invalidate cached synchronization when the NATS session ends, and send
  only fresh full snapshots to new streams. BFF unit and real HTTP tests pass;
  coordinated broker interruption and physical-browser wake tests remain.
- [x] Inventory luv and joi before native deployment. The
  [pre-deployment inventory](./btop.md#2026-09-10-pre-deployment-inventory)
  found no joi btop remnants. Subsequent approved cleanup removed the duplicate
  dev luv collector and both obsolete SSH joi collectors on luv. Other projects'
  containers and retained images are not part of this cleanup.
- [x] Add server-only credentials to both BFF bridges, an opt-in credential
  mount, and authenticated integration acceptance with the NATS/Control
  candidates. Real terminal/SSE/full-frame recovery and Found Footy targeted
  event/REST recovery pass in isolation. The live broker is unchanged.
- [x] Remove mandatory credentials from Control's undeployed template/preflight.
  Real luv capture through its private socket, isolated open-mode NATS, and
  BFF/SSE full-frame reconnect passes without credentials. Optional auth stays
  in a separate overlay. This does not deploy a tile or test physical browsers.
- [x] Publish immutable Control candidate `2026-09-10.2`, pull by digest, and
  test real packaged frames in Chromium and mobile-sized WebKit. Fix theme
  discovery and frame-based stale indication; verify reconnect and repeated
  mount cleanup in the [browser harness](./btop-browser-acceptance.md).
- [x] Integrate the NATS-backed luv tile into the normal dev
  `/workspace/vedanta-systems` page without layout or palette changes.
  Chromium/WebKit cover route navigation/Back, recovery, and no legacy luv
  requests. The native joi follow-up below replaces its offline legacy route;
  production is unchanged.
- [x] Accept the [recovery hardening](./btop-recovery.md): explicit physical-port
  profiles, exporter supervision, independent restart recovery, callback-based
  NATS consumption, and five-second snapshots without whole-screen browser
  repainting. Packaged crash/freeze/broker/BFF tests pass; candidate `.3`
  replaces `.2` in the existing dev preview, not production.
- [x] Activate the standing Control luv deployment with automatic startup,
  connect dev to workspace NATS, and retire the temporary socket-test stack.
  Remove the standalone showcase page and run browser tests on the real page.
- [ ] Verify physical node reboot recovery; enabled Docker and container
  restart policies plus process tests do not prove a whole-host reboot.
- [ ] Verify actual iPhone sleep/resume and the final ingress/interruption
  path before switching a public tile. Synthetic lifecycle dispatch is not
  physical-device acceptance. Never deploy test keys or source overlays.
  The [private phone preview](./btop-browser-acceptance.md#private-phone-preview)
  uses the normal dev page and standing broker path. Do not create another
  human-preview frontend or hostname; its old page and overlays are removed.
- [ ] At joi's production transition, coordinate NATS credentials and
  worker/BFF mounts with all clients. This is deferred, not a tile-switch gate.
- [ ] Deploy both integrated tiles to production only after the standing
  native exporter/relay and production NATS/ingress pass recovery acceptance.
  The next frontend build already selects the new route; do not deploy this
  branch against a broker without both accepted node producers.
- [x] Activate Joi's independent native Docker exporter through NixOS and its
  luv-side Control relay after explicit approval. Accept physical hardware,
  private reachability, offline detection, and exporter/relay restart recovery.
  Switch only its existing dev tile to NATS. Chromium/WebKit pass for both
  nodes; inference is unchanged. The
  [multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md)
  routes to the owning deployment and rollback evidence.
- [ ] Make the browser monitor list data-driven before adding Nexus nodes.
- [x] Remove the unused dev luv collector and both obsolete SSH joi collectors,
  their Compose declarations, and host-port exceptions. Preserve images and
  historical source for recovery; keep the public prod luv collector live.
- [ ] Remove `mountBtopProxy`, the remaining prod luv collector/declaration and
  port 3102, embedded source child, and obsolete broadcaster publisher after
  public cutover.

The two-plane visual system is not part of this migration.

---

## Now — frontend shell and interaction re-foundation

The [frontend re-foundation plan](./plans/frontend-refoundation.md) remains the
authoritative architecture and sequence. The
[frontend shell plan](./plans/frontend-shell.md) now owns the first runtime
slice. Visual component implementation remains paused until viewport, scroll,
safe-area, and layout-stability ownership are proven.
FF-077 has landed the Found Footy data foundation: backend-owned presentation,
one fixture collection, targeted SSE updates, live/pinned intent, carryover,
snapshot ordering, and recovery. Work resumes with route ownership, explicit
freshness UI, stale search/shared-link cancellation, and the accessible
interaction primitives.

Then land shared input, focus, dialog, disclosure, and media primitives before
the first complete two-plane route slice. The
[2026-08-19 frontend audit](./frontend-audit.md) and
[2026-08-20 full-project audit](./full-project-audit-2026-08-20.md) own the
evidence; the plan owns implementation order. Do not duplicate their full
finding lists here.

Production contains the mobile shell correction: document-owned scroll,
safe-area-aware header and bottom navigation, standalone manifest, browser
zoom, and replacement of the persistent phantom-height stabilizer with exact,
transition-scoped retained space that is consumed by later scrolling. Before
marking the behavior validated, verify on a physical iPhone that:

- Safari and Chrome minimize their browser bars during ordinary document
  scroll;
- a newly added home-screen app opens standalone and keeps the header below the
  status bar or Dynamic Island;
- the bottom navigation clears both browser chrome and the home indicator as
  their safe areas change;
- Found Footy and Spin Cycle collapses leave the viewport in place, preserve
  the resulting dead space until the user scrolls away, and never accumulate
  unrelated blank height;
- Found Footy search remains stable while the keyboard opens and closes.

The production correction is an interim baseline, not the final shared shell.
Next:

- [ ] Apply the [component review gate](./interaction-principles.md#component-review-gate)
  as primitives migrate. Record input, hit-area, focus, context, text-scaling,
  state-feedback, and reduced-effect evidence; adopting the guidelines does
  not mark existing components as validated.
- [x] add opt-in viewport and safe-area diagnostics;
- [ ] add desktop scroll-owner and structural-transition browser tests;
- [x] extract a visually unchanged `AppShell` and centralize bottom occlusion;
- [ ] prototype the contained desktop and standalone scroll surface;
- [ ] replace Found Footy's transient spacer with a shared layout transaction;
- [ ] extract a shared dialog/overlay primitive with portal or top-layer
  ownership, background inertness, focus containment/restoration, and
  shell-aware scroll locking. Keep URL reflection in route adapters. Preserve
  Found Footy's production distinction between local overlay opening and
  routed shared-link reconstruction;
- [x] reset competition, fixture, and event disclosure on every canonical date
  change, including skipped empty dates. The current frontend already does
  this; locked finals and explicit shared links remain the only auto-open
  policies. Any future cross-date competition focus must be explicit and
  visible rather than hidden accordion memory; and
- [ ] validate Safari, Chrome, and standalone behavior on a physical iPhone.

---

## Deferred — long-exposure UI roadmap

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
the new day until manual refresh.

The route must revalidate on route entry, wake, `pageshow`, and network
recovery under the shared frontend lifecycle. To learn about a new nightly run
while the route remains continuously visible, add one of these mechanisms:

- **(a) Scheduled `/latest` check** after the expected nightly completion
  window. On change, surface a notice or auto-update.
- **(b) Periodic poll of `/latest`** (every 5–15 min). On change,
  surface a "new day available" toast or auto-update. Light touch,
  no upstream change.
- **(c) SSE push from the long-exposure pipeline** — same shape
  found-footy uses. Worker calls `/api/long-exposure/refresh`
  (internal-only, 404'd at nginx) on vs-api, vs-api fans out an
  SSE event. Most consistent with the other projects, but a notify
  hook in long-exposure's pipeline is overkill for daily cadence.

Default lean: **(a)** plus required resume/re-entry reconciliation. If
quarterly grows an intra-day update pattern, use (b) or (c).

---

## Deferred — spin-cycle maintenance posture

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

## Found Footy — remaining timezone navigation

Surfaced 2026-08-11 while auditing the found-footy ingest/retention timezone
contract. FF-077 fixed carryover and removed the fixed-offset date index by
deriving navigation dates from the complete client snapshot. One staging
preview edge remains in `docs/found-footy-timezone.md`:

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

---

## Deferred runtime cleanup

- Add automated coverage around the production-only OG server's retained-event
  metadata and available-versus-terminal video tags.
- Replace the global production CORS policy with route-specific behavior.
- Add upstream request deadlines, SQL statement timeouts, consistent health
  semantics, and generic public error bodies.
- Remove unused `minio` and `mongodb` dependencies, upgrade Node from its
  end-of-life release, and remediate the audited dependency advisories.
- Move the API to a compiled production image with production-only
  dependencies and a non-root runtime.

## Future projects in the portal

Parking lot — not active work.

- **legal-tender** — queued ≥1 week out per current priorities. Will
  be Pattern B from day one (no direct ArangoDB peer in vs-api). When
  it lands: add `src/server/routes/legal-tender.ts` (HTTP proxy),
  `src/types/legal-tender.ts`, `src/components/legal-tender-browser.tsx`,
  and wire into `App.tsx` like long-exposure.
- **cross-wired** — not running yet. Same shape as spin-cycle when it
  stands up; same Pattern B integration path.
