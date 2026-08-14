# Design language — the north star

This is the design soul of vedanta.systems. Read it before touching
anything visual. It exists so the vision survives across sessions and
doesn't get re-derived (worse) every time. When a visual decision is
in tension with what's here, this wins — unless Vedanta says otherwise.

The living exploration that this doc describes:
<https://claude.ai/code/artifact/8903c2a7-8c60-4082-8575-31a9e3894d11>

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

## The reference: Blade Runner 2049 (not '82)

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

## The concept: Pale Fire / cells interlinked

Nabokov's *Pale Fire* is a poem buried inside obsessive commentary —
the work and the apparatus that reads it are one object. **This whole
ecosystem is Vedanta's Pale Fire.** The projects are the poem; this
site is the commentary that indexes them and the instrument he reads
them with.

The spine is the baseline-test litany from the film:

> *A system of **cells interlinked** within **cells interlinked**
> within one stem.*

Read it as the **site map, not a quote**: the projects are cells; they
interlink (shared data plane, [NATS event mesh](../AGENTS.md), the
contribution grid); **luv is the one stem** they all root into.
Navigation should *be* this — interlinked cells around a stem — not a
tab bar wearing a costume.

## The one deviation: 2049 is the grammar, lavender is the phosphor

2049's screen glow is Wallace-cyan. Ours is **lavender** — the single
deliberate deviation that makes the terminal *his* instead of a movie
clone. Everything else is adopted wholesale: the fog, the
desaturation, the blood-red accent, the warm hardware bezels, the
record cards, the reticles, the monumental space.

Decision locked 2026-08-02. Rationale and the rejected alternatives
(full Wallace-cyan; dual lavender/cyan) live in the session that set
it; this is the outcome.

## Palette — 12 tokens, ruthlessly rationed

The current codebase uses ~21 hardcoded hexes plus a dead shadcn
light-theme token block. That collapses to this. Nothing off this
list ships.

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

Semantic colors (`--live`, `--good`, `--bezel`) are **separate from
the accent budget** and stay muted. If red ever fights the fog, drop
its saturation before you reach for a second hot color. There is no
second hot color.

## Typography

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

- **Phosphor scanlines + CRT bloom** over the whole screen — the
  unifying "this is a screen" texture. Subtle; never eats legibility.
- **Fog + depth** as the ground: content floats *above* a hazy well
  with city-lights scattering in the cloud far below, and a slow
  **dithered moon** turning in it. (Procedural canvas — not the retired
  `moon.mp4`, which was killed for mobile jank. Same look, none of the
  cost.)
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
- **Motion = spiky calm.** Ambient layers drift *slowly* (fog, moon,
  wave). Interactions **snap** (80–120ms linear). The contrast is the
  point. `radius: 0` everywhere. Respect `prefers-reduced-motion`.

## Non-negotiable constraints (what the redesign must NOT break)

Vedanta is "not bought into anything with the current site except":

1. **It's fast and it works.**
2. **Easy to navigate and operate — desktop AND mobile.**
3. It conveys the aesthetic.

The redesign elevates the surface and the atmosphere. It never trades
away operability or mobile fluency to do it. Sparse is the goal; slow
or fiddly is failure.

## What the reference stills say, as a system

Synthesized from the 2049 frames Vedanta pulled (the Pale Fire
baseline test; Sapper's fogged dead tree; the ESPER/VK scan monitor;
the spinner HUD + detective ID card; the mortuary/replicant record;
the spinner rising through cloud into starlight):

- **Color** — near-black grounds that are never flat; desaturated
  sage-blue neutral; one phosphor glow; a single blood-red; warm amber
  only on hardware. Five families, rationed hard.
- **Type** — thin tracked caps for the poetic register; tiny mono
  labels on instruments; segmented LCD readouts.
- **Materials** — horizontal phosphor scanlines + bloom; physical
  bezels with labeled keys; record cards with labeled fields; reticles;
  radial diagrams.
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
