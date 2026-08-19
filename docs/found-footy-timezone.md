# Timezone-Aware Fixture Scoping

How Found Footy determines which fixtures a user can see, and how timezone mode affects that.

## Timezone Modes

Users toggle between **Local** (browser timezone) and **UTC**. The toggle lives in the header and persists in component state. All date calculations flow through `TimezoneContext`, which provides:

- `getToday()` — today's `YYYY-MM-DD` in the active mode
- `getDateForTimestamp(iso)` — converts any ISO timestamp to `YYYY-MM-DD` in the active mode

When in UTC mode, a fixture at `2026-02-20T23:00:00Z` falls on `2026-02-20`.  
When in Local mode (e.g. AEDT, UTC+11), the same fixture falls on `2026-02-21`.

This single difference cascades through everything below.

## The Visibility Rule

A user can see:

1. **All completed fixtures in the current API window** — history is not
   removed by the staging-preview cutoff.
2. **All active fixtures** — any fixture currently in `fixtures_active` (in-play right now). Always visible.
3. **Today's staging fixtures** — upcoming fixtures whose date, in the user's timezone, is today.
4. **One full future day of staging fixtures** — the *first* date after today (in the user's timezone) that has any fixtures at all. Not necessarily tomorrow — if tomorrow has no fixtures but the day after does, that day is the one shown.

Nothing beyond that single future date is shown. The user cannot navigate to it and search will not return it.

### Why One Future Day?

Staging fixtures have no events, no scores, no videos — they're just scheduled kickoffs. Showing too many days of empty schedule adds noise. One future day gives users a preview of what's coming without flooding the UI.

## How It Works: Normal Browsing

### BFF: `/dates?tz=<minutes-east-of-UTC>` endpoint

The client sends `0` in UTC mode or the browser's current UTC offset in local
mode. The BFF reads the current Found Footy fixture window from the Go API,
shifts each kickoff by that offset, and returns distinct `YYYY-MM-DD` values.
The returned date index is therefore bucketed for the requested mode rather
than always being UTC.

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

### Client: fixture fetching

When the user navigates to a date, the context fetches `/fixtures?date=YYYY-MM-DD` for that date *plus its adjacent UTC dates*. This ensures timezone edge cases are covered (e.g. a fixture at 23:00 UTC on Feb 19 is Feb 20 in AEDT). Fixtures are then filtered client-side by `getDateForTimestamp` to show only those belonging to the selected timezone-local date.

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
3. **Completed/active fixtures** (status ≠ `NS`) pass through unconditionally.
4. **Staging fixtures** (status = `NS`) are dropped if their timezone-local date exceeds the cutoff.
5. Surviving fixtures are regrouped by their **timezone-local date** (not the server's UTC grouping).

This means search and normal browsing enforce the exact same boundary. A staging fixture that's invisible in date navigation is also invisible in search.

## Timezone Edge Cases

### Fixture straddles midnight

A fixture at `2026-02-20T22:00:00Z`:
- **UTC user** sees it on Feb 20
- **AEDT user** (UTC+11) sees it on Feb 21

If Feb 21 is the "next future date" for the AEDT user, they see it. If Feb 21 is two days out and Feb 20 was the cutoff, they don't — even though a UTC user on that same date would.

### Timezone toggle changes visible fixtures

Toggling from Local to UTC (or vice versa) can shift which date a fixture belongs to and whether it falls within the cutoff. This is intentional — each mode shows an internally consistent view.

### `availableDates` follow the selected mode

The client refetches `/dates` when the user switches Local/UTC mode. It compares
those mode-bucketed `YYYY-MM-DD` strings with `getToday()` in the same mode.
Fixture requests still fetch the selected date plus its adjacent UTC dates,
then use `getDateForTimestamp()` for final client-side bucketing.

The local-mode date index currently uses one numeric offset captured at request
time, not an IANA timezone evaluated at each kickoff. Historical fixtures on
the other side of a daylight-saving transition can differ by one hour from the
browser's final bucketing. This is tracked in the todo list.

## File Map

| File | Role |
|------|------|
| `src/contexts/timezone-context.tsx` | `getToday()`, `getDateForTimestamp()`, timezone toggle state |
| `src/contexts/FootyStreamContext.tsx` | Fetches `/dates`, derives `navigableDates`, manages route data and search state |
| `src/components/found-footy-browser.tsx` | Applies the `filteredSearchResults` staging cutoff and renders navigation |
| `src/server/routes/found-footy.ts` | `/dates` fixed-offset bucketing; `/search` UTC grouping; `/fixtures` UTC date filter |
