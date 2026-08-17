# Frontend redesign exploration

Status: direction reset on `feature/phosphor-shell-exploration`. Both shell
studies are rejected. The current production interface is the baseline.

## Objective

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
live in the [interface design system](../design-system.md). Decisions move to
[the decision log](../decisions.md) only after a prototype is selected.

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

## Current direction

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

## Progressive implementation

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
   [the todo list](../todo.md#found-footy--timezone-navigation-fold-into-the-frontend-rewrite).
9. Migrate other existing components incrementally. Revisit the application
   shell and navigation only after the shared component system is coherent.

## Out of scope for the first component slice

- Rewriting every project browser.
- Choosing permanent fonts before typography is tested in context.
- Reworking backend data contracts.
- Deploying experimental styling publicly.
- Replacing the shell, folder navigation, or contribution masthead.
- Reusing either rejected shell demo as production architecture.
