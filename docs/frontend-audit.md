# Frontend audit — 2026-08-19

This audit covers the production React frontend, its live-data lifecycle, input
behavior, responsive layout, accessibility, and animation cost. It does not
audit the Express routes, upstream project APIs, or infrastructure security.

The review combined source inspection with automated Chromium runs across all
seven public routes at 1440×900 and 390×844. The video interaction was also
tested in Chromium and iPhone-sized WebKit against the exact production clip.
Those WebKit runs emulate iPhone Safari and Chrome input conditions; they are
not physical-device certification.

The later [full-project audit](./full-project-audit-2026-08-20.md) expands this
scope and corrects the hover-variant claim below. This document remains the
dated evidence from its original focused pass.

## Confirmed strengths

- All audited routes stayed within the viewport at desktop and mobile widths.
- Found Footy and Spin Cycle already revalidate data when a hidden page becomes
  visible. The contribution graph and btop streams also have visibility-aware
  recovery paths.
- The video modal now distinguishes active input: real mouse movement,
  deliberate touch, and keyboard focus each reveal native controls without
  weakening muted autoplay recovery.
- Interactive fixture and disclosure rows use semantic buttons in most of the
  current UI. The instrument prototype has explicit focus and reduced-motion
  treatment.
- The current layout is operationally dense without requiring a separate
  reduced mobile information architecture.

## Priority findings

### P0 — Found Footy can remain on yesterday after resume

`FootyStreamProvider` disconnects while hidden and revalidates on visibility
only when `currentDate === getToday()`. If the page was following today before
midnight, that same date is yesterday when the phone wakes. The handler then
does nothing: it neither advances to the new live date nor refreshes the old
one. The same missing clock boundary affects an open foreground tab.

Track whether the user was following the live day separately from the literal
date. On `visibilitychange`, `pageshow`, and a scheduled local/UTC midnight
boundary:

1. refresh the available-date index;
2. advance to the new today only if the view was following the live day;
3. preserve an intentionally selected historical date, but revalidate it after
   a long suspension;
4. reconnect SSE only for the resulting live date.

This is data revalidation, not a page reload.

### P0 — SSE reconnection does not prove that state is current

Found Footy correctly treats NATS messages as refetch hints while connected,
but the browser stream has no replay contract. A transient EventSource failure
reopens the stream without fetching a snapshot. Opening a video deliberately
closes the stream, and closing the video reconnects it without first fetching
the state that may have changed during playback. Visibility recovery does
refetch, but only after the live-day check described above.

An open SSE connection proves only that future hints can arrive. It does not
prove that the browser received every hint during the disconnected interval.
Every transition from possibly disconnected to live must reconcile through
REST, then use SSE for later notifications. Keep direct clock patches
ephemeral and replaceable by the next snapshot.

### P1 — Every route starts every live project provider

`App` mounts Found Footy and Spin Cycle providers above the router. Opening the
home page, About, Long Exposure, or btop therefore starts fixture requests,
transcript requests, and SSE connections for projects the user is not viewing.
This wastes mobile radio, battery, memory, and API work, and makes lifecycle
reasoning harder.

Mount each data provider at its owning route. Keep only truly shared state,
such as timezone mode, above the router.

### P1 — The global input contract is only partially applied

Tailwind already enables `hoverOnlyWhenSupported`, so generated `hover:` and
`group-hover:` variants are globally gated by `(hover: hover) and (pointer:
fine)`. The original claim that 55 variants were unscoped was incorrect. The
remaining issue is duplicated manual mouse/touch suppression state in the
directory and resume views while `src/lib/use-touch-handlers.ts` is unused.

The component system should expose one interaction contract:

- CSS capability queries for visual hover;
- `:active` for immediate press feedback;
- `:focus-visible` with equal semantic access;
- `PointerEvent.pointerType` only when behavior, not styling, differs;
- no viewport-width or user-agent classification of input hardware.

Delete the duplicated React hover state as components migrate. Do not perform
a blind global replacement: hybrid devices and dense instrument controls need
component-level verification.

### P1 — Current accessibility failures are structural

Automated WCAG 2 A/AA checks found the same failures at desktop and mobile
widths:

- the viewport meta tag disables pinch zoom with `user-scalable=no` and
  `maximum-scale=1`;
- the breadcrumb `<ol>` has wrapper `<div>` children, so its `<li>` elements
  are no longer direct list children;
- breadcrumb anchors have click handlers but no `href`, so they are not normal
  keyboard links;
- the GitHub contribution-grid link has no accessible name;
- Found Footy's “currently today” generic span has an `aria-label` that its
  role does not permit;
- PDF.js generates unnamed annotation links on the About page.

The README and video overlays close with Escape, but neither is a complete
modal: they lack dialog semantics, focus entry, focus containment, and focus
restoration. Native controls hidden before pointer input also required the
keyboard-focus path now added to the video.

Establish a clean accessibility baseline before restyling these controls. The
new visual system should inherit correct semantics rather than recreate them.

### P1 — Long Exposure's timeline is mouse-only and its comment is false

`DayTimelineStrip` says a mark can be clicked to scroll to its scorer group, but
the SVG groups implement only `onMouseEnter` and `onMouseLeave`. There is no
click, touch, focus, or keyboard action. On touch, the readout is unavailable.
The time conversion also hardcodes EDT at UTC−4, which is wrong during EST.

Choose the timeline's real action, then implement it through an accessible
button/list representation paired with the SVG. Use `Intl` with
`America/New_York` for exchange time.

### P1 — The contribution animation spends work continuously

The graph is mounted on every route. While visible, it forces a React render at
15 fps for decay and another at 60 fps during each wave; the wave also updates
the reveal-time map repeatedly inside its cell loop. It does not honor
`prefers-reduced-motion`. This is a likely source of avoidable mobile battery
and scroll cost even when it appears visually smooth.

Move continuous visual interpolation out of React state. Use one animation
clock, batch reveal-time updates once per frame, pause outside the viewport,
and define a reduced-motion steady state. Measure before and after on a real
iPhone.

### P1 — The initial bundle includes every project surface

The production build emits a 1,358.73 kB minified main JavaScript bundle
(397.54 kB gzip) before optional diagram chunks. `App` statically imports every
project browser, btop, README rendering, and the PDF resume even though one
route is visible at a time. This makes a full reload heavier than the current
navigation model requires and raises the memory floor on mobile.

Split at real route and modal boundaries. Route-scoping providers and lazy
loading their owning surfaces should land together so code, data, and live
connections share one lifecycle. Preserve fast in-app navigation with targeted
preload after the initial instrument is interactive.

### P1 — Request ordering is not protected consistently

Found Footy date requests and debounced search requests are not aborted or
versioned. Rapid date changes or a slow older search can commit after the newer
request and replace current data. Long Exposure guards unmounted effects but
does not abort transport. The video state machine already demonstrates the
correct invariant: stale asynchronous work cannot overwrite newer intent.

Adopt `AbortController` or request-generation IDs in shared data primitives.

### P2 — Legacy page-lifecycle code mutates media behind React

The inline script in `index.html` clears every video `src` during iOS
`pagehide`. React still believes the original prop is applied, so a page
restored from the back-forward cache can retain an empty media element. The
same script contains disabled debug UI, persistent load-history logging, a
heap-sampling interval, and manual resource cleanup that overlaps component
ownership.

Remove direct DOM media mutation. Components should own suspend/resume and
release resources only when they can restore them. Keep diagnostics behind an
explicit development flag.

### P2 — The existing component boundary is too coarse for the redesign

The three project browsers are currently 1772, 1171, and 1043 lines, and the
Found Footy stream context is 521 lines. There is no frontend test harness in
`package.json`; Strict Mode is disabled because provider side effects are not
replay-safe.

Do not split files by arbitrary size. Extract around the new reusable
contracts: modal, input surface, live-data lifecycle, date navigation,
disclosure, and media playback. Add focused interaction tests as each contract
lands, then make providers safe under Strict Mode.

## Recommended implementation order

1. Fix Found Footy resume and day-rollover state, then route-scope live
   providers.
2. Establish accessible modal, link/button, focus, and input-modality
   primitives; repair the current structural violations with them.
3. Split project routes and heavy modals, then move the contribution animation
   off React's render clock and add the reduced-motion path.
4. Rebuild the Long Exposure timeline interaction and exchange-time handling.
5. Add browser interaction tests around each extracted primitive while the
   two-plane component system replaces current project UI progressively.

The audit does not recommend a shell rewrite first. The current operational
layouts remain the reference behavior while these contracts become reusable
components.

The [frontend re-foundation plan](./plans/frontend-refoundation.md) turns these
findings into the active migration sequence. This audit remains a dated
evidence record rather than a second plan.
