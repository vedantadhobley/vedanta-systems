# Frontend shell and layout stability

Status: active. The neutral production shell extraction, shared geometry
tokens, and opt-in viewport diagnostics are staged on the exploration branch.
The contained scroll profile and shared layout transaction have not landed.

This plan defines the behavior beneath the current visual language. It does
not select a new navigation hierarchy, font, icon set, color system, or
two-plane optical treatment. The current interface remains the visible
baseline while the shell is replaced in testable vertical slices.

The [frontend re-foundation plan](./frontend-refoundation.md) owns the wider
migration. This document owns viewport geometry, scroll ownership, safe areas,
fixed application chrome, and stability during structural content changes.

## Why this is a shared system

Found Footy exposed the problem first because fixtures expand, collapse, and
change asynchronously. The same geometry changes occur when:

- a date, search, filter, or route replaces a result region;
- a reconnect snapshot differs from retained data;
- a dialog opens or closes;
- a project changes from loading to data, empty, or error state; and
- browser chrome, the keyboard, rotation, or safe areas change the viewport.

Route-local spacers and root CSS exceptions cannot enforce these behaviors
consistently. Applications declare stable and dynamic regions. The shell owns
the viewport and scroll contract. A shared layout transaction owns structural
handoffs.

## Required invariants

1. Exactly one element owns vertical page scrolling in a shell profile.
2. A project route cannot modify `html`, `body`, or the global scroll owner.
3. The shell applies each safe-area inset once. Project content consumes
   shell tokens and does not repeat `env(safe-area-inset-*)` calculations.
4. Bottom navigation occupies known layout space. Content is never hidden
   beneath it accidentally.
5. Mouse wheel, trackpad, touch, scrollbar drag, keyboard scrolling, browser
   zoom, text selection, browser history restoration, and native media
   gestures remain browser-owned.
6. A structural transition preserves one declared viewport anchor. It does
   not attempt to preserve every element when the underlying content changes.
7. Temporary retained height belongs to the dynamic region that lost it. It
   cannot become a route-lifetime document high-water mark.
8. Application state commits immediately. Layout correction happens before
   paint and never waits for decorative animation.
9. A stale asynchronous response cannot complete a newer layout transaction.
10. Reduced motion changes decoration, not geometry or continuity.

## Shell profiles

The shell selects one profile for the browsing environment. Individual routes
do not choose or change it.

### Touch browser profile

Ordinary iPhone and tablet browser tabs keep document scrolling. Mobile
WebKit connects document scroll to dynamic browser bars, history restoration,
the visual viewport, and keyboard behavior. A fixed application bottom bar
reserves its complete occlusion in document content.

The root scrollbar is browser-owned in this profile. An overlay scrollbar can
pass behind fixed application chrome because it belongs to the viewport. Do
not replace it with a simulated scrollbar.

### Contained application profile

Desktop browsers and installed standalone web apps use a viewport-height grid:

```text
application shell
├── optional fixed header region
├── main scroll surface: minmax(0, 1fr), overflow: auto
└── bottom navigation plus bottom safe-area filler
```

The bottom navigation participates in layout instead of covering the main
scroll surface. The main scrollbar therefore ends above the navigation.
`100dvh` is the preferred height after a `100vh` fallback. The standalone
profile must still pass physical iPhone keyboard, rotation, resume, and
history tests before it replaces document scrolling there.

Profile selection uses installed display mode and stable environment
capabilities. Component interaction must still follow the active pointer type;
the shell profile is not permission to classify every wide screen as mouse or
every narrow screen as touch.

## Safe-area and bottom-navigation ownership

`AppShell` exposes logical geometry tokens:

```text
--shell-safe-top
--shell-safe-right
--shell-safe-bottom
--shell-safe-left
--shell-nav-row-size
--shell-bottom-occlusion
```

The outer shell reads `env(safe-area-inset-*)`. The navigation row owns its
interactive height. A separate filler owns the bottom unsafe region. Borders,
backgrounds, and hit targets may distinguish those two pieces visually, but
neither route content nor an individual navigation control recalculates them.

Do not subtract an assumed Safari or Chrome toolbar height. In browser mode,
the user agent owns its chrome. In standalone mode, the remaining inset
primarily protects the home indicator. A large first-launch area must be
measured before it is changed.

## Development viewport diagnostics

Add an opt-in diagnostic surface before changing standalone geometry. It must
report without collecting or transmitting data:

- selected shell profile and detected display mode;
- `window.innerHeight` and `documentElement.clientHeight`;
- `visualViewport.height`, offset, and scale when available;
- resolved top and bottom safe-area proxy values;
- active scroll owner, `scrollHeight`, `clientHeight`, and `scrollTop`;
- current bottom-navigation row, filler, and total occlusion sizes; and
- resize, orientation, visibility, `pageshow`, and virtual-keyboard-related
  viewport changes.

Gate it behind a development-only flag or explicit query parameter. Do not
leave a production timer or logging loop behind.

## Stable and dynamic regions

A project composition identifies:

- a **stable region**, whose size and screen position are not changed by the
  current operation; and
- a **dynamic region**, whose children may be replaced or resized.

In Found Footy, the project status, advisory, and date controls form the stable
region. Fixture groups below the date controls form the dynamic region. An
expanded competition header can also become the semantic anchor when it is
visible in both the outgoing and incoming data.

Keeping an element in React does not by itself keep it visually stable. If a
shorter document can no longer support the current scroll offset, the browser
clamps that offset and moves otherwise unchanged elements. The layout
transaction must preserve sufficient local extent before the commit reaches
paint.

## Layout-stability transaction

Every announced structural operation follows one transaction:

1. Capture the current scroll owner, scroll position, stable boundary, chosen
   semantic anchor, and dynamic-region block size before state changes.
2. Associate the transaction with the route intent that owns the pending
   result: date, timezone, query, filter, or disclosure key.
3. Commit application state and incoming content.
4. In a layout effect, measure the same anchor and the new dynamic region.
5. Correct the scroll position by the anchor delta before paint.
6. If the new region is shorter, retain the exact missing extent inside that
   region so the browser cannot clamp the intended position.
7. Keep retained extent stable while it intersects the viewport. Release it
   atomically after it is completely outside the viewport, or replace it as
   part of a later announced transaction.
8. Ignore completion from any request or transition identity that no longer
   owns current route intent.

The correction is not a visual animation. The current container plane snaps
to its committed geometry. Future phosphor or step-transition effects may
respond afterward without owning layout.

### Anchor selection

Use the most specific surviving anchor:

1. the active or focused control when preserving it is valid;
2. a semantic item present in both views, such as a competition ID;
3. the stable dynamic-region boundary; or
4. the scroll position plus retained local extent when no semantic element
   survives.

No algorithm can keep every coordinate fixed when arbitrary content is
removed. The transaction guarantees its declared anchor and keeps stable
chrome from moving as a side effect.

## Disclosure persistence

Disclosure state is current-view state keyed by semantic identity. It is not
an unbounded memory of everything the user previously opened.

For a Found Footy date transition:

- MLS open on day 1 and present on day 2: keep MLS open on day 2.
- MLS open on day 1 and absent on day 2: clear that disclosure identity.
- MLS then present on day 3: show it closed.
- A different competition occupying the same list index never inherits the
  old state.

The competition key is reconciled after the new date snapshot commits. Nested
fixture and event disclosure state clears when the canonical selected date
changes; those details belong to the outgoing date. Skipping an empty date,
manual navigation, live midnight rollover, and timezone-driven date changes
all use this same rule.

Automatic opening is explicit, not a general post-navigation heuristic:

- a final remains open because its presentation policy is locked open; and
- a shared-link navigation opens its target competition, fixture, and event
  after the target date resolves.

No other competition or fixture opens merely because it is first, live, or the
only item on the new date unless a later product decision adds that behavior.

This is **survival persistence**: state survives only while the keyed entity
exists across consecutive committed views. Back/forward navigation may restore
a prior view from explicit history state, but that is a separate contract and
must not rely on hidden route memory.

The one-open-at-a-time Found Footy policy remains until a product requirement
changes it.

## Shared source-owned primitives

Names remain provisional until the first slice proves them:

- `AppShell` owns profile selection, safe areas, and application chrome.
- `ScrollSurface` exposes the active scroll element and scrolling operations.
- `StableRegion` marks controls that must not move during a child transition.
- `DynamicRegion` owns local retained extent and transition identity.
- `useLayoutTransaction` captures, reconciles, and settles announced changes.
- `DisclosureGroup` reconciles semantic disclosure keys across data commits.

These are behavior primitives. They do not import phosphor renderers, project
types, fixture status logic, or a specific icon library.

## Implementation sequence

### 1. Protect and instrument current behavior

- [x] Keep the deployed desktop wheel restoration.
- Add browser tests for wheel, trackpad-equivalent wheel deltas, scrollbar and
  keyboard scrolling, short routes, disclosure collapse, and date replacement.
- [x] Add the opt-in viewport diagnostic surface.
- Record physical iPhone browser and standalone measurements.

### 2. Introduce the neutral shell

- [x] Extract the current header and bottom navigation into `AppShell` without a
  visual redesign.
- [x] Centralize safe-area and bottom-occlusion tokens.
- Implement the contained profile behind an explicit development switch.
- Verify that its scrollbar ends above the navigation and that short routes do
  not acquire false overflow.
- Enable the contained profile per environment only after its acceptance
  matrix passes.

### 3. Replace the Found Footy scroll prototype

- Introduce `DynamicRegion` and the layout transaction around the fixture
  surface.
- Move expand, collapse, date replacement, search replacement, and reconnect
  snapshots through announced transactions.
- Implement survival persistence by competition ID.
- Delete `useTransientScrollSpace` after equivalent and additional tests pass.

### 4. Migrate other structural changes

- Adopt the shell in Spin Cycle, Long Exposure, btop, landing, and remaining
  routes.
- Route-scope code and live providers while each surface moves.
- Remove root-level and route-local scroll, viewport, and safe-area rules.

### 5. Resume visual component development

- Apply the existing visual language to proven shell and behavior primitives.
- Keep layout state immediate and optical response non-blocking.
- Revisit navigation appearance only after runtime geometry is stable.

## Acceptance matrix

### Desktop Chrome

- wheel and trackpad-style scrolling work in both directions;
- scrollbar drag, Page Up/Down, Home/End, Space, and focus scrolling work;
- the contained scrollbar ends above bottom navigation;
- landing and other short routes have no false vertical overflow;
- expand, collapse, and date changes preserve the declared anchor; and
- resize never leaves two scroll owners or a trapped scroll surface.

### Physical iPhone Safari and Chrome tabs

- ordinary document scrolling can minimize browser chrome;
- safe areas update without a doubled bottom reservation;
- keyboard open and close does not trigger restoration fights;
- rotation, sleep/resume, and back-forward restoration remain usable;
- disclosure and date changes do not clamp or reverse scrolling; and
- native media scrubbing remains browser-owned.

### Physical iPhone standalone

- the header clears the status region and Dynamic Island;
- the navigation clears the home indicator without simulating browser chrome;
- first launch, later launch, rotation, keyboard, and resume settle to the same
  geometry;
- the contained scroll surface remains touch-scrollable and restores history;
- its overlay scrollbar does not pass through application navigation; and
- all project routes remain reachable without browser UI.

## Explicit non-goals

- A visual shell or navigation redesign.
- A device-model or user-agent table.
- A custom simulated scrollbar.
- A body-level height maximum retained across route states.
- Keeping a disclosure open after its semantic entity disappears.
- Combining this work with a React, Vite, router, Tailwind, or shadcn migration.
