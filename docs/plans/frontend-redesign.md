# Frontend redesign exploration

Status: active exploration on `feature/phosphor-shell-exploration`.

## Objective

Find a clearer, more responsive, and more distinctive application shell
for vedanta.systems. The strongest current direction is an old-computer
system reveal, interlinked project cells, and a restrained phosphor-display
material language. This is a hypothesis to test in working code, not a
preselected outcome.

The current production frontend remains intact until a replacement proves
its navigation, mobile behavior, performance, and functional parity.

## Authority and references

Vedanta's current feedback and observed use decide the direction. The
Claude artifact, Blade Runner 2049 stills, the existing site, and earlier
generated code are references. None is a specification.

The confirmed requirements and current visual vocabulary live in the
[design brief](../design.md). Decisions move to
[the decision log](../decisions.md) only after a prototype is selected.

## First exploration slice

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

## Second exploration slice

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

## Rendering model

Keep three layers independent:

1. **Semantic DOM** — content, layout, focus, selection, hit targets, and
   immediate state. This layer stays sharp and accessible.
2. **Emission** — the real cell or value that changes owns its excitation and
   decay. A localized duplicate or canvas layer is acceptable only when the
   source node cannot express the effect efficiently. Emission never receives
   input.
3. **Ground and hardware** — layout, black level, borders, and inactive
   surfaces. Do not rely on a full-screen post-processing layer.

The interface responds first; emitted light decays afterward.

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
- Keep the lab out of production output and public routes.

## Review gates

### 1. Material

The light must feel emitted rather than like ordinary boxes with a CSS glow.
Static content stays calm. New or changing content excites the material.

### 2. Navigation

A first-time visitor and Vedanta as operator can identify projects, enter
one, and return without learning a hidden interaction model.

### 3. Responsive operation

The same concepts work at phone and desktop sizes without shrinking the
desktop composition into an unusable miniature or replacing mobile with a
separate metaphor.

### 4. Implementation

The prototype meets type-check/build requirements, does not regress current
page behavior, and establishes reusable primitives instead of one-off visual
timelines.

## Migration after selection

1. Record the selected shell, typography, palette, and motion decisions.
2. Promote only the proven primitives; discard experiment scaffolding.
3. Migrate Found Footy as the first vertical slice.
4. Fold route-scoped wake/resume, network recovery, and timezone-boundary
   reconciliation into that slice.
5. Address the match-day navigation issue tracked in
   [the todo list](../todo.md#found-footy--timezone-navigation-fold-into-the-frontend-rewrite).
6. Verify mobile and desktop parity before migrating the remaining projects.
7. Replace production only after the new shell reaches functional parity.

## Out of scope for the first slice

- Rewriting every project browser.
- Choosing permanent fonts before typography is tested in context.
- Reworking backend data contracts.
- Deploying the lab publicly.
- Treating prototype code as production architecture by default.
