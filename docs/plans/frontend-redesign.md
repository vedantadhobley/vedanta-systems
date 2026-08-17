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

Build a dev-only lab under `src/experiments/phosphor-shell/`. It must make
four moments directly testable:

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

## Rendering model

Keep three layers independent:

1. **Semantic DOM** — content, layout, focus, selection, hit targets, and
   immediate state. This layer stays sharp and accessible.
2. **Emission** — duplicate visual layers or localized canvas effects for
   bloom, overshoot, persistence, and afterimages. They never receive input.
3. **Screen material** — restrained scanlines, noise floor, fog, and glass.
   Prefer static or low-frequency effects over a continuous full-screen
   post-processing pass.

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
