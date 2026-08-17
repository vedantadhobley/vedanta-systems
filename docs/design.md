# Design language — living brief

This document preserves Vedanta's intent, current design hypotheses,
and the constraints that visual work must satisfy. It is a working
brief, not a style bible. Vedanta's current judgment and evidence from
using the site take precedence over this document, earlier prototypes,
and the existing implementation.

The current implementation direction is the
[two-plane interface design system](./design-system.md): crisp containers at
the screen surface, with luminous data rendered beneath them. Develop it
progressively from the current production UI. Do not infer a new shell or
navigation design from the mood references in this brief.

The Claude artifact linked below is a historical reference. It contains
the first implemented `pop → pop → pop` system-reveal study and other
useful visual ideas. It is not a specification, and neither the artifact
nor code generated in this repository is authoritative merely because it
already exists:
<https://claude.ai/code/artifact/8903c2a7-8c60-4082-8575-31a9e3894d11>

## Confirmed product requirements

These are the standards against which an exploration succeeds or fails:

1. **Visual clarity.** Information hierarchy, text, state, and controls
   remain immediately legible. Atmosphere cannot obscure meaning.
2. **Immediate response.** Input changes application state without
   waiting for decorative motion. Emitted light may decay after the
   interface has already responded.
3. **Clean restraint.** The composition stays sparse, deliberate, and
   free of ornamental noise. Phosphor is a material language, not a
   filter applied at maximum intensity to every surface.
4. **Desktop and mobile fluency.** Neither layout is a reduced version of
   the other. Navigation and controls must remain obvious and comfortable
   on both.
5. **Operational usefulness.** The portal is an instrument Vedanta uses,
   not only a portfolio visitors observe. Live and historical data remain
   fast, accurate, and easy to inspect. The two live btop surfaces are a
   primary part of the product, not secondary decoration or a status-card
   summary that a redesign may abstract away.
6. **Atmosphere.** The interface should feel like precise light emitted
   through a physical phosphor display: sharp cores, controlled bloom,
   fast excitation, and a quieter afterglow.
7. **Color restraint.** Keep the shell close to Blade Runner's almost
   monochrome, two- or three-color display grammar. Lavender, neutral text,
   and one status color are enough for the shell. Additional colors belong
   only inside real instruments when they encode a concrete data distinction.

## How to read the rest of this document

- **Confirmed requirements** are the constraints above.
- **Working directions** describe the strongest current hypothesis. They
  are expected to change when a prototype or real use contradicts them.
- **References** provide vocabulary and mood. They do not decide the UI.
- **Existing code** is evidence about behavior and hard-won interaction
  details, not a visual precedent that must be copied.

---

## The origin image

The whole site grew from one prompt Vedanta wrote:

> *A terminal above a layer of fog, a lone corporate developer in an
> empty office doing illicit R&D after hours, as the lights in the
> street far below scatter in the clouds under his feet.*

That figure is **him**. The site is his **public-facing interface for
looking at his own work** — and, at the same time, **a tool he
operates himself**, which is what he actually does in real life. Both
readings are load-bearing: it is a window others look through *and* an
instrument he works at. Design for the operator first; the audience is
watching the operator work.

## Working reference: Blade Runner 2049 (not '82)

Villeneuve + Deakins, specifically. The 1982 original is wet neon
maximalism. **2049 is subtraction** — enormous negative space, fog,
desaturation, one color doing all the emotional work, a tiny sharp
figure held in a vast soft void.

The feeling to hit, in Vedanta's words: **"spiky calm."** A calm,
foggy, near-empty field — and then one razor-precise instrument
reading, one blood-red tick, hard hairline edges. **Sparse but
complex**: sparse because it's confident, complex only when you lean
in. The tension between the soft atmosphere and the sharp instrument
*is* the aesthetic. Never busy. Never loud. Precise.

## Reference concept: Pale Fire / cells interlinked

Nabokov's *Pale Fire* is a poem buried inside obsessive commentary —
the work and the apparatus that reads it are one object. **This whole
ecosystem is Vedanta's Pale Fire.** The projects are the poem; this
site is the commentary that indexes them and the instrument he reads
them with.

The spine is the baseline-test litany from the film:

> *A system of **cells interlinked** within **cells interlinked**
> within one stem.*

Read it as a system metaphor, not a navigation specification: the projects are cells; they
interlink (shared data plane, [NATS event mesh](../AGENTS.md), the
contribution grid); **luv is the one stem** they all root into.
Both attempts to turn the metaphor into a replacement shell were rejected.
No replacement navigation model is selected. Work from the current interface
until reusable component language is established.

## Working color direction: restrained displays

2049's screen glow is Wallace-cyan, and its displays are often almost
monochrome. That restraint is part of the direction. The current site's
**lavender** remains its identity color; btop's existing lavender theme is
the clearest working reference. Neutral text and a quiet live/nominal color
complete most surfaces.

Real project data may add a small semantic palette where distinctions would
otherwise be lost, but the shell does not assign a decorative color to each
project. Phosphor describes how the displayed colors emit and decay. The fog,
desaturation, blood-red live accent, warm hardware details, record cards,
reticles, and monumental space remain references to test rather than elements
that must all ship.

## Working palette

The current implementation has overlapping semantic tokens and hardcoded
colors. This compact palette is a starting hypothesis. Values and roles may
change, but additions must encode real information and remain local to the
instrument that needs them.

| Role | Token | Value | Notes |
|---|---|---|---|
| Ground | `--void` | `#05070a` | Blood-black. Never flat — always fogged. |
| Fog | `--fog-1 / -2 / -lit` | `#0a1016 / #131e28 / #26343f` | Atmospheric depth, light-scatter below. |
| Panel | `--panel / -2` | `#0b0f16 / #111826` | Instrument surfaces. |
| Hairline | `--line / -2` | `#1b2634 / #2b3a4d` | Razor edges. 1px, cool. |
| **Phosphor (him)** | `--lav-dim / lav / lav-hi` | `#7a5aaf → #a57fd8 → #c9a0f0` | The screen glow. The btop ramp. His signature. |
| Phosphor floor | `--ghost` | `#3d2d5c` | Barely-lit cells. |
| Text | `--fg` | `#dcd6ea` | Lavender-white body. |
| Neutral | `--fg-2 / -3` | `#8a97a3 / #5c6672` | **Sage-blue fog** — the 2049 neutral, not grey. |
| **Accent** | `--live` | `#e5484d` | **Blood-red. The one hot color.** Live / critical ONLY. The "cells interlinked" red. |
| Nominal | `--good` | `#6fae8f` | Muted sage-green. Quiet "OK" state. |
| Hardware | `--bezel` | `#c8a56a` | Warm amber. Bezel chrome / caution only. |

Semantic colors (`--live`, `--good`, `--bezel`) are separate from the shell
identity color, but they are not all required on every display. Most screens
should settle at two or three visible color families. The test is clarity,
consistent meaning, and restraint.

## Working typography

- **Instrument register** — `GT Pressura Mono` (the real face; the
  exploration falls back to a mono stack since the licensed font can't
  load in a sandbox). Body, readouts, labels, data. Weight + case +
  tracking + color carry hierarchy, since it's one family.
- **Poetic register** — thin, wide-tracked **uppercase** for the
  monumental moments (the baseline-test hero). Rendered as light-weight
  heavily-tracked mono for now; a thin geometric sans is the eventual
  upgrade for this register only.
- Numerals: `tabular-nums` everywhere digits align (scores, clocks,
  readouts).

## Material + motion grammar

Pulled directly from the film's instruments (the ESPER/VK scan
monitors, the spinner HUD, the replicant-record lookups):

- **Two planes** — containers render as crisp surface geometry. Text, icons,
  values, and other data render as a luminous phosphor layer beneath them.
  Controls may combine a container-plane hit surface with data-plane copy or
  iconography. The [interface design system](./design-system.md) owns this
  contract.

- **Luminous implementation, not a CRT costume** — excitation and decay
  should be driven by the real value or terminal cell that changed. A
  global scanline, fog, vignette, or glow overlay cannot be the main source
  of the effect. The UI should feel as though it is the display, not a web
  page placed behind an imitation-display filter.
- **Fog + depth** as the ground: content floats *above* a hazy well
  with city-lights scattering in the cloud far below. The current moon
  samples `moon.mp4` into a low-resolution pixel canvas and contains
  substantial mobile-resume recovery logic. Whether the redesign keeps,
  replaces, or removes it is an exploration question.
- **Hardware bezels + labeled controls** — verbs as instrument keys
  (`V2 · EV · REC · ◄◄ ►►`), not web buttons.
- **Record cards** — drill-downs read like the film's replicant-record
  lookups: labeled fields, a scanning bloom, mugshot/clip grid.
- **Reticles, corner brackets, segmented readouts** — the sharp detail
  that rewards leaning in.
- **The phosphor wave** — the GitHub-grid heritage, reborn: a wave
  sweeps across and illuminates a **data substrate** with phosphor
  afterglow. It's a **universal masthead component whose data = the
  active project** (found-footy: goal/clip discovery; monitor: system
  load; photos: uploads). A found event deposits a lasting bright cell.
- **Motion = spiky calm.** Interactions snap in short mechanical beats.
  The intended `pop → pop → pop` behavior is still unresolved; both shell
  demos implemented it incorrectly. A future component study should connect
  its final beat to a container frame arriving and its data energizing. The
  sequence must never block input. Ambient motion must justify its runtime
  cost. Respect `prefers-reduced-motion`.

## Non-negotiable constraints (what the redesign must NOT break)

Vedanta is "not bought into anything with the current site except":

1. **It's fast and it works.**
2. **Easy to navigate and operate — desktop AND mobile.**
3. It conveys the aesthetic.

The redesign elevates the surface and the atmosphere. It never trades
away operability or mobile fluency to do it. Sparse is the goal; slow
or fiddly is failure.

## Open exploration questions

- Where should the visual split fall inside composite controls such as
  expand/collapse buttons?
- How much perceived separation between the two planes is useful before it
  becomes fake parallax or weakens clarity?
- How should container arrival and data excitation synchronize in the eventual
  `pop → pop → pop` sequence?
- Should resume/about disappear entirely, or should any public identity
  information survive in a smaller non-portfolio form?
- Which display face creates a useful poetic register without weakening
  the instrument register or increasing font cost unnecessarily?
- How much phosphor persistence reads as physical before it begins to
  reduce contrast or make state changes feel slow?
- Does the material need any global treatment at all once live cells and
  values own their excitation behavior?
- How often should the startup reveal replay? The current hypothesis is
  once per session, never as a blocking splash screen.
- How much visual identity should every project share, and where should
  a project's own data determine its masthead and instrumentation?

## Non-goals

- A generic green terminal, fake command prompt, or simulated typing UI.
- A VHS/CRT camera filter dominated by curvature, RGB separation, noise,
  and blur.
- Decorative animation that delays navigation, input, or fresh data.
- Rendering semantic application UI into a canvas at the expense of
  accessibility, selection, or responsive layout.
- Preserving an existing component or pattern only because it has already
  been implemented.
- Replacing the application shell before the component system has been proven
  progressively on the current interface.

## What the reference stills say, as a system

Synthesized from the 2049 frames Vedanta pulled (the Pale Fire
baseline test; Sapper's fogged dead tree; the ESPER/VK scan monitor;
the spinner HUD + detective ID card; the mortuary/replicant record;
the spinner rising through cloud into starlight):

- **Color** — near-black grounds that are never flat; nearly monochrome
  instrument displays with two or three visible color families. Additional
  semantic colors must be rare, local, and data-bearing.
- **Type** — thin tracked caps for the poetic register; tiny mono
  labels on instruments; segmented LCD readouts.
- **Materials** — fast excitation and decay at the actual emitting value;
  physical bezels with labeled keys; record cards with labeled fields;
  reticles; radial diagrams. Scanlines and bloom are optional evidence,
  not default layers.
- **Atmosphere** — fog with real depth; light scatter far below; the
  terminal floating above the well. Lonely, cold, quiet, precise,
  after-hours. "Blood-black nothingness."

## Data contracts — semantic truth vs presentation

A principle for the whole rewrite, not just the visuals: **where rendering
logic lives.** Every surface that reads another service's state sits on a
three-layer seam, and the seam belongs in the *middle*:

1. **Internal mechanism** — the other service's implementation (workflow
   tables, status flags, internal vocabularies). *Never crosses the API.* If
   the frontend reads it, the frontend is welded to how that service happens
   to work today and breaks when it changes.
2. **Semantic phase** — the derived, stable *meaning*. *This is the API
   contract.* Derived inside the owning service; consumed as-is by the
   frontend, which does **zero** truth-derivation.
3. **Presentation** — copy, icons, animation, layout. *Lives in the frontend.*
   Rendering known state, not assuming it. The current UI and this redesign
   render different presentation off the same phase.

The failure modes are symmetric: leak layer 1 and the frontend re-implements
pipeline logic and drifts (see the found-footy heuristic that read
`videos.length` as "searching"); bake in layer 3 and the API is welded to one
UI's wording. Hold the seam at layer 2. It's the same line drawn for live
updates — **the API is truth; the frontend renders** (SSE is a hint, REST is
the truth; the backend derives phase, the frontend derives pixels).

### Worked example — found-footy event `phase`

Contract handed to the found-footy Go API (2026-08-13). The `eventDTO` carries:

- **`phase`** — derived enum, first match wins: `removed` (`removed=true`;
  terminal, wins even after complete — VAR) → `complete`
  (discovery `edw.completed_at` set) → `searching` (`downstream_triggered=true`,
  `edw.completed_at` null) → `detected` (otherwise — goal exists, discovery not
  started).
- **`debounce_count`** (0–3) — raw, for "confirming N/3" during `detected`.
- **`player`** (nullable) — `null` = unknown scorer; distinguishes, *within*
  `detected`, "won't be searched" from "confirming". No separate `unsearched`
  phase.
- **`videos[]`** — the **orthogonal** axis. Clips surface incrementally *during*
  `searching` and persist into `complete`; video count is never a phase signal.
  `phase` and `videos.length` are independent.

**Not on the DTO** (layer 1 / layer 3): no `edw.completed_at`, `outcome_class`,
`downstream_triggered`, `monitor_complete`/`download_complete`; no display copy.

The frontend renders `phase` × `videos.length` (× `player`, `debounce_count`):
`searching`+0 → "searching…", `searching`+N → "N clips · still searching",
`complete`+0 → "no clips found", `complete`+N → "N clips", `detected`+null →
"unknown scorer", `removed` → "VAR — overturned".

Until `phase` ships, the Pattern-B shim (`src/server/routes/found-footy.ts`)
fakes it from `state==='completed'` / unknown-scorer / has-clips — exact for
finished games, ambiguous only for live ones. See
[`docs/decisions.md` 2026-08-13](./decisions.md).

## Where this connects

- [`AGENTS.md`](../AGENTS.md) — front door; request paths, the found-footy
  live-data path the wave will eventually read from.
- [`docs/architecture.md`](./architecture.md) — how the frontend is served.
- [`docs/todo.md`](./todo.md) — the redesign is a workstream; the
  found-footy NATS→SSE path is what makes the wave live.
- Cross-project cutover context lives in
  [`~/workspace/vedanta-dhobley/docs/plans/2026-08-15-cutover.md`](../../../vedanta-dhobley/docs/plans/2026-08-15-cutover.md).
