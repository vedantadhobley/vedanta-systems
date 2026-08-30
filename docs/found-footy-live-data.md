# Found Footy live-data lifecycle

This document is the as-built browser contract for Found Footy FF-077. Fixture
visibility and navigation policy live in
[timezone-aware fixture scoping](./found-footy-timezone.md). Found Footy's
producer contract is authoritative in its `docs/api.md`.

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
| `event.video` | Fetch `/api/v1/events?ids=<event_id>` | Replace only that event's video projection inside `fixture_id` |
| NATS connect or reconnect | Emit `resync` | Take a complete fixture snapshot |

`fixture.status` replaces the obsolete `fixture.clock` path. A minute change
and a provider status transition that remains in one presentation group use
the inline path. Kickoff, final whistle, postponed resumption, score/event
changes, and other presentation boundaries use targeted `fixture.update`.

The BFF resolves dirty signals once and broadcasts their resulting resource
projection to all connected browsers. It does not turn fixture or video events
into a generic window refresh.

## Browser state and ordering

The provider stores one fixture collection. It does not maintain processing
state buckets. Structural replacements remove the requested IDs, insert the
authoritative responses, deduplicate, and order:

1. playing by `last_activity_at` descending;
2. finished by `last_activity_at` descending;
3. upcoming by kickoff;
4. deferred by kickoff.

Equal recency uses kickoff and fixture ID as deterministic tie breakers.
Inline `fixture.status` updates preserve the exact array order.

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
commit. Live events that arrive during a snapshot are recorded and replayed
after the response commits, so an older REST response cannot overwrite newer
stream state. A failed refresh retains the last valid fixture collection.

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

## Remaining re-foundation work

FF-077 fixes the data contract, targeted delivery, request ordering, live
intent, carryover, and recovery path. The broader frontend re-foundation still
owns:

- mounting the provider only while the Found Footy route is active;
- exposing freshness separately from transport health in the visible UI;
- aborting superseded search and shared-link requests;
- resolving the next-match-day staging cutoff; and
- the accessible interaction/component migration.

Those items remain in the
[frontend re-foundation plan](./plans/frontend-refoundation.md) and
[project todo](./todo.md).
