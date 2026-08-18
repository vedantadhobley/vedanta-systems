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
information plane. The spatial model is now closer to a laser-scanned virtual
image or HUD projection than to a photographed CRT: the emitted core stays
sharp and apparently focus-free behind the foreground mask. Phosphor describes
the rear plane's temporal response—excitation, overshoot, bloom, and
persistence—not a screen texture.

The working optical model is a transparent, LCD-like container layer in front
of a continuous projected data layer. White frames, rails, hit geometry, and
focus geometry occupy the front plane. All text, icons, values, signals, and
lavender transition outlines occupy the same rear plane. The classification is
global: a data element does not move forward merely because it is outside a
fixture aperture or inside a button.

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
2. Keep the source data core intact and readable at all times. Never blur the
   source to create bloom.
3. Build phosphor emission from `aria-hidden` visual duplicates tied to the
   source node. Use separate local near/far bloom passes and a lower-luminance
   directional ray pass behind the core.
4. Place container geometry above the emission layer within the component's
   local stacking context.
5. Render rear emission into an oversized buffer, then clip it with a separate,
   symmetrical foreground aperture. The moving luminous element must never be
   its own clipping boundary. The crisp foreground stroke draws above that mask
   and occludes rear light at every edge.
6. Keep emission layers free of pointer events and layout influence.
7. Give every data node low resting emission. A value that appears or changes
   may overshoot that luminance, cross briefly below it, then settle back. A
   geometric registration keeps both its core and active emission at constant
   luminance. Its `pop` is a geometry event, never a light pulse.
8. When content or geometry changes, retain the previous near and far visual
   passes long enough to decay behind the new state. Persistence contains the
   actual previous value, icon, or measured bounds; fading the new state is not
   an afterimage.
9. Do not apply blur, scanlines, noise, chromatic separation, or bloom to the
   complete application tree.

The settled rear core has no permanent positional offset. A static offset reads
as faulty registration, not depth. Readable cores also stay fixed during
interaction. A projection field may add low-luminance ray samples behind the
local bloom. Each sample scales the emitted source slightly toward one shared
viewport-center origin. Scaling around that origin, rather than translating the
whole source, makes every emitted point trace its own center-directed line.
Ray length grows with distance from the origin. Its intensity decays with a
tunable nonlinear falloff, while the source core stays much brighter. This can
describe where the light came from; it does not by itself prove that the
emitting surface sits behind the foreground plane.

This is a material model, not a CRT filter. The browser still renders clean
HTML; the data plane behaves like emitted light.

### Bloom pipeline

Bloom is compositing, not generalized softness:

1. draw the intact source;
2. render one small-radius, moderate-opacity emission copy;
3. render one larger-radius, low-opacity emission copy;
4. add the copies behind the source with `screen` blending;
5. clip or occlude those copies beneath foreground container geometry.

This follows the same source-plus-blurred-buffer structure described by the
[W3C filter compositing model](https://www.w3.org/TR/filter-effects-1/) and the
selective treatment demonstrated by
[three.js bloom](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html).
CSS [`mix-blend-mode: screen`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mix-blend-mode)
provides the additive local composition for ordinary DOM components.

Use two renderer tiers:

- Ordinary text, icons, values, and controls use local DOM emission copies.
- Dense surfaces such as btop and contribution grids bloom one grouped data
  surface or localized canvas, not every cell independently. Blur cost rises
  sharply with radius and affected pixel area, so per-cell filters do not
  scale to those surfaces. See the
  [browser filter performance guidance](https://web.dev/articles/understanding-css#performance_considerations).

## Motion contract

- Application state changes immediately.
- Container geometry appears, expands, collapses, and disappears on the crisp
  surface plane.
- Data energizes on the lower plane and may decay after the state is already
  current.
- Projection affects only non-semantic ray copies. Text, icons, values, local
  bloom, and the lavender registration core never move with the trail.
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

1. Application state and destination layout update immediately. Data shared by
   both semantic scales remains visible; destination-only data stays hidden.
2. One lavender phosphor registration appears inside the foreground aperture
   at the previous cell bounds. It remains rear-plane geometry even when the
   handoff mode temporarily removes the white frame.
3. That same registration snaps to the intermediate bounds and then the
   destination bounds. Its sharp core and active emission remain at constant
   intensity. The unchanged top edge and overlapping portions of both side
   edges do not re-energize.
4. The lavender destination frame holds for one beat.
5. The lavender core disappears when destination-only data appears around the
   persistent shared data. A destination-shaped afterglow remains beneath the
   white frame and decays after arrival.

The workbench keeps two foreground timing modes for comparison:

- **Persistent:** on expansion, the white frame snaps immediately to the large
  destination envelope. On contraction, it stays large until the lavender
  registration finishes shrinking, then snaps small at arrival.
- **Handoff:** the white frame disappears immediately when registration begins.
  The lavender registration alone carries the three scale steps. The white
  destination frame returns at the same instant the lavender core disappears
  and destination-only data becomes visible. Because the foreground mask is
  absent during the handoff, the registration bloom is not aperture-clipped.

Data timing is directional. Expansion mounts destination-only data for layout
measurement but keeps it visually hidden until arrival. Contraction removes
expanded-only data immediately at activation; the compact summary remains
throughout the shrinking registration. The workbench opens in handoff mode for
continued comparison, but both modes remain available.

The lavender transition belongs to the data/emission plane. The white frame
belongs to the container plane. In persistent mode it remains the foreground
depth reference throughout the interaction; handoff deliberately tests a
temporary transfer of that role to the rear registration. This is a discrete
cut between semantic scales, bridged by one continuous emitted outline rather
than a morph between digital boxes. Expansion and contraction use the same
registration sequence in opposite directions. Neither timing mode is selected
as the design-system default yet.

Render the three registrations with one emission envelope that jumps between
measured integer bounds. A small phase state machine selects the source,
intermediate, or destination bound directly. The envelope stays fully present
between those selections; CSS must not interpolate its geometry or fade it
between beats. Never mount several live cores. Between registrations,
persistence contains only geometry that ceased to exist: the previous bottom
edge on expansion, and the previous bottom plus removed side tails on
contraction. Shared top and side segments are not duplicated. When the final
registration turns off, its complete outline may decay.
When contracting in normal document flow, a dedicated layout wrapper reserves
the old footprint until the destination frame arrives so adjacent margins
cannot jump into the stepped sequence. The wrapper may release while the
destination-shaped afterglow continues beneath the settled frame.

The default calibration uses one uniform 100 ms beat between geometry states:
the purple source appears at `t0`, snaps to the intermediate bound at `t100`,
snaps to the destination at `t200`, then yields to the destination white frame
at `t300`. The workbench can vary this interval from 60–180 ms. Phosphor
excitation and the 200 ms destination afterglow retain their own optical decay
durations; the beat controls state-change spacing, not every CSS animation.
These values are prototype inputs, not design-system constants. The rejected
shell demos did not implement this behavior. The exact shape, final timing,
zoom-in inverse, interruption behavior, and relationship to scroll position
remain to be designed with Vedanta.

## Color and type

The container plane and data plane use different token families. The first
component calibration is deliberately narrow:

- The ground is pure black.
- Container boundaries are crisp white and do not change color for live,
  accent, or warning state.
- Data uses white luminance and lavender phosphor. Opacity may express quiet
  hierarchy.
- Extra colors must encode real data. Projects do not receive decorative
  identity colors by default, and a prototype must not invent semantic hues
  before they are reviewed.
- Typography remains readable without bloom. Phosphor changes emission, not
  font metrics or layout.

This calibration does not remove the existing functional palette from btop or
limit the colors available to a future data-rich instrument.

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

One reusable phosphor effect means one semantic response model, not one literal
renderer. Every implementation exposes the same sharp core, near emission, far
emission, overshoot, undershoot, settled output, and previous-state persistence.
All implementations use the same rear-plane registration and response tokens.
Ordinary text, icons, values, and outlines can render those passes with local
DOM layers. Dense btop and contribution surfaces must group the same passes in
a canvas or surface renderer so the effect does not multiply filters per cell.
Tokens and component state form the shared API; the renderer remains an
internal performance choice.

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
- `PhosphorData` keeps an accessible sharp core and renders `aria-hidden` near,
  far, and retained previous-state passes behind it;
- `InstrumentIcon` maps semantic roles to the current Remix Icon provider;
- `InstrumentAction` combines crisp hit/focus geometry with a data-plane
  label;
- `InstrumentProjectionField` batches registered data sources through one
  animation-frame scheduler and assigns a viewport-center transform origin plus
  sampled ray scales without moving semantic content;
- `InstrumentDisclosure` measures the compact and expanded forms, snaps the
  real frame to the controlled state, and renders three non-layout emission
  registrations at the previous, intermediate, and destination bounds. Each
  registration moves one constant-intensity core while the old bounds persist
  as decaying emission; arrival leaves the destination persistence beneath the
  restored surface frame.

The current optical calibration keeps every readable core and both local bloom
passes fixed. A shared projection field measures each ordinary data primitive
and renders 24 low-opacity samples scaled toward the exact viewport center.
This forms converging rays instead of a second offset image. Sample opacity uses
a nonlinear power falloff along the trail. Shared sample scales and opacities
are written once on the field; each source receives only its own origin. During
scroll, the decorative rays hide immediately and no target geometry is read.
After 80 ms of scroll idle, origins recalculate once and the rays return. Resize
and observed layout changes still coalesce through one animation frame. Dense
surfaces will need one grouped target rather than one DOM ray stack per cell.
The workbench can disable the field and tune trail length, ray intensity,
falloff exponent, bloom intensity, and step timing independently.

`InstrumentFrame` also exposes an opt-in projected-occlusion pass between its
complete data composite and its crisp white surface stroke. The pass paints no
new visible surface: it uses pure ground black to remove lower-plane emission.
Its frame copy scales away from the same viewport-center origin, so the narrow
shadow is directional rather than a uniform inset lip. The workbench defaults
this pass off. Enabling it exposes plain `offset` and `width` controls for its
maximum radial displacement and thickness; both remain disabled while the pass
is off. Handoff transitions remove the occlusion pass with the white frame; a
hidden surface cannot continue casting a visible knockout.

A separate rear-field pass can raise the local projection substrate just above
black without changing the page ground or any source bloom. It is a broad,
steady lavender radial field beneath all data and beneath the occlusion mask.
The mask therefore has continuous low-luminance material to remove instead of
appearing only where a glyph trail happens to cross it. The workbench exposes
this as `scatter`; zero restores the pure black-on-black comparison. A separate
`ground / black | raised` toggle tests a global lavender-black lift, but pure
black remains the default and the raised ground is not a design-system choice.

The current DOM ray stack is the reference renderer, not the assumed final
implementation. The [projected-data rendering research](./projected-data-rendering.md)
evaluates grouped PixiJS, Three.js post-processing, and minimal WebGL paths for
continuous per-pixel rays, bloom, and event-scoped persistence.

The lavender registration renders inside a 14-pixel overscan buffer; a separate
aperture clips the composite symmetrically beneath the white stroke in
persistent-frame mode. Its active core and emission stay constant across all
three steps. Differential edge segments render the fast persistence described
above, so shared geometry cannot accumulate into a pulse.

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
- Does center-directed emission give the data luminous volume without being
  mistaken for evidence that the data plane is physically recessed?
- Does data remain readable after all emission is disabled?
- Does the same component anatomy work at phone and desktop widths?
- Can another project reuse the primitives without copying effect code?
