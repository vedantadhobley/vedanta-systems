# Frontend visual exploration log

Status: historical evidence on `feature/phosphor-shell-exploration`. Both
shell studies are rejected. The instrument-component workbench remains a
prototype, not a selected production implementation.

The [frontend re-foundation plan](./frontend-refoundation.md) owns current
migration order and runtime architecture. This file preserves the design turns,
prototype behavior, and review findings that informed it. Do not treat the
chronology below as an active checklist.

## Historical objective

Develop a reusable visual system for vedanta.systems without replacing its
working information architecture. The governing direction is a two-plane
instrument model: clean responsive containers at the screen surface and
luminous phosphor data beneath them.

Build progressively from the current production components. Navigation,
typography, and larger composition remain open until the component language
has proved itself on real project surfaces.

## Authority and references

Vedanta's current feedback and observed use decide the direction. The
Claude artifact, Blade Runner 2049 stills, the existing site, and earlier
generated code are references. None is a specification.

The confirmed requirements and current visual vocabulary live in the
[design brief](../design.md). The working component and rendering contracts
live in the [interface design system](../design-system.md). The active
[re-foundation plan](./frontend-refoundation.md) joins that visual work to
runtime, accessibility, and route ownership. Decisions move to
[the decision log](../decisions.md) only after they are selected.

## Historical first exploration slice

Build a dev-only lab under `src/experiments/phosphor-shell/`, served from
the separate `phosphor-shell.html` Vite entry. The production build uses
only `index.html`, so the lab must not appear in production output. It must
make four moments directly testable:

1. **System reveal.** Stem and project cells energize in short mechanical
   beats. The sequence never blocks interaction and settles quickly.
2. **Resting navigation.** A quiet home state communicates project identity,
   status, and hierarchy without the current folder listing or breadcrumb.
3. **Project expansion.** A selected cell expands into an application surface
   and collapses back without losing spatial context.
4. **Live excitation.** A data change updates immediately, then leaves a
   localized phosphor afterglow without making the state itself ambiguous.

Use representative local fixture/status data. Do not couple this design
study to unfinished backend work.

## First review — rejected direction (2026-08-17)

The first implementation proved the reveal could be fast, and its CRT
overshoot and initial load-in contained useful motion studies. It failed the
larger design test:

- It replaced an information-rich operational site with a sparse invented
  dashboard. That was a functional and visual downgrade.
- It reduced btop to a few fake summary rows even though the full live luv
  and joi monitors are central to the portal.
- It assigned lavender, red, green, and amber as broad shell roles. That
  drifted from the intended almost-monochrome, two- or three-color display
  grammar. Btop's existing lavender display is the stronger reference.
- Its fog, scanline, vignette, and glow layers simulated the outside of a
  CRT. They did not make the real interface elements behave like emitted
  light.
- Its cells merely appeared in sequence. They did not implement the intended
  fast `pop → pop → pop` expansion of an old-computer surface.

Keep the quick load-in and short overshoot as motion references. Discard the
stem map, invented operational readings, global screen filter, and decorative
multi-role shell palette.

## Historical second exploration slice

Evolve the existing portal instead of replacing it with a concept screen:

1. Make Vedanta Systems the default instrument and render the real luv and
   joi btop streams. Do not summarize them into cards.
2. Keep project navigation compact, direct, always visible, and nearly
   monochrome. Do not assign a decorative identity color to each project.
3. Open the selected surface through three rapid nested expansion beats.
   Content and controls become available immediately; the border/aperture
   motion settles around them in a few hundred milliseconds.
4. Tie phosphor excitation to actual btop delta cells and changed values.
   Remove the global scanline/fog/glow layer as the source of the look.
5. Keep additional colors local to real data that needs them, and keep the
   contribution history as real data rather than a decorative substitute.

## Second review — rejected direction (2026-08-17)

The second implementation restored real btop and project surfaces, but it
still chose a new shell before defining a scalable component system. It
failed the revised design test:

- Its fixed project strip and enclosing instrument frame do not scale cleanly
  as the number and complexity of projects grow.
- It placed existing applications inside another authored composition instead
  of improving their own reusable elements.
- It continued to choose navigation, hierarchy, and taste globally rather
  than deriving a system progressively with Vedanta.
- Its three-stage aperture animation was not the intended
  `pop → pop → pop` interaction.
- Rendering real data and btop inside the demo did not make the surrounding
  shell a suitable production direction.

Treat the lab as rejected reference code only. Do not promote its shell,
navigation, animation, or optional btop effect into production.

## Direction that survived the shell studies

The site contains two visual element types:

1. **Container plane.** Fixture frames, record boundaries, layout apertures,
   hit areas, focus geometry, and expanded/collapsed shape. This plane is
   crisp, tight, and immediately responsive at the screen surface.
2. **Data plane.** Text, values, icons, scores, progress, search/debounce
   signals, charts, and terminal cells. This plane sits visually beneath the
   container and receives the localized CRT/phosphor treatment.

Controls are composites rather than a third type. For example, an expand
button's hit target and focus surface may belong to the container plane while
its chevron and label belong to the data plane. The exact split remains a
component-level design question.

The first implementation target is one existing Found Footy fixture. Do not
change the site shell or navigation for this slice.

## Found Footy integration inventory

Found Footy is already close to the intended layout. Preserve its information
architecture and one-open-at-a-time disclosure behavior:

```text
competition
└── fixture frame
    ├── fixture disclosure row
    └── event rail
        ├── event disclosure row
        └── clip controls
            └── video modal
```

### Container-plane parts

- System-advisory and date-navigation frames.
- Fixture outer border, including staging, voided, live, and completed forms.
- The expanded fixture's event rail and grouping geometry.
- Clip-button square, hit area, focus outline, and pressed surface.
- Video-modal backdrop, viewport, and control hit geometry.
- Competition, fixture, and event expanded/collapsed geometry.

These parts already appear and disappear without layout animation. Keep that
behavior. The new primitives should make the geometry consistent and reusable,
not replace the layout.

### Data-plane parts

- Competition label, live count, and fixture count.
- Team names, score, round, kickoff, countdown, elapsed time, and terminal
  status.
- Expand/collapse, search, validation, extraction, warning, date, and
  navigation glyphs.
- Event title, event kind, scorer, assist, minute, search match, scan state,
  and clip count.
- Clip rank and best-clip signal.
- Loading, empty, validation, extraction, and no-clips messages.

These parts keep sharp readable cores. Mounts and real value changes may excite
their phosphor emission; steady data settles. Continuous work states such as
validation and extraction need a reusable active-signal behavior distinct from
a one-time update excitation.

### Composite controls

Competition, fixture, and event disclosure buttons are the first useful
composites. Their semantic `<button>`, hit geometry, focus outline, and pressed
surface belong to the container plane. Their line/fill glyph, label, count,
and current state belong to the data plane.

Preserve the existing interaction work:

- hover styles only on devices that support hover;
- touch-safe `:active` behavior on iOS;
- immediate accordion state changes;
- scroll stabilization when expanded content shrinks;
- native browser video controls after the existing bleed-through guard.

### Current dependency seams

This surface does not compose shadcn components today. It uses semantic HTML,
Tailwind classes, `cn`, direct Remix Icon imports, and the global mono font
token. The design-system primitives should therefore sit below project
components and remain independent of shadcn.

Introduce two adapters before a broad visual migration:

1. **Semantic icon adapter.** Map roles such as expand, collapse, search,
   validate, extract, previous, and next to the current icon provider. Project
   code stops importing line/fill pairs directly, so the pack can change later.
2. **Typography roles.** Replace component assumptions about a specific mono
   face with instrument, data, label, and numeric roles backed by CSS tokens.
   Font selection can then change without altering component anatomy.

### Minimum first slice

1. Keep the current fixture markup and behavior.
2. Add a local two-plane stacking primitive around one fixture.
3. Move its border, focus, hit, and open/closed geometry onto a shared
   container-frame primitive.
4. Move its disclosure glyph, teams, score, round, scan signal, and match time
   onto data-plane primitives.
5. Add one-time mount/update excitation and a separate continuous-work signal.
6. Verify all live, finished, pending, voided, searching, validating,
   extracting, no-goal, and search-highlight states before touching event or
   competition layout.
7. Promote the proven fixture primitives, then apply them to event rows and
   other projects.

The compact and expanded fixture are two semantic scales of the same cell.
Their disclosure is the first stepped semantic zoom prototype: snap the real
frame to its destination geometry, register the old/intermediate/new bounds
with three short emission-plane beats, and energize the data revealed inside.
This interaction is the first place to tune timing before the grammar is used
for event cells or navigation.

### First workbench implementation — ready for review (2026-08-17)

The dev-only `/instrument-components.html` entry now renders a controlled
Found Footy fixture study from reusable source in `src/components/instrument/`.
It does not change `App.tsx`, the production Found Footy browser, or the normal
Vite production entry.

The study makes these behaviors directly testable:

- compact and expanded fixture geometry changes immediately;
- three measured emission rectangles register the previous, intermediate,
  and destination bounds without participating in layout;
- newly mounted and updated values keep a sharp core while an `aria-hidden`
  emission copy overshoots and decays;
- an extracting state uses a separate continuous signal;
- semantic icon roles isolate the fixture from the current Remix Icon pack;
- native buttons expose `aria-expanded`, keyboard focus, and touch-safe active
  behavior;
- reduced motion removes the step sequence and emission animation while
  preserving the settled state.

The workbench currently covers the live/expanding case and a simulated score
update. Finished, pending, voided, searching, validating, no-goal, and
search-highlight cases remain review work before the primitives replace the
production fixture markup.

Initial review found the three step registrations too compressed to read as
separate beats. The first timing revision keeps each beat short but spaces the
starts at 140 ms intervals, producing a roughly 450 ms sequence. The actual
fixture frame still snaps to its destination immediately; only the lower
emission plane carries the sequence.

The next review found the settled text too digitally exact and the workbench
background incorrectly textured. The background is now pure black. An initial
attempt softened every data core; this was rejected because it made the whole
page look blurred rather than luminous.

The following review clarified that steady localized bloom, rather than core
blur alone, is the main CRT material cue. Every data primitive now settles to
visible low emission. Foreground frames and rails use a one-pixel black
occlusion lip beneath their crisp stroke, so bloom is covered at a container
boundary. That hard occlusion of soft light establishes the data plane behind
the container plane without simulated parallax or drop shadow.

The corrected bloom implementation preserves an untouched source core and
adds two `aria-hidden` emission copies behind it: a small-radius near pass and
a lower-opacity far pass, composited with `screen`. Only those copies blur.
Reduced motion retains settled bloom while disabling excitation. Dense btop
and contribution surfaces will need a grouped bloom renderer rather than the
per-node DOM path.

The first two-pass calibration still read as almost no bloom. Resting near and
far emission are now intentionally strong enough to merge perceptually with
the source as one luminous mark. Excitation raises the same emission instead
of switching a separate glow effect on and off.

The original step implementation used three independent rectangles. It was
rejected as visibly buggy: the rectangles overlapped, and contraction painted
the old large bounds across controls that had already moved. The replacement
initially used one CSS-animated envelope, but animating measured height while
painting blurred shadows still produced unstable intermediate rendering.

The current renderer is phase-driven. React selects one rounded measured
height at each of three registrations, configurable in the workbench and
defaulting to one state change every 100 ms. In persistent mode, the white foreground frame
remains fully opaque and encloses the largest source or destination bounds for
the default 300 ms mechanical sequence; fixture data shared by both scales
stays visible while destination-only data waits. One uninterrupted lavender core,
inset inside the foreground optical lip, snaps through the source,
intermediate, and destination bounds without changing intensity. Its near and
far passes also keep constant luminance. When the bottom edge snaps, only the
previous bottom persists; contraction also retains the side tails removed by
the smaller destination. Shared top and side geometry is never repainted as an
afterimage. At arrival the lavender core swaps out exactly when new expansion
data appears. On contraction, expanded-only data disappears immediately at
activation; the compact summary remains while the foreground geometry proceeds
to its destination. The retained destination passes decay beneath it for
another 200 ms. The timing sequence is explicit: purple source at `t0`,
intermediate at `t100`, destination at `t200`, and purple-to-white handoff at
`t300`. The beat controls spacing between those state changes; near/far
excitation and persistence retain independent optical decay durations. CSS
never interpolates or fades the live lavender geometry. A dedicated layout
wrapper reserves the old height during contraction until arrival, which
prevents adjacent margins and controls from jumping into the afterimage. The
workbench exposes only white and lavender data; the unrequested green, yellow,
and red prototype roles were removed rather than promoted into the library.
The timing, inset, and retained contraction envelope remain provisional.

The first static depth calibration was rejected. A permanent `0.4 × 0.6 px`
rear-plane offset read as misregistration, while the moving frame's own clipped
bloom was visibly amputated on its right and bottom edges. A follow-up moved
the entire rear plane during each registration; that made the fixture title
jump with the lavender border and was also rejected.

The first projection experiment moved two complete near/far emission copies
toward the viewport center. It was rejected because it read as a second image,
not light extending from individual emitting points. The current experiment
keeps every readable core and both local bloom passes fixed. It renders 24 faint
copies, each scaled slightly toward the exact viewport center; scaling about the
shared origin makes every point follow its own converging ray. Ray opacity
follows a tunable nonlinear power falloff, so source data stays much brighter
than its trail. The field now writes the 24 shared sample scales and opacities
once rather than once per registered source. During active scrolling it hides
the decorative rays and performs no target measurement or per-sample writes;
after 80 ms idle it recalculates each source origin once and restores the rays.
Resize and observed layout changes remain animation-frame coalesced. The
workbench can turn the field off and independently tune trail length, ray
intensity, falloff, bloom, and step timing. This tests a coherent light source,
not yet physical recession. The lavender composite still uses a 14-pixel
overscan buffer and separate symmetric foreground aperture.

The workbench also exposes two foreground timing modes. `persistent` preserves
the reviewed behavior: expansion snaps the white frame large immediately, and
contraction holds it large until the lavender registration reaches the compact
destination. `handoff` removes the white frame for the three lavender beats and
restores the destination frame when the lavender core disappears. Both remain
prototype inputs; the workbench now opens in `handoff` for continued review,
without selecting it as the design-system default.

The current depth experiment replaces the uniform inset lip with an opt-in
black occlusion frame between the data and surface planes. That hidden frame
scales away from the shared viewport-center projector origin, producing a
directional knockout only where lower-plane light reaches it. `offset` controls
the maximum radial displacement and `width` controls the hard mask thickness;
no extra scattering or ground color was added. In handoff mode the mask
disappears with the white frame and returns only at the settled destination.
Review found the effect too weak to justify unexplained defaults, so occlusion
now starts off and both controls disable with the pass.

Review on a pure black ground showed the expected limit: the black mask was
legible only at the few lavender pixels it happened to remove. The next
comparison adds a steady local rear-field pass beneath the fixture data. Its
`scatter` control raises a broad lavender substrate from zero to eight percent
without changing glyph bloom; this gives the mask continuous light to cut while
the page remains black. `ground / black | raised` separately compares a subtle
global lavender-black lift. It does not change the default ground or introduce
a new semantic color.

`PhosphorData` now retains the actual previous visual when its response key or
primitive text changes. A score update therefore paints the old score only in
decaying near and far passes behind the immediately current semantic value.
This is real state persistence; it does not fade or duplicate the new value.

## Rendering model

Use the [two-plane contract](../design-system.md#the-two-plane-contracts).
The semantic DOM remains accessible and selectable; the planes describe local
visual material and stacking, not separate application trees. The interface
responds first, and data emission may decay afterward.

## Constraints

- Mobile and desktop are review targets from the first prototype.
- No animation may delay routing, input, or data visibility.
- Text and controls remain legible with emission effects active.
- Use semantic HTML and keyboard-operable controls.
- Respect `prefers-reduced-motion`; the reduced version shows settled state
  without spatial sequencing.
- Pause ambient work while the document is hidden.
- Avoid 60-fps React state for decorative motion. Prefer CSS compositor
  properties and localized canvas only where accumulation is material.
- Keep experiments out of public routes until the component passes review.

## Review gates

### 1. Material

The light must feel emitted rather than like ordinary boxes with a CSS glow.
Static content stays calm. New or changing content excites the material.

### 2. Component anatomy

Container and data responsibilities remain clear, including inside composite
controls. The result does not depend on project-specific effect code.

### 3. Responsive operation

The same concepts work at phone and desktop sizes without shrinking the
desktop composition into an unusable miniature or replacing mobile with a
separate metaphor.

### 4. Implementation

The prototype meets type-check/build requirements, does not regress current
page behavior, and establishes reusable primitives instead of one-off visual
timelines.

## Superseded migration sketch

The active sequence now lives in the
[frontend re-foundation plan](./frontend-refoundation.md). The list below is
retained to show how the visual prototype was expected to grow before the
runtime audit expanded the scope.

1. Inventory one current Found Footy fixture by container-plane and
   data-plane part.
2. Implement the minimum local plane, frame, phosphor-data, and composite
   control primitives needed by that fixture.
3. Preserve its information architecture and interaction behavior while
   testing the new material treatment.
4. Verify touch, keyboard, desktop, reduced motion, paint cost, and a readable
   no-effect state.
5. Use btop as the dense-data performance case and the contribution graph as
   the persistence case before generalizing the data primitive.
6. Promote only proven primitives and tokens into the style guide.
7. Fold route-scoped wake/resume, network recovery, and timezone-boundary
   reconciliation into the Found Footy migration.
8. Address the match-day navigation issue tracked in
   [the todo list](../todo.md#found-footy--timezone-navigation-fold-into-the-re-foundation).
9. Migrate other existing components incrementally. Revisit the application
   shell and navigation only after the shared component system is coherent.

## Out of scope for the first component slice

- Rewriting every project browser.
- Choosing permanent fonts before typography is tested in context.
- Reworking backend data contracts.
- Deploying experimental styling publicly.
- Replacing the shell, folder navigation, or contribution masthead.
- Reusing either rejected shell demo as production architecture.
