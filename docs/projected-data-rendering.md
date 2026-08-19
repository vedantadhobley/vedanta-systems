# Projected data rendering research

Status: 2026-08-18 implementation research, not a selected dependency or
locked decision. Library compatibility statements below are a dated snapshot;
verify current versions before selecting a renderer.

This document evaluates browser and React rendering approaches for the rear
projected-data plane. The visual target remains the
[two-plane interface system](./design-system.md): semantic data stays readable
in the DOM, projected light sits beneath crisp container geometry, and the
effect never becomes a full-screen CRT costume.

## Name the effect correctly

The center-directed trail is a **screen-space radial scattering** or **zoom
blur** effect. It is related to light shafts or god rays, but our input is an
emission mask made from interface data rather than a sun mesh or a 3D scene.

The standard algorithm does this for every output pixel:

1. Find the vector from that pixel to the shared projector origin.
2. Sample the emission buffer repeatedly along that vector.
3. Weight each sample below the source luminance.
4. Multiply the contribution by a decay factor at every step.
5. Add the accumulated trail beneath the untouched source.

The classic GPU Gems implementation exposes sample count, density, weight,
decay, and exposure. Its contribution at step `i` contains `decay^i`, so the
physical-looking default is exponential rather than linear. Higher decay values
near `1` retain light farther along the ray; lower values extinguish it sooner.

Source: [NVIDIA GPU Gems, volumetric light scattering as a post-process](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process).

## React's role

React should own semantic state and stable drawing descriptors. It should not
calculate pixels or receive 60 state updates per second.

The practical architecture is:

```text
React semantic data
├── accessible DOM core
└── emission descriptors
    └── offscreen emission texture
        ├── radial scattering
        ├── local bloom
        ├── event-scoped persistence
        └── additive rear-plane canvas

crisp DOM container plane
└── composites above and occludes the rear-plane canvas
```

Renderer state, textures, and uniforms live behind refs. React updates them
when data or calibration changes. A short animation-frame loop runs only while
excitation, active work, or persistence needs it. Scroll, resize, visibility,
and resumed-page reconciliation invalidate geometry without driving React
renders. This matches React Three Fiber's own guidance to avoid `setState` in
render loops: [R3F performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls).

## Evaluated approaches

### DOM ray samples — current prototype

The current `InstrumentProjectionRays` renders 24 low-opacity visual copies and
scales each toward the viewport center. This preserves real HTML metrics,
selection, accessibility, and icon fidelity. It is a useful reference renderer
for ordinary controls and a dependable fallback.

It does not scale to btop, the contribution grid, or a whole page. Every source
multiplies DOM nodes, transforms, and compositing work. Sample spacing can also
become visible on long trails.

### PixiJS 8 plus pixi-filters — best first GPU experiment

PixiJS is a 2D WebGL/WebGPU renderer with text, vector graphics, render
textures, filters, and explicit control over render scheduling. Its filter
system can process one grouped data container instead of every DOM cell.

The MIT-licensed `pixi-filters` project already supplies:

- `ZoomBlurFilter`, with a configurable center, strength, radius, and up to 32
  samples;
- `AdvancedBloomFilter`, with threshold, bloom scale, brightness, blur, and
  resolution controls.

Sources:

- [PixiJS filter architecture and custom filters](https://pixijs.com/8.x/guides/components/filters)
- [pixi-filters repository and compatibility table](https://github.com/pixijs/filters)
- [ZoomBlurFilter API](https://api.pixijs.io/%40pixi/filter-zoom-blur/PIXI/filters/ZoomBlurFilter.html)
- [AdvancedBloomFilter API](https://api.pixijs.io/%40pixi/filter-advanced-bloom/PIXI/filters/AdvancedBloomFilter.html)

The stock zoom-blur shader is a starting point, not the desired finished
effect. It jitters up to 32 samples to hide banding and weights them with a
parabolic curve. It returns one blurred image. Our renderer must instead keep
the source separate, accumulate a lower-luminance trail with exponential decay,
and composite that trail behind the source. The shader is MIT-licensed and
small enough to adapt rather than treating the filter as a black box:
[ZoomBlurFilter fragment source](https://github.com/pixijs/filters/blob/main/src/zoom-blur/zoom-blur.frag).

PixiJS recommends WebGL for production while its WebGPU renderer matures. That
is also the safer mobile baseline. Current Pixi React bindings require React
19, while this application uses React 18; see the
[PixiJS ecosystem compatibility note](https://pixijs.com/8.x/guides/getting-started/ecosystem).
A first experiment should therefore mount PixiJS imperatively inside one
ordinary React component. Do not upgrade React or pin an old rendering stack
merely to obtain JSX wrappers.

### Three.js, React Three Fiber, and postprocessing

This ecosystem proves that the rendering model is standard. React
Postprocessing's `GodRays` exposes samples, density, decay, weight, exposure,
clamping, resolution scale, and optional blur. Three.js also provides bloom and
afterimage post-processes.

Sources:

- [React Postprocessing GodRays](https://react-postprocessing.docs.pmnd.rs/effects/god-rays)
- [pmndrs postprocessing](https://github.com/pmndrs/postprocessing)
- [Three.js post-processing nodes](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language#post-processing)

It is not the best first dependency here. `GodRays` expects a WebGL mesh as its
source, and the full scene graph is unnecessary for a flat interface. Current
React Postprocessing also targets React 19; React Three Fiber 8 can support
React 18, but combining it with an older postprocessing wrapper would pin a
legacy stack. Three.js becomes attractive only if a later surface genuinely
needs 3D scene composition.

### OGL or direct WebGL — smallest custom path

[OGL](https://github.com/oframe/ogl) is a zero-dependency, public-domain WebGL
library. Its full core is about 8 kB minified and compressed, and it exposes
textures, render targets, programs, and meshes without a 3D engine's larger
surface area. [react-ogl](https://github.com/pmndrs/react-ogl) can mount it
through React 18.

This is the strongest fallback if PixiJS adds too much runtime or constrains the
shader. It requires us to own text/vector drawing, render-texture management,
bloom, context recovery, and more lifecycle code. PixiJS earns its extra weight
if its 2D source renderer and filter pipeline remove enough of that work.

### Approaches not recommended

- `html2canvas` reconstructs a page from DOM and supported CSS rather than
  capturing the browser's real composited pixels. It is asynchronous, has CSS
  fidelity gaps, and is unsuitable for live per-frame emission. See the
  [project's own limitations](https://github.com/niklasvh/html2canvas).
- SVG/CSS filters can bloom a `SourceGraphic`, but the standard primitive set
  does not provide a viewport-origin radial accumulation pass. Repeated offsets
  return us to the ghost-copy problem. See the
  [W3C Filter Effects model](https://www.w3.org/TR/filter-effects-1/).
- [Paper Shaders](https://github.com/paper-design/shaders) provides convenient
  procedural React canvases, but its god-rays component generates a background
  rather than scattering our data texture. Its PolyForm Shield license is also
  less suitable than MIT, zlib, or public-domain source for a component system
  we intend to modify.
- A global afterimage feedback buffer would smear steady content during scroll
  and resize. Persistence must be event-scoped, reset on geometry changes, and
  stop rendering after its decay window.

## Recommended next workbench experiment

Keep the DOM renderer and add a toggleable GPU renderer beside it. Do not
replace the existing implementation yet.

1. Add an `InstrumentEmissionSurface` with a transparent, pointer-inert canvas
   beneath the crisp DOM container plane.
2. Extend the existing registry with explicit `text`, `icon`, and `outline`
   emission descriptors. Do not screenshot arbitrary DOM.
3. Draw those descriptors into one viewport-sized emission render texture.
4. Apply an adapted Pixi zoom-blur pass with separate `distance`, `samples`,
   `decay`, `weight`, and `exposure` uniforms.
5. Keep the source texture intact. Apply local near/far bloom separately, then
   add the trail beneath it.
6. Add ping-pong history only for sources whose semantic value or geometry
   changed. Clear history on scroll, resize, wake, and renderer fallback.
7. Render on invalidation. Run continuously only for active signals or a short
   persistence window, and stop while the document is hidden.
8. Fall back to the current DOM renderer when WebGL creation or context recovery
   fails.

The workbench should expose these controls independently:

| Control | Meaning |
|---|---|
| distance | Maximum screen-space distance sampled toward the origin. |
| samples | Trail continuity and GPU cost. |
| decay | Multiplicative retention per sample; near `1` produces a longer tail. |
| weight | Fine contribution of each ray sample. |
| exposure | Coarse brightness of the accumulated trail. |
| bloom | Local source bloom, independent of trail brightness. |
| persistence | Time-domain retention after real data or geometry changes. |
| active depth/rate | Amplitude and cadence of semantic work-signal fluctuation. |

## Review gate

Adopt a GPU dependency only if the toggleable study beats the DOM reference on
all of these points:

- rays read as continuous light, not duplicated glyphs;
- the source remains substantially brighter and sharper than the trail;
- the white container plane visibly occludes rear light;
- text and icon geometry remain aligned across phone and desktop layouts;
- settled content incurs no continuous React work;
- active and persistence loops pause while hidden and recover after wake;
- GPU failure leaves a clean, fully readable interface;
- one grouped surface can handle the btop and contribution-grid density cases.
