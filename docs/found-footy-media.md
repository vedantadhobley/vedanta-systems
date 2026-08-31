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

Those entry paths also have different disclosure responsibilities while using
the same modal and player:

- a local clip click starts from an already rendered event. It updates the
  shareable `v` and `s` URL but must not resolve a historical target, change
  date intent, reset disclosure, or move the document; and
- a direct, reloaded, or history-restored share has no trustworthy in-memory
  fixture path. It resolves the retained target, selects its date, reconstructs
  the competition/fixture/event disclosure, and then opens the same modal.

A local clip open reflects its shareable `v` and `s` values with native history
replacement while preserving React Router's history metadata. It does not
dispatch a route transition, rerun retained-target resolution, or alter the
document position. Reload, a new tab, and a later Back/Forward restoration do
enter through React Router and therefore use the full shared-link path.

This split is intentional architecture, not a scroll workaround. During a
local overlay session, `v` and `s` are reflected share metadata; React Router's
location remains the source route. Do not reintroduce an in-memory origin
marker, route navigation, delayed scroll restoration, or device-specific
branch for this case. If the product later requires Back to close a locally
opened player, replace this contract with an explicit background-location
modal route rather than partially synchronizing Router with the reflected URL.

The current fix does not make `VideoModal` the reusable site-wide dialog
primitive. The frontend re-foundation must still provide top-layer or portal
ownership, background inertness, scroll locking that preserves the active
shell scroll owner, focus entry and containment, Escape and dismiss behavior,
and focus restoration. URL reflection and routed-entry reconstruction remain
route-adapter responsibilities outside that dialog primitive. See the
[frontend re-foundation plan](./plans/frontend-refoundation.md#3-establish-behavior-primitives).

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
new share lookup. The BFF's `/event/<event-id>` adapter now returns the targeted
fixture and event instead of reducing them to a kickoff date. React stores that
target independently of the ordinary bounded snapshot, so an old link can
render after its fixture leaves the public window.

The target response also distinguishes unavailable media from a retryable
media failure. It keeps fixture/event context open and displays **video no
longer available** without mounting a player retry loop.

The `v=<event-id>` query owns that targeted projection:

- while `v` remains present, reload, reconnect, wake, and snapshot replacement
  retain or reacquire the targeted fixture and event outside the bounded public
  window;
- resolving `v` selects the fixture's timezone-local date, then opens the
  target competition, fixture, and event after the projection commits;
- a user-initiated date action creates a clean history entry without `v` or
  `s`, releases the targeted projection, and resets disclosure for the chosen
  date; and
- browser Back restores the shared URL and reacquires its target. Forward must
  restore the clean date entry, so the selected date belongs in route history
  state or an explicit URL value rather than only transient React state.

When a user presses a date control and it selects the next non-empty date, that
skip is one user-initiated date action and follows the same cleanup. The
programmatic date switch that resolves `v` preserves `v`, `s`, and the targeted
projection even when the target crosses empty dates. Reconnect, ordinary
snapshot replacement, midnight, and timezone recomputation are also not user
date choices and cannot discard a target while `v` remains present. The shared
target overrides normal live-date advancement until the user leaves it.

A new Found Footy context endpoint is not required for current portal links.
The existing `v=<event-id>` identifies the retained event, and the existing
targeted event and fixture reads provide its history. The BFF must preserve
that projection instead of reducing it to a date; the current adapter does.

React receives authoritative media availability before it decides whether to
mount a player. The BFF sends a server-side `GET` to
the existing media endpoint with redirect following disabled. Found Footy's
`302` means available, `410` means removed, and `404` means unknown. Because
the BFF does not follow the `302`, it never requests the Garage bytes during
this probe. It exposes one composite frontend projection without changing
Found Footy's API:

```json
{
  "found": true,
  "eventId": "00000000-0000-0000-0000-000000000000",
  "kickoff": "2026-08-14T16:00:00Z",
  "fixture": { "_id": 123, "events": [] },
  "media": {
    "share_id": "s_abc123",
    "state": "removed"
  }
}
```

`media.state` is `available`, `removed`, or `unknown`; active versus superseded
is not a frontend distinction because both play through the stable media URL.
Found Footy's upstream `404` becomes `unknown` inside a successful composite
response when the event context exists. Event absence remains a BFF `404`, and
upstream failure remains `502`. This preserves valid historical context even
when a supplied share ID is unknown. A future share-only canonical URL would
require a Found Footy-owned share-to-event lookup, but that is not required for
the current `v` plus `s` contract. The OG server uses the same target projection
and omits `og:video` for removed or unknown media while retaining page metadata.

## Required interaction contract

- Every clip starts muted, inline, and requests autoplay at element
  initialization.
- Opening a local clip changes only modal state and its shareable URL. It does
  not change competition, fixture, or event disclosure or document position.
- Local URL reflection is not navigation. Direct entry, reload, and history
  restoration are navigation and must reconstruct retained context.
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

An authoritative `media.state: removed` is not `media-error`. It renders the
historical context and unavailable message without mounting a retrying player.

The same rule applies to `unknown`, with **video not found** as the terminal
copy. Neither state exposes download, unmute, autoplay recovery, or Retry.

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
