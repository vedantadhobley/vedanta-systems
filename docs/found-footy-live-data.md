# Found Footy live-data lifecycle

This document describes the source contract for Found Footy live data. Fixture
visibility and navigation policy live in
[timezone-aware fixture scoping](./found-footy-timezone.md). Found Footy's
producer contract is authoritative in its `docs/api.md`.

**Release state (2026-09-08):** FF-085/FF-086 is **deployed, validating**.
Production runs consumer `ca1f8e5`, Found Footy `3723ce2` (includes producer
`dbc2a76`), and shared schemas `fcfb28f`. Only `event.update` is routed; there
is no dual-subject listener. Deployment and connection checks passed, while
natural event-to-React acceptance remains open. See
[post-rollout verification](#post-rollout-verification) and
[the coordinated release gate](#coordinated-release-gate).

## System path

```text
found-footy workers
  -> Core NATS found-footy.<env>.*
  -> vedanta-systems BFF
  -> targeted browser SSE
  -> React fixture collection

found-footy read API
  -> authoritative REST snapshot and targeted BFF reads
```

Core NATS and browser SSE do not replay missed messages. REST is truth; live
messages reduce latency and read volume.

## Fixture contract

Every REST fixture carries two independent kinds of state:

- `state`: Found Footy's `staging`, `active`, or `completed` processing state;
- `presentation_state`: `playing`, `finished`, `upcoming`, or `deferred`.

Only `presentation_state` controls browser grouping, live badges, and finished
winner highlighting. The BFF and React do not classify API-Football status
codes.

The complete inline indicator projection is:

```json
{
  "presentation_state": "playing",
  "clock": { "minute": 62, "extra": null },
  "status": { "short": "2H", "long": "Second Half" },
  "display": "clock"
}
```

`display` selects the indicator generically. `clock` formats the nullable
minute and extra time. `status` renders `status.short`; `status.long` supplies
accessible or expanded context. Provider codes remain visible data, not
consumer control flow. Winner fields and non-null penalty fields come directly
from the backend.

## NATS to SSE mapping

The BFF retains one environment-wide subscription:
`found-footy.<env>.>`.

| NATS suffix | BFF action | Browser SSE action |
|---|---|---|
| `fixture.status` | Forward the complete projection | Replace the four presentation fields by fixture ID without fetching or reordering |
| `fixture.update` | Union IDs across the short coalescing window and fetch `/api/v1/fixtures?ids=...` once | Replace only those IDs, then regroup and reorder by `presentation_state` and `last_activity_at` |
| `event.update` | Fetch `/api/v1/events?ids=<event_id>` and emit SSE `event_update` with both IDs and the complete event projection | Upsert that event inside `fixture_id`; preserve fixture recency and order |
| NATS connect or reconnect | Emit `resync` | Take a complete fixture snapshot |

`fixture.status` replaces the obsolete `fixture.clock` path. A minute change
and a provider status transition that remains in one presentation group use
the inline path. Kickoff, final whistle, postponed resumption, score/event
changes, and other presentation boundaries use targeted `fixture.update`.

The BFF resolves dirty signals once and broadcasts their resulting resource
projection to all connected browsers. It does not turn ordinary fixture or
event updates into a generic window refresh. `event.update` covers asynchronous
clip changes and discovery completion, including completion with zero clips.
Provider-driven event additions, removals, and corrections remain
`fixture.update` responsibilities.

### Event recovery

- A valid event response includes row data, clips, and discovery flags. React
  replaces or inserts it by ID. The BFF and browser share one pure helper for
  fixture-dependent event labels, so insertion needs no extra fixture read
  when the parent already exists.
- A missing parent triggers `GET /api/found-footy/fixtures?ids=<fixture_id>`;
  the BFF forwards the targeted fixture read. Requests deduplicate by parent,
  have a 15-second deadline, and are capped at 16 pending parents. Overflow
  requests a full resynchronization.
- Parent recovery replays the triggering event and later live messages over
  the fixture response. A later authoritative fixture replacement/removal
  wins over an older parent read. A late read cannot replace an already
  recovered parent.
- An empty, mismatched, or failed event read is **not deletion evidence**.
  The BFF recovers its parent and emits an authoritative `fixture_update`.
  If that also fails or returns no parent, it emits `resync`. The browser
  likewise requests resynchronization when its parent recovery fails.
- Event updates patch the retained shared target and existing search-result
  copies too. A stale retained target must not mask a newer event completion.

Only authoritative fixture membership can remove an event from the normal
collection. An `event_update` never carries a null event as a deletion command.

## Browser state and ordering

The provider stores one bounded snapshot collection. It does not maintain
processing-state buckets. A `v=<event-id>` route may add one independent
retained target projection; that target never changes snapshot membership or
the ordinary date index. If the target fixture is already in the snapshot, its
directly requested event is merged by ID so a removed event can remain visible.

Structural replacements remove the requested IDs, insert the authoritative
responses, deduplicate, and order:

1. playing by `last_activity_at` descending;
2. finished by `last_activity_at` descending;
3. upcoming by kickoff;
4. deferred by kickoff.

Equal recency uses kickoff and fixture ID as deterministic tie breakers.
Inline `fixture.status` and `event.update` applications preserve the exact
fixture array order. Clip changes and discovery completion do not create
fixture recency; recovered parents use the backend's existing recency.

`last_activity_at` comes from Found Footy. Polls, clock ticks, and ordinary
within-group status changes do not advance it. The portal never manufactures a
recency timestamp.

## Snapshot and recovery

The browser takes one complete `GET /api/found-footy/fixtures` snapshot on:

- initial provider setup;
- every SSE connection marker, including reconnection;
- BFF-to-NATS connect or reconnect;
- `visibilitychange` to visible;
- `pageshow`, including back-forward-cache restore;
- browser `online`;
- deliberate stream resume after video playback;
- active-timezone midnight; and
- timezone-mode change.

Requests have an abort controller and generation. Only the newest snapshot may
commit. A shared journal retains the latest 200 live messages. Snapshot,
parent, and retained-target reads replay later messages before committing, so
an older REST response cannot overwrite newer stream state. If the required
history has overflowed, the response cannot commit; request fresh recovery.
A failed refresh retains the last valid fixture collection. A NATS disconnect
also invalidates in-flight bridge reads; reconnect forces a new REST snapshot.

While a shared target remains in the URL, recovery also reacquires its targeted
fixture, event, and media state. Snapshot replacement cannot discard that
projection. Target requests have their own abort controller and generation, so
an older share lookup cannot overwrite a newer URL or clean date action. A
transient revalidation failure keeps the last valid target visible; an
authoritative target `404` clears it.

## Bounded delivery diagnostics

The BFF records `nats_receipt`, `targeted_event`, `targeted_fixture`,
`parent_recovery`, and `sse_delivery` in `[found-footy-live]` JSON logs. The
browser records receipt, application, snapshots, and parent recovery under
`[FootyLive]`. Outcomes distinguish received, applied/written, ignored, failed,
and recovery paths. Event and fixture IDs correlate targeted updates; logs do
not include event bodies, player names, media URLs, or tokens.

Each instance retains 100 recent records and emits at most 60 console records
per minute. The next emitted record reports suppressed output. The browser's
provider exposes `getLiveDiagnostics()` for inspection through React tooling;
there is no public diagnostic endpoint. SSE `written` means accepted by the
server response buffer, **not** proof of browser application. Slow SSE clients
with more than 1 MiB buffered are disconnected and recover with a snapshot.

Successful backend publication in the Mbappé incident is established. The
exact delivery failure is not. Missing completion publication and the former
replacement-only client were separate defects; these diagnostics do not
retroactively prove which hop failed.

## Coordinated release gate

1. Before deployment, the backend owner must verify **zero active discovery
   workflows** and record the check time. Recheck if the release is delayed.
   A quiet fixture window alone is not this check.
2. Stage the exact producer, BFF, frontend, and schema commits together.
   Producer `3723ce2` corrected its earlier transitional-listener guidance;
   both sides now document the coordinated hard cutover.
3. Coordinate producer workers/API and this frontend/API release in that
   window. No temporary dual-subject route exists. A quiet window limits
   exposure; it does not make mixed versions compatible.
4. Reload existing browser sessions onto the new frontend bundle. Reconnect
   replaces REST data but cannot upgrade an already-loaded old JavaScript
   consumer. With the new bundle, SSE and NATS reconnect both force a full
   fixture snapshot. Subscribe before emitting the NATS-connect resync.
5. Verify exact release identities and health, then trace a clip update and
   zero-candidate completion from NATS receipt through client application.
   Verify targeted missing-event/parent recovery and reconnect recovery.
6. If rollback is needed, roll back producer and consumers together. Do not
   leave a split-subject deployment. Record release evidence only after it runs.

Found Footy's retained `PublishEventVideo` Temporal activity name is workflow
history compatibility, not permission to retain the old NATS subject.

### Reproducible verification

Run `npm run type-check` and `npm run test:found-footy` for the focused suite.
The latter skips the real-NATS case unless `NATS_TEST_URL` is set. The isolated
Docker gate runs it too, without host ports or production services:

```sh
docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from tests
docker compose -f docker-compose.test.yml down
```

That integration test publishes through real NATS, reads BFF SSE, applies the
client state function, and interrupts the BFF connection to check resync and
REST recovery. It is not a physical-browser test. Validation also builds both
production Dockerfiles and smoke-loads the BFF router from its built image;
the API image must include the shared event and diagnostics helpers.

**Pre-deployment verification (2026-09-08):** all 38 focused tests passed in the
isolated NATS gate, with no skipped tests. Type-check, both production image
builds, and the API-image router smoke test passed. Changed-file ESLint has no
errors and retains the provider's pre-existing Fast Refresh warning. Existing
Node/dependency and bundle-size warnings remain in the audit backlog. At that
point no deployment or natural browser-session acceptance had occurred.

### Post-rollout verification

The independent read-only check on 2026-09-08 confirmed:

- Both Found Footy workers, API, and Twitter reported the full `3723ce2`
  release identity; all four application containers had zero restarts.
- All 27 deployed BFF source files and dependency manifests checked matched
  `ca1f8e5`. Running frontend/BFF image IDs matched the release record.
- Public browser HTML served `index-ivFie9qv.js`. Its bytes matched the running
  frontend container; it contained `event_update` and no `event_video` path.
- Public health and fixture REST returned HTTP 200; all returned fixtures
  passed the root presentation-shape check.
- NATS connection `1320` subscribed to `found-footy.prod.>` with zero pending
  bytes. Public SSE delivered `connected`, healthy state, a heartbeat, and
  fresh connection/health messages after closing and reopening the request.

At that check NATS had delivered no messages to the new BFF connection, so
this is deployment and connection evidence, not proof of a natural event
changing React state. Clip changes and no-candidate completion must still be
traced through browser application. No synthetic production events were sent.
The backend release record reports no migration or manual data repairs;
this independent check did not audit database mutation history.

Existing browser tabs must load the new bundle. Keep FF-085/FF-086 validating
until the natural event acceptance passes.

## Live and pinned date intent

The provider stores `dateIntent` separately from `currentDate`:

- route entry and **Today** use `live`;
- selecting today, including with a date arrow, uses `live`;
- selecting any other date uses `pinned`.

Recovery recomputes the active-timezone day only in live mode. A phone that
sleeps across midnight therefore advances to the new day; a deliberately
pinned historical view stays pinned but still revalidates.

The live view renders every playing fixture in the API window, including a
match that kicked off on the previous day. Non-playing fixtures remain scoped
to the selected timezone-local kickoff date. Pinned views scope every fixture
to their selected date.

A shared target uses pinned date behavior but remains separate route intent.
Its programmatic timezone-local date selection preserves `v` and `s`; only a
user date action or restored clean history entry releases the target. Clean
historical entries use `d=YYYY-MM-DD`, while the canonical today route omits
`d`. This lets Back restore the target and Forward restore the exact clean date.

## Remaining re-foundation work

FF-077 fixes the data contract, targeted delivery, request ordering, live
intent, carryover, and recovery path. The broader frontend re-foundation still
owns:

- exposing freshness separately from transport health in the visible UI;
- aborting superseded search requests;
- resolving the next-match-day staging cutoff; and
- the accessible interaction/component migration.

Those items remain in the
[frontend re-foundation plan](./plans/frontend-refoundation.md) and
[project todo](./todo.md).
