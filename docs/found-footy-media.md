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

Stale play promises must not overwrite a newer state. Seeking, a deliberate
pause, a hidden document, and an ended video are never false-playing evidence.

## Confirmed defects

### Buffering is misclassified as frozen playback

The current watchdog accepts `readyState >= HAVE_CURRENT_DATA` as enough proof
that playback should advance. That means only the current frame is available;
future data can still be loading. After four stationary seconds it performs an
automatic pause/play reset, then exposes **Play video** after another interval.
This can interrupt a healthy progressive download and turns normal latency
into an apparent failure.

Require buffered time ahead of `currentTime`, a non-loading network state, and
the absence of a seek before classifying false-playing. Prefer disabling
automatic recovery once native controls have been revealed.

### Native iOS scrubbing may overlap recovery

The application does not implement a seek bar and does not assign
`video.currentTime`. It currently checks `video.seeking`, but WebKit may not
expose the whole finger-down native-control interaction as a seeking interval.
A scrub lasting longer than the watchdog threshold can therefore overlap a
programmatic pause/play reset. This must be reproduced on a physical iPhone.

The app also applies `touch-action: pan-y` to both `body` and `#root`. That
ancestor gesture restriction is a separate hypothesis for a horizontal native
scrubber that visually lags the finger and commits on release. Remove or narrow
the global policy during isolation; media controls must retain browser-default
touch behavior.

### Page lifecycle mutates media outside React

The inline iOS `pagehide` handler pauses every video and clears its `src`.
React still owns the old `src` prop, so a back-forward-cache restore can retain
an empty element. The media component must own suspension and restoration.

### Native volume and React mute state can disagree

Native `volumechange` persists volume but does not update React's `isMuted`.
The custom unmute control can therefore disagree with the actual media state.

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
