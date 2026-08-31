# Frontend re-foundation

Status: active. Found Footy's live-data foundation has landed. The shared
shell and layout-stability foundation now precedes further visual component
work.

This is the authoritative implementation plan for the frontend rewrite. The
current production interface remains the behavioral baseline until a migrated
route passes its review gates. The rewrite lands as complete vertical slices,
not as a second application or a one-shot replacement.

## Objective

Build one frontend architecture that enforces four properties together:

1. live data stays correct across sleep, reconnect, midnight, and timezone
   changes;
2. input and accessibility behavior is explicit for touch, mouse, and
   keyboard;
3. reusable source-owned components express the two-plane visual system; and
4. each route loads and runs only the code and data it owns.

Visual clarity, immediate response, and operational usefulness are release
requirements. The projected-light language does not excuse stale data, slow
input, inaccessible controls, or continuous hidden work.

## Authority

This plan owns migration order and frontend architecture. The related docs
have narrower jobs:

- the [frontend audit](../frontend-audit.md) owns the dated evidence;
- the [full-project audit](../full-project-audit-2026-08-20.md) owns the wider
  BFF, infrastructure, security, and documentation evidence;
- the [frontend shell plan](./frontend-shell.md) owns viewport geometry,
  safe areas, scroll ownership, fixed chrome, and structural handoffs;
- the [Found Footy live-data contract](../found-footy-live-data.md) owns the
  current stream behavior and target reconciliation semantics;
- the [design brief](../design.md) owns intent and confirmed product
  requirements;
- the [interface design system](../design-system.md) owns visual material and
  component anatomy;
- the [visual exploration log](./frontend-redesign.md) records rejected work
  and prototype findings;
- the [decision log](../decisions.md) records choices that have landed; and
- the [todo list](../todo.md) holds unresolved or deferred work.

When these files conflict, current behavior decides present fact, this plan
decides migration order, and the design brief decides the product constraint.

## Technology posture

### Retain React, Vite, and React Router

React remains the right application model for this portal. Found Footy,
Spin Cycle, Long Exposure, btop, and media playback all have stateful,
asynchronous, route-specific interfaces. The audit found lifecycle, ownership,
and component-boundary faults; it did not find a framework mismatch.

Keep React 18, Vite, and React Router during the first Found Footy slice. Do
not combine the rewrite with a framework or major-version migration without a
measured requirement.

### Source-own the component system

The target is a personal component system inside this repository. It is
inspired by shadcn's source-ownership model, but shadcn is not the target API or
the design authority. Existing shadcn and Radix-derived code may stay until a
new primitive replaces its real use. Do not perform a dependency purge first.

Keep the system in this application until a second real consumer proves the
need for a package. Shared source is cheaper than premature versioning and
release infrastructure.

### Keep Tailwind provisional

Tailwind may continue to handle layout, responsive composition, and small
utilities while components migrate. It must not own the material model,
animation state machine, semantic tokens, or interaction contract. Put those
in named component styles, CSS variables, and TypeScript behavior with a clear
owner.

Reassess Tailwind after the complete Found Footy slice. At that point the
decision can use real evidence about class volume, token leakage, dynamic
styling, and maintenance cost. Removing it now would add a mechanical rewrite
without fixing a user-visible invariant.

### Treat fonts and icons as adapters

Components consume semantic typography and icon roles. They do not import a
specific font or icon pair as part of their public contract. Font and icon
choices remain replaceable without rewriting component anatomy.

## Target architecture

```text
application shell
├── global preferences only
│   └── timezone mode
└── route boundary
    ├── lazy project surface
    ├── route-owned data provider
    │   ├── REST snapshot
    │   ├── SSE hints and ephemeral ticks
    │   └── lifecycle reconciliation
    └── project composition
        └── shared behavior + visual primitives
            ├── semantic DOM and input contract
            ├── crisp container plane
            └── projected data plane
```

The layers have distinct responsibilities:

- **Runtime primitives** own snapshots, streams, request ordering, clocks,
  visibility, and freshness.
- **Behavior primitives** own buttons, links, disclosure, focus, dialogs,
  media playback, and input-modality differences.
- **Visual primitives** own tokens, container geometry, data emission,
  typography, icons, and reduced effects.
- **Patterns** combine those primitives into date navigation, fixture cells,
  event rows, status signals, timelines, and dense data surfaces.
- **Project compositions** arrange patterns without reimplementing their
  contracts.

Do not create a universal component merely because two elements look similar.
Share a component when they have the same semantic and behavioral contract.

## Live-data contract

### Snapshot is truth; stream is notification

REST returns the authoritative durable state. SSE carries targeted resource
replacements resolved by the BFF. The inline `fixture.status` projection may
patch status/time without a fetch, but the next snapshot must replace it
completely.

Every transition from possibly disconnected to live performs a snapshot
reconciliation. This includes:

- initial route entry;
- `visibilitychange` back to visible;
- `pageshow`, including back-forward cache restoration;
- browser `online` after an offline period;
- SSE reopening after a disconnect; and
- resuming a stream paused for a local UI reason.

The stream may then carry later hints. Reopening an `EventSource` without a
snapshot is insufficient because neither the browser nor the BFF guarantees
replay of hints missed during the gap.

### Model live intent separately from the selected date

Found Footy needs two independent values:

- `selectedDate`: the literal date rendered; and
- `dateMode`: `live` or `pinned`.

Following today sets `dateMode = live`. Deliberate historical or future
navigation sets `dateMode = pinned`. A day or timezone boundary recomputes
today and advances `selectedDate` only in live mode. A pinned view stays on its
chosen date and revalidates it after a long suspension.

Schedule the next boundary while the route is active. Recompute the timer
after visibility, timezone-mode, and system-clock changes. Never rely on a
mount-time `getToday()` value.

### Give asynchronous work an owner

Each request has an abort signal or generation identifier. A response may
commit only if it still belongs to the current route, query, date, and
timezone. Route exit aborts requests and closes streams.

Connection status and data freshness are separate. “SSE connected” does not
mean “snapshot current,” and a disconnected stream does not erase the last
valid data. The UI must be able to show both facts.

Opening a video must not silently weaken data correctness. If playback still
pauses the Found Footy stream for a measured resource reason, closing the modal
must reconcile a snapshot before or with reconnect. Prefer independent media
and live-data ownership when testing shows the stream can remain open.

## Interaction and accessibility contract

- Use semantic buttons, links with real `href` values, lists, dialogs, and
  headings before styling them.
- Use capability queries for visual hover and `:active` for press feedback.
- Branch on `PointerEvent.pointerType` only when behavior differs. Do not infer
  input from viewport width or user agent.
- Make touch, mouse, and keyboard paths explicit. Hybrid devices follow the
  active input.
- Every modal owns focus entry, containment, Escape, close action, and focus
  restoration.
- Preserve browser zoom. Meet focus, accessible-name, and list-structure
  requirements before a component enters the shared system.
- Keep one shell-selected scroll owner. Touch browser tabs retain document
  scrolling; desktop and validated standalone profiles may use a contained
  main scroll surface so its scrollbar ends above application navigation.
  Apply safe-area insets at the shell boundary. Structural changes use the
  shared layout transaction in the [shell plan](./frontend-shell.md), not
  route-local root CSS or a route-lifetime height maximum.
- `prefers-reduced-motion` removes spatial sequencing and persistence while
  preserving state, hierarchy, and settled readability.

Desktop video controls appear after real mouse movement, focus, or deliberate
click. Touch controls require a deliberate tap. Muted autoplay, progress
verification, one automatic recovery, and the manual retry action remain one
media-playback contract.

## Rendering and performance contract

- Application state changes immediately. Decorative emission follows it.
- React owns semantic state, not per-frame pixels.
- Settled UI performs no continuous animation work unless a real live signal
  requires it.
- Hidden and offscreen surfaces stop decorative work.
- Ordinary controls use semantic DOM with optical copies. Dense surfaces may
  use one grouped canvas renderer after the workbench gate is met.
- Container and data planes are local visual layers, not duplicate application
  trees.
- Route code, data providers, and live connections share the same lazy route
  boundary.

Measure the complete route on a real phone. A visually convincing effect that
causes scroll lag or keeps the mobile radio awake fails the gate.

## Migration sequence

### 0. Protect the baseline

- Add the smallest browser interaction test harness needed for lifecycle,
  input, modal, and media contracts.
- Record current Found Footy behavior and the shared-link video case.
- Fix the structural accessibility failures that would otherwise be copied
  into new primitives.

### 1. Rebuild Found Footy's runtime boundary

- **Landed:** mount its provider at the Found Footy route, not above the router.
- **Landed in FF-077:** live versus pinned date intent; playing carryover;
  complete initial/recovery snapshots; wake, page restore, network, stream,
  midnight, timezone, and deliberate-resume reconciliation; abort/generation
  protection for snapshots; targeted fixture/status/video updates; and an
  IANA-consistent date index derived from the complete snapshot.
- Resolve the remaining split staging match-day defect in the
  [timezone todo](../todo.md).
- **Landed for shared targets:** abort and generation-protect superseded
  retained-event requests. Search request ownership remains open.
- Expose transport and freshness as separate state.
- Keep the current production markup while these invariants settle.

### 2. Establish the neutral shell and layout transaction

- Extract viewport, scroll, safe-area, header, and bottom-navigation ownership
  without changing the visual design or navigation hierarchy.
- Add the viewport diagnostic and browser-mode acceptance harness.
- Replace Found Footy's route-local transient spacer with the shared dynamic
  region and layout transaction.
- Reset competition, fixture, and event disclosure on every canonical date
  change; then apply only locked-final and explicit shared-link opening.

### 3. Establish behavior primitives

- Land accessible link/button, disclosure, dialog, date-navigation, and status
  primitives.
- Move the video modal onto the shared dialog and media contracts without
  regressing autoplay recovery or input-specific controls.
- Verify touch, mouse, keyboard, focus restoration, and browser zoom.

### 4. Complete the Found Footy visual slice

- Migrate one fixture through the container/data-plane anatomy first.
- Cover compact, expanded, live, completed, staging, voided, searching,
  validating, extracting, empty, and search-highlight states.
- Apply the proven primitives to event rows, clip controls, navigation, and
  project status.
- Keep the information architecture and one-open-at-a-time disclosure unless
  testing identifies a concrete problem.
- Replace the route only after the whole surface passes behavior, visual,
  accessibility, and performance gates.

### 5. Make route ownership complete

- Lazy-load project surfaces and heavy modals.
- Route-scope Spin Cycle and other project providers.
- Move the contribution animation off React's render clock, pause it offscreen,
  and add its reduced-motion state.
- Remove global side effects and the `index.html` media mutation once component
  ownership replaces them.
- Enable Strict Mode after provider effects are replay-safe.

### 6. Migrate the remaining instruments

- Use btop as the dense-renderer and color-system case.
- Rebuild Long Exposure's timeline with accessible interaction and correct
  exchange time.
- Migrate Spin Cycle and the remaining shared chrome.
- Revisit the shell, navigation, resume, and About only after several real
  project surfaces prove the component language.

## Found Footy acceptance scenarios

The first route cannot ship until these scenarios pass:

1. A phone sleeps while following today and wakes after local or UTC midnight:
   the route advances to the new live date without reloading the page.
2. A phone sleeps on a deliberately selected past date: the route preserves
   that date and refreshes its data.
3. The tab stays open through midnight: live mode advances once; pinned mode
   does not.
4. A match starts before midnight and remains active after midnight: the new
   live day keeps it visible and current until the upstream marks it inactive.
5. The next staging match day remains complete when its kickoffs span two
   local calendar dates.
6. The date index and rendered fixture buckets agree across a daylight-saving
   boundary.
7. The network or SSE stream drops during an update: reconnection snapshots
   the authoritative state before declaring the view current.
8. Rapid date and search changes cannot display an older response.
9. Opening and closing a video cannot leave fixture data stale.
10. The exact shared video route and ordinary clip opening preserve muted
    autoplay recovery on iPhone Safari/Chrome and desktop Chrome.
11. A known reclaimed or removed share opens its retained fixture/event
    context and reports that the video is unavailable; the raw media endpoint
    remains `410` and never becomes an HTML redirect.
12. A shared target survives reload, wake, reconnect, midnight, timezone
    recomputation, and its own programmatic date switch while `v` remains in
    the URL. A user date action—including its skip to the next non-empty
    date—pushes a clean history entry and releases it; Back restores the shared
    target and Forward restores the selected clean-date state.
13. Mouse movement reveals desktop video controls; touch movement does not;
    deliberate tap and keyboard focus do.
14. Every disclosure and modal works by touch, mouse, and keyboard with visible
    focus and correct focus restoration.
15. Reduced motion and no-effect modes remain complete, readable interfaces.
16. Hidden routes own no live connection or decorative render loop.
17. The migrated route is at least as responsive and clear as production at
    phone and desktop widths.

## Non-goals for the first slice

- A big-bang replacement of every route.
- A new visual shell or navigation hierarchy. The neutral behavioral shell is
  part of the first foundation.
- A React upgrade or framework migration.
- Removing Tailwind or shadcn-related dependencies before their uses migrate.
- Packaging the component system for hypothetical consumers.
- Selecting permanent fonts or icons before testing them in real components.
- Shipping the instrument workbench as a public route.
