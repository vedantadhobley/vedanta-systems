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

1. **All completed fixtures** — every fixture in `fixtures_completed` (up to 90 days of dates from the server). No timezone filtering; history is always fully visible.
2. **All active fixtures** — any fixture currently in `fixtures_active` (in-play right now). Always visible.
3. **Today's staging fixtures** — upcoming fixtures whose date, in the user's timezone, is today.
4. **One full future day of staging fixtures** — the *first* date after today (in the user's timezone) that has any fixtures at all. Not necessarily tomorrow — if tomorrow has no fixtures but the day after does, that day is the one shown.

Nothing beyond that single future date is shown. The user cannot navigate to it and search will not return it.

### Why One Future Day?

Staging fixtures have no events, no scores, no videos — they're just scheduled kickoffs. Showing too many days of empty schedule adds noise. One future day gives users a preview of what's coming without flooding the UI.

## How It Works: Normal Browsing

### Server: `/dates` endpoint

Returns distinct `YYYY-MM-DD` dates (extracted from `fixture.date` in UTC) across all three collections: `fixtures_completed`, `fixtures_active`, `fixtures_staging`. These are **UTC dates** — the server has no concept of user timezone.

### Client: `availableDatesInMode`

In `found-footy-browser.tsx`, the raw UTC date list is filtered against the user's timezone-aware `today`:

```
All dates where date ≤ today  →  navigable (past + today)
First date where date > today  →  navigable (next future day)
Everything else                →  hidden
```

The date arrows in the nav bar only cycle through `availableDatesInMode`. Dates beyond the cutoff are unreachable.

### Client: fixture fetching

When the user navigates to a date, the context fetches `/fixtures?date=YYYY-MM-DD` for that date *plus its adjacent UTC dates*. This ensures timezone edge cases are covered (e.g. a fixture at 23:00 UTC on Feb 19 is Feb 20 in AEDT). Fixtures are then filtered client-side by `getDateForTimestamp` to show only those belonging to the selected timezone-local date.

## How It Works: Search

### Server: `/search?q=<query>` endpoint

Searches all three collections in parallel:
- `fixtures_completed` — matches team names, player names, assist names (limit 100)
- `fixtures_active` — same filter (limit 50)
- `fixtures_staging` — matches team names only, no events to search (limit 50)

Results are deduped, sorted by date descending, and grouped by **UTC date**. The server returns everything it finds with no timezone awareness.

### Client: `filteredSearchResults`

Search results are re-processed client-side through the same scoping rule:

1. Each fixture's date is converted to the user's timezone via `getDateForTimestamp`.
2. The cutoff date is computed — the newest date in `availableDatesInMode` (same list used for normal navigation).
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

### `availableDates` are UTC but the cutoff is timezone-local

The `/dates` endpoint returns UTC dates. The client compares these against `getToday()` (timezone-aware). This works because date strings are `YYYY-MM-DD` and the comparison is lexicographic — a UTC date of `2026-02-21` compared against a local `today` of `2026-02-21` correctly identifies it as today, even though the underlying moments differ.

The one subtlety: the available dates list reflects UTC boundaries, so a fixture that lands on a *different* local date than its UTC date might cause its local date to be absent from `availableDates`. This doesn't matter for the cutoff calculation (which only needs to know the max navigable date), but it's why fixture fetching requests adjacent UTC dates and filters locally.

## File Map

| File | Role |
|------|------|
| `src/contexts/timezone-context.tsx` | `getToday()`, `getDateForTimestamp()`, timezone toggle state |
| `src/contexts/FootyStreamContext.tsx` | Fetches `/dates`, manages `availableDates`, search state |
| `src/components/found-footy-browser.tsx` | `availableDatesInMode` (navigation cutoff), `filteredSearchResults` (search cutoff) |
| `src/server/routes/found-footy.ts` | `/dates`, `/search`, `/fixtures` endpoints — all UTC, no timezone logic |
