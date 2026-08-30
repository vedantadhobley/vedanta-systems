# Timezone-Aware Fixture Scoping

How Found Footy determines which fixtures a user can see, how timezone mode
affects that, and where the current implementation differs from the intended
contract. Stream, sleep, reconnect, and midnight behavior lives in
[Found Footy live data](./found-footy-live-data.md).

## Timezone Modes

Users toggle between **Local** (browser timezone) and **UTC**. The toggle lives in the header and persists in component state. All date calculations flow through `TimezoneContext`, which provides:

- `getToday()` — today's `YYYY-MM-DD` in the active mode
- `getDateForTimestamp(iso)` — converts any ISO timestamp to `YYYY-MM-DD` in the active mode

When in UTC mode, a fixture at `2026-02-20T23:00:00Z` falls on `2026-02-20`.  
When in Local mode (e.g. AEDT, UTC+11), the same fixture falls on `2026-02-21`.

This single difference cascades through everything below.

## Intended visibility rule

A user can see:

1. **All finished fixtures in the current API window** — history is not
   removed by the staging-preview cutoff.
2. **All playing fixtures** — derived from match status, not Found Footy's
   monitor bucket. Always visible in the target live view.
3. **Today's upcoming fixtures** — scheduled fixtures whose date, in the
   user's timezone, is today.
4. **One full future day of upcoming fixtures** — the *first* date after today
   (in the user's timezone) that has any fixtures at all. Not necessarily
   tomorrow — if tomorrow has no fixtures but the day after does, that day is
   the one shown.

Found Footy's `staging`, `active`, and `completed` states control processing.
They do not control presentation. Found Footy supplies `presentation_state` as
playing, finished, upcoming, or deferred. The browser uses that field directly
and never interprets provider status codes. This lets a postponed fixture stay
on the fast monitor path without showing it as a live match.

Nothing beyond that single future date is shown. The user cannot navigate to
it and search will not return it.

### Carryover behavior

The FF-077 consumer stores live versus pinned date intent separately. A live
view renders every fixture whose backend `presentation_state` is `playing`,
even when its timezone-local kickoff date is yesterday. It remains visible and
receives targeted updates until Found Footy moves it out of the playing group.
A pinned view remains scoped to its selected date.

### Why One Future Day?

Staging fixtures have no events, no scores, no videos — they're just scheduled kickoffs. Showing too many days of empty schedule adds noise. One future day gives users a preview of what's coming without flooding the UI.

## How It Works: Normal Browsing

### Date index

The browser takes one complete fixture snapshot and derives distinct dates with
`getDateForTimestamp()`. The same timezone implementation therefore owns both
the navigation index and final rendering; a fixed current offset cannot diverge
from historical daylight-saving rules. The older BFF `/dates` adapter remains
available but the FF-077 provider no longer calls it.

### Client: `navigableDates`

In `FootyStreamContext.tsx`, the mode-bucketed date list is filtered against
the user's timezone-aware `today`:

```
All dates where date ≤ today  →  navigable (past + today)
First date where date > today  →  navigable (next future day)
Everything else                →  hidden
```

The date arrows in the nav bar only cycle through `navigableDates`. Dates
beyond the cutoff are unreachable.

### Client fixture snapshot

Initial load and every recovery transition fetch one complete
`/api/found-footy/fixtures` snapshot. Date navigation filters that collection
with `getDateForTimestamp()`. This removes the previous three-request upstream
amplification and naturally covers timezone edges.

## How It Works: Search

### BFF: `/search?q=<query>` endpoint

The BFF proxies the Found Footy Go search endpoint, which matches competition,
team, scorer, and assist names. It reshapes the flat fixture results for the
legacy frontend, derives highlight metadata, and groups results by **UTC date**.
The BFF does not apply the user's navigation cutoff.

### Client: `filteredSearchResults`

Search results are re-processed client-side through the same scoping rule:

1. Each fixture's date is converted to the user's timezone via `getDateForTimestamp`.
2. The cutoff date is computed from the newest date in `navigableDates` (the
   same list used for normal navigation).
3. **Finished, playing, and deferred fixtures** pass through unconditionally.
4. **Upcoming fixtures** (`presentation_state == upcoming`) are dropped if their
   timezone-local date exceeds the cutoff.
5. Surviving fixtures are regrouped by their **timezone-local date** (not the server's UTC grouping).

Search and normal browsing enforce the same staging cutoff. Both use the
backend presentation state rather than provider status codes.

## Timezone Edge Cases

### Fixture straddles midnight

A fixture at `2026-02-20T22:00:00Z`:
- **UTC user** sees it on Feb 20
- **AEDT user** (UTC+11) sees it on Feb 21

If Feb 21 is the "next future date" for the AEDT user, they see it. If Feb 21 is two days out and Feb 20 was the cutoff, they don't — even though a UTC user on that same date would.

### Timezone toggle changes visible fixtures

Toggling from Local to UTC (or vice versa) can shift which date a fixture belongs to and whether it falls within the cutoff. This is intentional — each mode shows an internally consistent view.

### `availableDates` follow the selected mode

The client re-derives `availableDates` from its complete fixture collection
when Local/UTC mode changes. It compares those dates with `getToday()` from the
same mode and uses the same `getDateForTimestamp()` conversion for rendering.

## File Map

| File | Role |
|------|------|
| `src/contexts/timezone-context.tsx` | `getToday()`, `getDateForTimestamp()`, timezone toggle state |
| `src/contexts/FootyStreamContext.tsx` | Owns complete snapshots, recovery, live/pinned intent, targeted updates, navigation, and search state |
| `src/components/found-footy-browser.tsx` | Applies the search cutoff and renders navigation |
| `src/lib/found-footy-presentation.ts` | Orders backend-owned presentation groups and recency |
| `src/lib/found-footy-live.ts` | Applies targeted status, fixture, and event replacements |
| `src/server/routes/found-footy.ts` | Full snapshot, targeted NATS resolution, SSE, search, and media adapter |
