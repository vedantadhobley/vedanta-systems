# Found Footy live-data lifecycle

This document describes how Found Footy data reaches the browser today, where
the current lifecycle loses correctness, and the contract the frontend
re-foundation must implement. Fixture bucketing and staging visibility remain
in [timezone-aware fixture scoping](./found-footy-timezone.md).

## System path

```text
found-footy workers
  -> Core NATS found-footy.<env>.* events
  -> vedanta-systems BFF
  -> browser SSE notification
  -> authoritative Found Footy REST snapshot
  -> React route state
```

The Go read API is authoritative. NATS and browser SSE are transient
notifications. Neither stream is a database or a replay log.

## Current BFF mapping

The BFF subscribes to `found-footy.<env>.>` and maps events as follows:

| NATS event suffix | Browser SSE | Browser behavior |
|---|---|---|
| `fixture.update` | coalesced `refresh` | Fetch an authoritative fixture snapshot |
| `event.video` | coalesced `refresh` | Fetch an authoritative fixture snapshot |
| `fixture.clock` | `clock` | Patch displayed live minutes until the next snapshot |
| NATS reconnect | `refresh` with resync reason | Fetch an authoritative snapshot if the browser is connected |

Fixture and video refreshes share a roughly 250 ms coalescing window. Clock
events are deliberately ephemeral display ticks.

The BFF preserves Found Footy's `staging`, `active`, and `completed` process
states in fixture snapshots. The browser independently derives playing,
finished, upcoming, and deferred presentation states from provider status.
The process `active` bucket therefore does not imply a live badge: a monitored
postponed fixture can remain active while rendering after real matches.

When an actively monitored fixture first enters a terminal status, Found Footy
keeps it in `active` for a one-hour observation grace while late provider events
settle. Fresh terminal ingests retain their direct-complete path. The frontend
renders `FT`, `AET`, `PEN`, `AWD`, and `WO` as finished regardless of that
process bucket. Its recency key uses the producer's first terminal observation,
not the later `active` to `completed` transition, so retirement does not reorder
an already-finished fixture. Historical and direct-complete rows without a
terminal-observation timestamp fall back to their completion timestamp.

A new browser SSE connection receives `connected`, one upstream `health`
payload, and periodic `heartbeat` messages. It does not receive a replay or an
initial fixture snapshot. The current BFF does not emit SSE event IDs.

## Current browser lifecycle

On initial provider mount, the browser:

1. selects `getToday()` in the active timezone mode;
2. fetches the available-date index;
3. fetches the selected UTC day and both adjacent UTC days;
4. merges those results and buckets fixtures in the browser timezone;
5. opens SSE only when the selected date equals `getToday()`.

While connected:

- `refresh` triggers the same three-date snapshot;
- `clock` patches fixtures in the active process bucket directly;
- `heartbeat` has no data effect;
- `health` is currently ignored by the provider;
- an EventSource error closes and retries with exponential backoff.

When the document becomes hidden, the provider closes SSE. When it becomes
visible, it refetches and reconnects only if the selected date still equals
the newly computed `getToday()`. Opening a video also pauses SSE; closing it
reconnects without first fetching a snapshot.

## Current correctness gaps

### A reconnect is not reconciliation

SSE and Core NATS provide no browser replay cursor. Any update produced while
the browser is asleep, offline, hidden, watching a video, or between stream
connections can be missed. Reopening EventSource only restores future
notifications.

### Selected date does not represent live intent

The provider infers “follow live” from `selectedDate === getToday()`. At
midnight, yesterday no longer equals today. A phone that was following live
before sleep therefore looks indistinguishable from a user who deliberately
pinned yesterday.

### Carryover fixtures are filtered by kickoff date

The browser filters playing fixtures to the selected timezone-local kickoff
date. A match that began yesterday and remains active after midnight is hidden
from the new live day. If yesterday stays selected, SSE is disconnected
because yesterday is no longer today, so the match also freezes.

### Freshness and connectivity share one status

The current provider can mark the backend online when EventSource opens or
after parsing a response body without checking the HTTP status. Transport
connectivity does not prove that the upstream API is healthy or that the
snapshot is current.

### Snapshots duplicate upstream work

The browser fetches three date endpoints. Each BFF endpoint reads the complete
Go API fixture window and filters one UTC date locally. One logical browser
snapshot therefore performs three full upstream-window reads.

## Target state model

Route state must keep these concepts separate:

```text
selectedDate: YYYY-MM-DD
dateIntent: live | pinned
snapshot: loading | current | stale | failed
stream: closed | connecting | open | retrying
upstream: unknown | healthy | degraded | unavailable
lastValidSnapshot: fixture data retained across transient failures
```

`dateIntent` changes only through explicit navigation semantics:

- entering the route without a pinned-date URL follows live;
- selecting a historical/future date pins it;
- selecting the explicit live/today action follows live again;
- timezone changes preserve intent, then recompute the corresponding date.

## Target reconciliation contract

Every transition from a possibly disconnected state follows one sequence:

1. mark the current snapshot stale without deleting it;
2. cancel obsolete requests;
3. refresh the date index when the calendar or timezone may have changed;
4. if intent is live, compute the new today; otherwise retain the pinned date;
5. fetch and validate an authoritative snapshot;
6. commit it only if its route/date/timezone generation is still current;
7. open or retain SSE when live updates are required;
8. declare the snapshot current only after reconciliation succeeds.

Apply this sequence on:

- initial route entry;
- EventSource reconnect;
- `visibilitychange` to visible;
- `pageshow`, including back-forward-cache restore;
- browser `online`;
- video or other deliberate stream resume;
- active-timezone midnight;
- timezone-mode change.

An SSE notification arriving during the snapshot either queues one later
refresh or is covered by a version check. It must not allow an older response
to overwrite newer state.

## Live and pinned date behavior

### Live mode

The live view renders:

- every playing fixture in the API window, including a previous-day carryover;
- staging and completed fixtures belonging to the selected live date;
- the current active-timezone date in navigation.

At midnight, it advances once to the new date and reconciles. Carryover
fixtures remain visible until provider status leaves the playing presentation
state.

### Pinned mode

Pinned mode retains its selected date across midnight, sleep, and reconnect.
It still refreshes after a disconnected interval. Whether it maintains a
continuous SSE connection is an implementation choice; correctness does not
depend on doing so because every resume reconciles REST.

## Error behavior

- Check `res.ok` before parsing a response as project data.
- Validate the decoded body before committing it.
- Preserve the last valid snapshot when refresh fails.
- Show stale/degraded state instead of successful empty data.
- Distinguish event-not-found from upstream-unavailable.
- Abort superseded date, timezone, query, and shared-link requests.
- Treat direct `clock` patches as disposable; the next snapshot replaces them.

## Acceptance scenarios

The route contract is not complete until all of these pass:

1. A phone follows live, sleeps before midnight, and wakes after midnight. The
   route advances without a page reload and retains any active carryover game.
2. A phone sleeps on a deliberately pinned date. The date remains selected and
   its data is revalidated.
3. A foreground tab crosses midnight. Live mode advances once; pinned mode does
   not.
4. A match starts before midnight and ends after midnight. It remains live and
   receives clock/event updates in the new live view.
5. SSE disconnects during a fixture or video update. Reconnect reconciles the
   snapshot before declaring it current.
6. Closing a video reconciles changes produced while its stream was paused.
7. Rapid date, timezone, search, and shared-link changes cannot display an
   older response.
8. An upstream 500 retains prior data and shows degraded/stale state rather
   than an empty successful view.
9. Network recovery, `pageshow`, and ordinary visibility recovery use the same
   idempotent path.
10. Hidden non-Found-Footy routes own no Found Footy request or stream.
