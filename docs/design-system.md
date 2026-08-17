# Interface design system — two-plane instrument model

Status: working guideline. This document defines the direction to prototype
progressively on the current production interface. It does not approve a new
shell, navigation model, font, palette, or motion timeline.

The site is made from two visual element types: **containers** and **data**.
This mirrors the system it represents: containers provide structure and
operation; data moves through them.

## Real-world precedent

The closest technical category is a **multi-plane** or **multi-layer display**.
Commercial and patented systems place independently addressable front and rear
display panels in a stacked arrangement, allowing discrete information on each
plane. Automotive HUD systems likewise use separate picture levels at different
projection distances.

The container plane also borrows from industrial **graphic overlays**,
**fascias**, and **dead-front panels**: a clean surface defines apertures,
controls, and boundaries while illuminated information appears through or
beneath it.

Useful references:

- [Multi-layered display patent](https://patents.google.com/patent/US8941691B2/en)
  — independently rendered front and rear display layers.
- [Continental two-level AR HUD](https://www.continental.com/en/press/press-releases/2014-07-21-hub-technik-concept/)
  — concurrent near/status and remote/augmentation picture levels.
- [Industrial graphic overlays](https://dyna-graphics.com/control-panel-overlays/)
  — a durable front fascia with controls and transparent display windows.
- [Dead-front HMI overlays](https://www.apem.com/en-us/news/what-is-secret-until-lit-in-hmis)
  — information remains visually quiet until its backlight energizes.

Vedanta Systems is not simulating any one of these devices. It uses their
shared structural idea: a crisp operating plane in front of a luminous
information plane. The rear plane is interpreted as a responsive phosphor
display rather than an LCD or LED backlight.

## The two plane contracts

| Plane | Owns | Visual behavior | Must not do |
|---|---|---|---|
| **Container plane** | Boundaries, grouping, apertures, layout geometry, hit areas, focus outlines, expanded/collapsed shape | Sits at the screen surface. Clean, tight, sharp, and immediately responsive. It snaps or pops into its settled geometry, and it sizes naturally around its data. | Bloom, smear, trail, soften text, delay state, impose fixed dimensions that cannot accommodate real data, or become a decorative frame unrelated to content. |
| **Data plane** | Text, numbers, icons, scores, timestamps, progress, status, loading/search/debounce signals, charts, terminal cells | Appears beneath the surface plane. It has a sharp readable core plus localized phosphor excitation, overshoot, bloom, and decay. Its intrinsic size and wrapping may determine container size. | Draw grouping boundaries, receive pointer events through a visual duplicate, depend on glow for legibility, or trigger a full-screen post-process. |

"Beneath" describes the perceived material and local stacking order. It does
not mean that data loses semantic DOM order, accessibility, text selection, or
input behavior. Each component owns a local two-plane stacking context.

## Components may combine both planes

The two types classify rendered parts, not whole React components. Most useful
controls are composites.

For an expand/collapse button:

- its hit target, focus outline, pressed surface, and relationship to the
  fixture frame belong to the container plane;
- its chevron, label, and current expanded/collapsed signal belong to the data
  plane.

An icon-only control may have an invisible container-plane hit area and a
visible data-plane glyph. A fixture card contains a container-plane frame and
many data-plane values. This avoids inventing a third element type for controls
while leaving room to tune the split after interaction testing.

## Rendering contract

1. Render semantic state once in accessible HTML.
2. Keep the readable data core sharp at all times.
3. Build phosphor emission from the actual data node or an `aria-hidden`
   visual duplicate tied to that node.
4. Place container geometry above the emission layer within the component's
   local stacking context.
5. Keep emission layers free of pointer events and layout influence.
6. Excite only data that appears or changes. Static data settles.
7. Do not apply blur, scanlines, noise, chromatic separation, or bloom to the
   complete application tree.

This is a material model, not a CRT filter. The browser still renders clean
HTML; the data plane behaves like emitted light.

## Motion contract

- Application state changes immediately.
- Container geometry appears, expands, collapses, and disappears on the crisp
  surface plane.
- Data energizes on the lower plane and may decay after the state is already
  current.
- Container motion and data excitation are separate timelines that may be
  synchronized by a component.
- Motion remains short, interruptible, and non-blocking. Reduced motion shows
  the settled container and readable data immediately.

Do not set permanent durations or easing curves until the sequence is tested
on a real existing component.

## Stepped semantic zoom

The working name for the former `pop → pop → pop` idea is **stepped semantic
zoom**. `Step zoom` is the short name. It describes a discrete change between
two semantic scales of a cell, not a continuous camera zoom. Moving between a
compact fixture and its expanded fixture is the first concrete use. Moving
between navigation levels can use the same grammar later.

When a cell changes scale:

1. The first phosphor beat registers the previous cell bounds.
2. The actual container snaps immediately to its destination bounds. It does
   not tween, stretch, or fade. A second emission beat registers an
   intermediate scale without becoming real layout geometry.
3. The third beat coincides with the destination frame already present in its
   settled geometry.
4. Data that belongs to the destination scale appears inside the frame,
   energizes, and decays after application state is already current.

The beats belong to the data/emission plane. The source and destination cells
belong to the container plane and only ever exist in settled geometry. This is
a discrete cut between semantic scales, bridged by emitted light rather than a
morph between boxes. Expansion and contraction use the same contract in
opposite directions.

The rejected shell demos did not implement this behavior. The exact shape,
timing, overshoot, zoom-in inverse, interruption behavior, and relationship to
scroll position remain to be designed with Vedanta.

## Color and type

The container plane and data plane may use different token families, but this
document does not choose their final values.

- Container tokens describe ground, fill, border, focus, and structural state.
- Data tokens describe core luminance, phosphor color, semantic state,
  excitation, and persistence.
- Extra colors must encode real data. Projects do not receive decorative
  identity colors by default.
- Typography remains readable without bloom. Phosphor changes emission, not
  font metrics or layout.

Font families and icon libraries are adapters, not component contracts. The
design system exposes typography roles and semantic icon names so GT Pressura,
IBM Plex Mono, Remix Icon, shadcn-related dependencies, or a future replacement
can change without rewriting each project surface.

## Reusable primitive goal

The implementation should converge on a small set of composable primitives,
not project-specific effects. Names are provisional until the first component
proves the API:

- a local two-plane stacking context;
- a container frame with enter, exit, focus, and expansion states;
- phosphor text, number, and icon data;
- a composite control that separates hit surface from luminous label/icon;
- dense signal grids for btop and contribution history;
- disclosure containers for fixtures, events, claims, and market records.

Every primitive must support desktop, touch, keyboard, reduced motion, and a
no-effect readable state. It must avoid continuous React render loops for
decoration and constrain paint work to the component that changed.

### Library shape

Treat this as a source-owned personal component system, similar to shadcn's
copy-and-adapt model but governed by Vedanta Systems' own rendering contracts.
Do not make it a separate package until a real consumer outside this frontend
needs one.

Build it in four layers:

1. **Foundations:** plane, color, typography, spacing, focus, excitation, and
   reduced-motion tokens.
2. **Primitives:** frame, phosphor data, semantic icon, and composite action.
3. **Patterns:** stepped disclosure, dense signal grid, status row, event
   rail, and modal aperture.
4. **Project compositions:** fixtures, claims, processes, narrated events,
   and other domain-specific components assembled from shared patterns.

Project compositions may differ. They must reuse the plane and interaction
contracts rather than force every project into the same card anatomy.

### First implementation slice

The first source-owned primitives live in `src/components/instrument/`:

- `InstrumentFrame` owns settled surface-plane geometry;
- `PhosphorData` keeps an accessible sharp core and renders an `aria-hidden`
  excitation copy behind it;
- `InstrumentIcon` maps semantic roles to the current Remix Icon provider;
- `InstrumentAction` combines crisp hit/focus geometry with a data-plane
  label;
- `InstrumentDisclosure` measures the compact and expanded forms, snaps the
  real frame to the controlled state, and renders three non-layout emission
  registrations at the previous, intermediate, and destination bounds.

The dev-only workbench is served from `/instrument-components.html`. Its
Found Footy study uses representative local data and is intentionally absent
from the normal production build. The current timing, palette values, and
component names are prototype inputs for review, not locked decisions.

## Progressive adoption

The current production interface is the baseline. Do not replace its shell or
navigation while developing this system.

1. Inventory one existing Found Footy fixture and classify each visible part
   as container-plane or data-plane.
2. Implement the minimum shared plane and frame primitives needed for that
   fixture without changing its information architecture.
3. Convert its expand/collapse control as the first composite control.
4. Apply phosphor behavior to fixture data, search/debounce state, and icons.
5. Test btop as the dense-data performance case and the contribution graph as
   the persistence case.
6. Promote only proven tokens and primitives into the style guide.
7. Migrate other existing surfaces incrementally. Revisit navigation only
   after the component system is coherent.

## Review questions for the first component

- Does the frame read as a clean surface above the luminous data?
- Does the component remain as fast and clear as the current implementation?
- Is the plane split obvious without fake parallax or a global screen filter?
- Does data remain readable after all emission is disabled?
- Does the same component anatomy work at phone and desktop widths?
- Can another project reuse the primitives without copying effect code?
