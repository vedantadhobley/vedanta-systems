# Found Footy media playback

Current behavior, confirmed defects, and the acceptance contract for Found
Footy clips. This document owns media playback behavior; the general frontend
plan owns component extraction and visual migration.

## Delivery and entry paths

Ordinary clip clicks and shared links converge on the same media element and
same-origin URL:

```text
fixture clip button or shared-link resolution
  -> VideoModal
  -> /api/found-footy/video/<share-id>
  -> vedanta-systems BFF
  -> found-footy read API redirect
  -> Garage ranged object response
```

The BFF forwards `Range`, follows the internal presigned redirect, preserves
`206`, `Content-Range`, `Content-Length`, and `Accept-Ranges`, and streams the
body without nginx buffering. Entry-path differences occur before the modal:
a shared link resolves and navigates to its event first; an ordinary click
already has the clip URL. They must not produce different player behavior.

A 2026-08-23 production sample returned `206`, delivered the first MiB in
0.31–0.35 seconds, and had a 0.11–0.13 second time to first byte. This proves
that sample and route, not every device or clip. Diagnose future reports by
separating delivery timing from player-state classification.

## Expired media and historical share context

Found Footy retains fixture, event, candidate, asset, and share records after
retention reclaims the Garage object. Targeted fixture and event reads can
therefore recover historical context outside the ordinary public date window.
The raw media resource deliberately remains a media resource:

- active or superseded media returns bytes through the redirect and BFF;
- reclaimed or removed media returns `410 Gone`; and
- a never-minted share ID returns `404 Not Found`.

Do not turn `/api/found-footy/video/<share-id>` into an HTML or application
redirect. It is used as `<video src>` and by Open Graph video metadata.

Current portal share URLs contain both `v=<event-id>` and `s=<share-id>`. The
retained event ID is sufficient to request the historical context without a
new share lookup. The current BFF does make those targeted event and fixture
requests, but its `/event/<event-id>` adapter returns only the kickoff date.
React then depends on the ordinary fixture snapshot, which excludes completed
fixtures outside the public window. An old link can therefore navigate to the
right date and still have no fixture to render.

The consumer needs one targeted historical-context path that returns or inserts
the retained fixture and target event independently of the public snapshot.
It must also distinguish unavailable media from a retryable media failure,
keep the fixture/event context open, and display **video no longer available**
instead of a player retry loop.

A new Found Footy context endpoint is not required for current portal links.
The existing `v=<event-id>` identifies the retained event, and the existing
targeted event and fixture reads provide its history. The BFF must preserve
that projection instead of reducing it to a date.

React still needs authoritative media availability before it can distinguish
retention from a retryable player error. The BFF can derive that from the
existing media endpoint without following its `302` redirect and expose a
small frontend projection without changing Found Footy's API:

```json
{
  "share_id": "s_abc123",
  "media_state": "removed",
  "fixture_id": 123,
  "event_id": "00000000-0000-0000-0000-000000000000"
}
```

`media_state` should be `available` or `removed`; active versus superseded is
not a frontend distinction because both play through the stable media URL. A
known removed share returns this representation successfully. An unknown share
returns `404`. The BFF combines this status with the targeted fixture/event
projection before React opens media. A future share-only canonical URL would
require a Found Footy-owned share-to-event lookup, but that is not required for
the current `v` plus `s` contract. The OG server must omit `og:video` for
removed media while retaining historical page metadata.

## Required interaction contract

- Every clip starts muted, inline, and requests autoplay at element
  initialization.
- Native controls start hidden.
- A deliberate touch tap reveals controls on mobile. Actual mouse movement
  reveals them on desktop. Keyboard focus also reveals them.
- The custom unmute control remains available until native mute state changes.
- Once native controls are visible, the browser owns play, pause, and seek.
  Application recovery logic must not mutate playback during that interaction.
- A rejected autoplay request may expose **Play video**.
- A confirmed media error may expose **Retry video**.
- Loading and buffering never expose either action and never trigger an
  automatic pause/play reset.

## State model

Keep these states distinct:

| State | Evidence | UI/action |
|---|---|---|
| initializing | media element mounted; no outcome yet | clean black player |
| playing | `playing` plus advancing `currentTime` | video |
| paused | native deliberate pause | remain paused |
| buffering | `waiting`, no buffered future data, or network still loading | wait; no recovery action |
| autoplay-blocked | newest `play()` promise rejected | **Play video** |
| false-playing | unpaused timeline is stationary despite buffered future data | one startup-only reset |
| media-error | media element exposes an error | **Retry video** |

An authoritative `media_state: removed` is not `media-error`. It renders the
historical context and unavailable message without mounting a retrying player.

Stale play promises must not overwrite a newer state. Seeking, a deliberate
pause, a hidden document, and an ended video are never false-playing evidence.

## Implemented safeguards and remaining verification

### Buffering is not recovery evidence

The previous watchdog accepted `readyState >= HAVE_CURRENT_DATA` as enough
proof that playback should advance. That state only guarantees the current
frame and caused normal progressive-download latency to trigger recovery.

The 2026-08-23 implementation classifies a stationary startup as false-playing
only when at least 0.75 seconds is buffered ahead of `currentTime`, the network
is not loading, the element is not paused or seeking, and no startup progress
has ever been observed. Loading or buffering resets the observation deadline.
The one automatic pause/play reset is startup-only. The watchdog stops when
native controls appear, so it cannot interfere with deliberate playback or a
native seek.

### Native iOS scrubbing requires device verification

The application does not implement a seek bar and does not assign
`video.currentTime`. Explicit `seeking`/`seeked` guards remain, and revealing
native controls disables automatic recovery entirely. This must still be
verified on a physical iPhone.

The former `touch-action: pan-y` declarations on `body` and `#root` were
removed so native media controls receive browser-default touch behavior.
On-device isolation must confirm whether that resolves the scrubber that
visually lagged the finger and committed on release.

### Page lifecycle is browser-owned

The inline iOS `pagehide` handler previously paused every video and cleared its
`src` while React still owned the old prop. It is removed. The browser owns
suspension for a mounted player; React cleanup pauses media when the modal
actually unmounts. Background, foreground, and back-forward restore remain
physical-device acceptance cases.

### Native volume and React mute state stay synchronized

Native `volumechange` now updates React's `isMuted` as well as preserving the
last audible volume. The custom unmute control follows native mute changes.

### Automated development verification

An instrumented headless Firefox pass on 2026-08-24 exercised both a retained
shared link and an ordinary clip-button opening through the development BFF.
In both paths, the video started muted and inline with controls hidden, advanced
about four seconds without a recovery action, and exposed the custom unmute
control. Unmute preserved playback. Actual mouse pointer movement over the
video enabled native controls. A deliberate pause remained paused for five
seconds without watchdog interference, and a programmatic range seek resumed
past the requested timestamp.

This verifies the player state and delivery contract in one desktop engine. A
programmatic range seek does not certify a native scrubber gesture. Desktop
Chrome and both physical iPhone browsers remain required acceptance targets.

## Acceptance matrix

Test both ordinary clicks and shared links with the same clips:

| Platform | Required cases |
|---|---|
| iPhone Safari | autoplay, slow startup, buffering, long and precision scrub, pause, unmute, background/foreground, back-forward restore, seek ranges |
| iPhone Chrome | same cases; Chrome uses WebKit but retains a separate browser lifecycle |
| Desktop Chrome | autoplay, real pointer-move control reveal, buffering, scrub, pause, keyboard focus, range seek |

For each case record media events, `readyState`, `networkState`, buffered range
ahead, `paused`, `seeking`, `currentTime`, recovery trigger, and request status.
Diagnostics must be development-only and must not create a production polling
loop.

## Related records

- [Component UI patterns](../src/components/UI-PATTERNS.md) defines the shared
  interaction rule.
- [Frontend audit](./frontend-audit.md) records the page-lifecycle and input
  findings.
- [Full-project audit](./full-project-audit-2026-08-20.md) records delivery,
  range, autoplay, and stale-state evidence.
- [Todo](./todo.md) tracks implementation and physical-device verification.
