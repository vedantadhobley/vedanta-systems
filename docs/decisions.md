# Decisions

Append-only log of architectural decisions for vedanta-systems.
Newest at the bottom. Each entry: date · short title · context ·
decision · consequences. When a decision is later reversed, *add a
new entry* — never edit history in place.

---

## 2026-05-28 — Adopt AGENTS.md + docs/ as the front-door pattern

**Context.** The repo accumulated several top-level MDs over its life
(`README.md`, `QUICKSTART.md`, `CLOUDFLARE-SETUP.md`,
`CONTAINER-ARCHITECTURE.md`, `MONITORING_PANE.md`, `PORT-ALLOCATION.md`,
`BTOP-INTEGRATION.md`, `TIMEZONE-FIXTURE-SCOPING.md`) without a clear
front-door for agents — each was a topic page; none was the entry
point. Sibling projects `found-footy/` and `legal-tender/` use an
`AGENTS.md` (front door) + `CLAUDE.md` symlink + `docs/` (topic pages)
pattern and reference each other through it.

**Decision.** Adopt the same shape here: `AGENTS.md` at the root,
`CLAUDE.md` symlinked to it, `docs/` directory for subordinate topic
docs. Auto-memory under `~/.claude/projects/<project>/memory/` stays
minimal — project facts belong here in the versioned repo, not in
per-machine memory.

**Consequences.** The legacy root MDs are now migration targets, not
the source of truth. The detailed cleanup checklist lives in
`docs/todo.md` ("Doc cleanup pass"). New project facts land in
`docs/*.md`; new architectural decisions append below this entry.

---

## 2026-05-28 — Pattern A → Pattern B for cross-project integration

**Context.** `~/workspace/proxy/CONVENTIONS.md` lays out two patterns
for how vedanta-systems' Express BFF surfaces other projects:

- **Pattern A** — vs-api opens direct DB connections into each
  project (mongo, minio, postgres) and serves data from there. Schema
  knowledge and credentials for every project end up in vs-api.
- **Pattern B** — each project ships its own `*-api`, and vs-api is
  a thin HTTP proxy: `/api/<project>/*` →
  `<project>-{env}-api:<port>`. Each project owns its data plane;
  vs-api owns presentation routing only.

Current snapshot (2026-05-28):

| Project | Status |
|---|---|
| found-footy | Pattern A — `src/server/routes/found-footy.ts` reads mongo + minio directly. A `found-footy-dev-api:8080` already exists per `~/workspace/proxy/caddy/caddy.d/found-footy.caddy`. |
| spin-cycle | Pattern A — reads `spin-cycle-{env}-postgres` directly via `pg`. `spin-cycle-{env}-api:3000` already exists upstream. |
| long-exposure | Pattern A by design (for now) — reads `long-exposure-{env}-postgres` directly. There is no separate long-exposure API yet; `caddy.d/long-exposure.caddy` documents the current single-source-of-truth choice. |
| legal-tender | Not surfaced yet. Pattern B from day one when it lands. |

**Decision.** Pattern B is the target. Migrate per project when next
touched for feature work — no "migrate for its own sake" bundles.
New project integrations don't add direct-DB peers in
`src/server/index.ts` or new routers in
`src/server/routes/<project>.ts` that import database clients.

**Consequences.**

- For new projects: scaffold a thin HTTP proxy router; the project
  itself ships an `<project>-{env}-api` and a Caddyfile entry. Done.
- For found-footy + spin-cycle: bundle the migration with the next
  feature that touches each project's data surface. Don't reshuffle
  proactively.
- For long-exposure: revisit when LE grows its own API service. The
  current `src/server/routes/long-exposure.ts` is acceptable
  technical debt — explicitly called out as such in the file header.

See `docs/todo.md` "Pattern A → Pattern B migration" for the per-project
backlog.

---

## 2026-05-29 — Doc reorganization: legacy MDs migrated into `docs/`

**Context.** Two days after the AGENTS.md/docs/ bootstrap landed, the
legacy root MDs needed disposition. They split into three buckets after
a code-verification pass: still-current (`BTOP-INTEGRATION.md`,
`TIMEZONE-FIXTURE-SCOPING.md` — the latter surprised me, but its
contract matches `src/contexts/timezone-context.tsx` and
`src/components/found-footy-browser.tsx` today), worth-rewriting-from-
current-truth (`CONTAINER-ARCHITECTURE.md`, `PORT-ALLOCATION.md`), and
fully-superseded (`CLOUDFLARE-SETUP.md`, `QUICKSTART.md`,
`MONITORING_PANE.md`). The `scripts/` directory + its README turned
out to be wholly dead too — every script in there targeted
`~/projects/prod/vedanta-systems` (retired workspace path) or
provisioned cloudflared as a systemd service (cloudflared now runs
as a docker container in `~/workspace/proxy/`).

**Decision.** Migration map (this commit):

| From | To | How |
|---|---|---|
| `BTOP-INTEGRATION.md` | `docs/btop.md` | `git mv` — content preserved |
| `TIMEZONE-FIXTURE-SCOPING.md` | `docs/found-footy-timezone.md` | `git mv` — content preserved, namespaced for future per-project timezone notes |
| `CONTAINER-ARCHITECTURE.md` | `docs/architecture.md` | fresh write from current truth (Caddy + in-container nginx + Vite-in-dev + btop host-network exception) |
| `PORT-ALLOCATION.md` | `docs/ports.md` | fresh write — only btop's host ports are current; HTTP services use Caddy |
| `CLOUDFLARE-SETUP.md` | — (pruned) | superseded by `deploy/INFRA-NOTES.md` + `~/workspace/proxy/` |
| `QUICKSTART.md` | — (pruned) | superseded by README + `~/workspace/proxy/` |
| `MONITORING_PANE.md` | — (pruned) | the portal page itself plays this role now |
| `scripts/setup-cloudflare-tunnel.sh` | — (pruned) | host-systemd cloudflared scheme retired |
| `scripts/setup-auto-pull.sh`, `scripts/auto-pull.sh`, `scripts/README.md` | — (pruned) | targeted `~/projects/prod/`; retired |

`AGENTS.md`'s "Where to look first" section now points at the new
`docs/*.md` files; the "Legacy root MDs" section is gone.

**Consequences.** The repo root is no longer a scratchpad of stale
topic pages. New content goes under `docs/` and gets referenced from
`AGENTS.md`. The `.github/workflows/deploy.yml` is the only remaining
artifact of the retired auto-deploy scheme — flagged in
`docs/todo.md` for follow-up rather than bundled here.

---

## 2026-05-29 — Remove the dead GitHub Actions deploy workflow

**Context.** `.github/workflows/deploy.yml` SSHed to
`~/projects/prod/vedanta-systems` (retired workspace path) and did
`git pull && docker compose up`. Dead since the workspace layout
moved to `~/workspace/dev/`, and `~/workspace/prod/` (the prod
replica directory) is not yet set up per the layout note in
`~/.claude/CLAUDE.md`.

**Decision.** Delete. The planned replacement for "push-to-main
auto-rebuilds prod" is workspace-level — local code copy or local
pull into `~/workspace/prod/<project>` with no GitHub round-trip —
and lives in `~/workspace/` somewhere, not per-project. Carrying a
misleading per-project workflow until the workspace-level scheme
exists is worse than no workflow.

**Consequences.** Push-to-main has no auto-deploy effect for this
repo. Prod deploys are manual
(`docker compose -f docker-compose.yml up -d --build`) until the
workspace-level scheme lands. Not tracked here further; that work
isn't vedanta-systems' scope.

---

## 2026-08-13 — found-footy Pattern B (dev) + the share_id video-URL model

**Context.** The joi rebuild moved inference off the old
`llama-small.joi`/Qwen endpoint, which killed the Python found-footy
prod backend's clip validation. Rather than revive Python, we started
consuming the **Go rebuild** in dev — a "minimal-first" slice: fixtures
rendering from the Go read API (`found-footy-dev-api:8081`, REST at
`/api/v1/*`) with **no frontend changes**, so we don't burn effort on
UI that's getting redesigned anyway.

**Decision.** `src/server/routes/found-footy.ts` becomes a **Pattern B
translation shim**: it calls the Go read API and reshapes the flat+nested
Go DTOs back into the legacy Mongo-shaped `Fixture` the current frontend
expects. All the change lives in the BFF; the frontend + `src/types/found-footy.ts`
are untouched. Config flips from `{mongoUri, minio}` → `{apiUrl}`
(`FOUND_FOOTY_API_URL`). Search is stubbed, `/dates` synthesized from the
Go window, and the SSE `/stream` is kept alive but **not** yet fed by NATS
(the NATS→SSE coalescing bridge is the next layer).

**The share_id video-URL model (the new "url sharing").** Video serving
changes shape:

- **Old:** MinIO object paths, byte-proxied at `/api/found-footy/video/:bucket/*`.
- **New:** found-footy mints a stable **`share_id`** (`s_<12hex>`) per public
  clip. The browser hits `/api/found-footy/video/:shareId`; vs-api calls
  `{go-api}/api/v1/videos/:shareId`, follows the **302 → presigned Garage URL**,
  and streams the bytes back same-origin (Range-forwarded — Garage isn't
  browser-reachable, so vs-api stays in the byte path; this is also what prod
  will need).
- **Shares are stable across replacement.** When a better clip supersedes an
  older one, the `share_id` keeps resolving — found-footy walks the supersede
  chain to the current live asset — so a shared link never 404s, it *upgrades*
  to the better clip. A VAR-removed clip resolves **410**; a never-minted id
  **404**. The shareable unit is the `share_id`, not the object path.

**Consequences.**

- Placeholders until they land found-footy-side (approved handoff, sequenced
  behind their cutover + DB rebuild): `assist` (forward-only, no backfill),
  event lifecycle `phase` (+`debounce_count`), `event.rank_recalculated`
  emit + `share_id`, and a grace-TTL on superseded bytes. Logos and HT/ET/pen
  score breakdown are dropped (mono redesign won't show them).
- **Prod stays Pattern A** (Python + Mongo/MinIO) — do NOT flip found-footy
  prod to Go before the BFF NATS subscriber + this shim are proven, or the
  public site's footy page goes dark.
- Next layers on this shim: the NATS→SSE coalescing bridge, then real
  `/dates`/`/search` synthesis, then slot in `phase`/`assist` when found-footy
  ships them.
- **Networking:** Garage joins `luv-{env}` — the shared cross-project network,
  same as every other consumable backend (spin-cycle/long-exposure postgres,
  found-footy's Go api). vs reaches Garage there; the `garage:3900` presign host
  resolves over `luv-dev`. (Briefly hacked around this by joining found-footy's
  private net — reverted; that's the coupling `luv-{env}` exists to prevent.)
  **Prod follow-up:** add `luv-prod` to the prod Garage service when Go prod deploys.

---

## 2026-08-15 — found-footy prod cutover to Pattern B (Go API + NATS + Garage)

**Context.** The 2026-08-13 shim proved out in dev — fixtures, search, assist,
`phase`, download, share_id, and the NATS→SSE bridge all consuming the found-footy
Go read API. found-footy then stood up its Go **prod** stack (`found-footy-prod-api`,
`found-footy-prod-garage`, workers), clearing the "don't flip prod before Go prod is
up, or the footy page goes dark" gate from the 2026-08-13 entry.

**Decision.** Flip `vedanta-systems-prod` to Pattern B. The prod api env swaps the
direct Mongo/MinIO config for `FOUND_FOOTY_API_URL=http://found-footy-prod-api:8081`
+ `NATS_URL=nats://nats:4222`; `NODE_ENV=production` scopes the NATS subscription to
`found-footy.prod.>` (one shared broker serves both envs, so subjects carry an env
token — `found-footy.<env>.<domain>.<event>`). Redeployed with
`docker compose -f docker-compose.yml up -d --build`.

**Consequences.**

- Prod's footy page is now the same shim path proven in dev: Go REST → reshape,
  NATS live feed, share_id video re-proxy. Direct Mongo/MinIO reads are gone; that
  env is removed from the prod api service.
- **Garage on `luv-prod` is load-bearing** and was the last blocker. The video path
  follows the Go API's 302 to a presigned `garage:3900` URL, which only resolves if
  `found-footy-prod-garage` is aliased `garage` on `luv-prod`. The pre-deploy gate
  caught it (`garage:3900` was "bad address" from vs-prod-api); found-footy added
  `luv-prod` to the prod Garage service and it cleared. Before any future prod Garage
  change, check `docker network inspect luv-prod | grep garage`.
- NATS broker is **open mode** (no creds) — env isolation is by subject, not account.
  If accounts/creds land later, the prod api needs a `vedanta-systems` creds file;
  until then, none.
- Verified live at cutover: public `200`, shim health `healthy`, fixtures from Go
  prod, NATS bridge connected. First real clip end-to-end (share_id → 302 → garage →
  bytes) is pending prod's first minted clip; the path is confirmed reachable.

---

## 2026-08-16 — Keep the GitHub contribution credential behind the BFF

**Context.** The contribution graph called GitHub GraphQL directly from the
browser with `VITE_GITHUB_TOKEN`. Vite embedded the fine-grained PAT in the
production JavaScript, where any visitor could retrieve it. The exposed token
was revoked. The animation also fetched GraphQL at the start of every wave, so
each visitor multiplied upstream traffic.

**Decision.** Move contribution retrieval to
`GET /api/github/contributions` in vs-api. The route is fixed to
`vedantadhobley`, authenticates with a server-only `GITHUB_TOKEN`, projects
the response to date/count/level, caches it for 15 minutes, coalesces concurrent
refreshes, and serves stale data after an upstream failure. The token is a
classic PAT with only `read:user` so the calendar includes publicized private
counts without repository-content or write access. The browser refreshes the
BFF independently of its decorative wave. Production source maps are no longer
published.

**Consequences.**

- GitHub credentials belong only in the API service's gitignored `.env`; a
  secret must never use the `VITE_` prefix or enter a frontend build argument.
- The public endpoint exposes only the same aggregate calendar counts already
  visible on the public GitHub profile. It cannot select another user or proxy
  arbitrary GraphQL.
- Token rotation requires replacing `GITHUB_TOKEN` and recreating the API
  container. The frontend does not need rebuilding for token-only rotation.
- A page view no longer consumes GitHub rate limit per animation cycle; all
  visitors share the API cache.

---

## 2026-08-18 — Keep video controls custom and recover failed autoplay

**Context.** The found-footy modal made one post-mount `video.play()` attempt
after setting `muted` in an effect, then discarded any rejection. Chrome on
Ubuntu and Windows intermittently entered a frozen playing state. Chrome and
Safari on iPhone reproduced it more consistently, including from shared links.
Users had to press pause and then play to reset the media session. The byte-range
proxy and the reported MP4 were healthy; both ordinary and shared-link playback
used the same inherited modal.

**Decision.** The video element declares `autoplay`, `muted`, and `playsinline`
at initialization. Native controls start hidden and appear after a deliberate
tap or click on the video; the existing custom unmute button remains available
before that interaction. The modal proves progress through `playing` and
`timeupdate`, performs one automatic muted pause/play reset when the timeline
remains frozen, and then exposes a custom play/retry overlay if playback still
needs a user gesture.

**Consequences.** Successful autoplay remains visually clean until the user
asks for controls. Browsers that reject or falsely report playback no longer
leave an inert player or require an undiscoverable pause/play sequence.
Playback rejection and media error details remain visible in the console.
Shared links and ordinary clip clicks follow one recovery contract.

---

## 2026-08-19 — Preserve deliberate pauses in the video watchdog

**Context.** The autoplay recovery watchdog initially treated every stationary
timeline as stalled. After native controls were revealed, a deliberate pause
therefore triggered the automatic pause/play recovery four seconds later.

**Decision.** A timeline is eligible for stall recovery only while the media
element reports that it is playing and is not seeking. Paused and seeking media
refresh the watchdog baseline without triggering recovery. Rejected autoplay
still exposes the manual play action, and a browser that reports
`paused === false` without advancing still receives the one automatic reset.

**Consequences.** Native controls retain normal pause semantics without
weakening the original false-playing recovery path.

---

## 2026-08-19 — Adapt video controls to the active input modality

**Context.** Native video controls initially stayed hidden until a click or tap.
That is appropriate for touch, where movement is normally a scroll or gesture,
but desktop users expect controls to surface as soon as they move a mouse over
the picture. Classifying an entire device as mobile or desktop would mishandle
touch-capable laptops and pointer changes during a session.

**Decision.** Reveal native controls on a video `pointermove` only when the
active pointer reports `pointerType === 'mouse'`. Preserve the deliberate click
or tap path for all inputs, and reveal the controls when keyboard focus reaches
the video. Use input capabilities and the current pointer event instead of
viewport width or user-agent detection for interaction behavior.

**Consequences.** An idle mouse does not reveal controls merely because a modal
opened beneath it. Actual mouse movement does. Touch scrolling and movement do
not expose controls, while a deliberate tap still does. Hybrid hardware follows
the input currently in use.

---

## 2026-08-19 — Re-found the frontend through complete route slices

**Context.** The visual exploration established a useful two-plane material
model, but two shell-first prototypes failed and the instrument workbench did
not address the production runtime. The frontend audit then found stale live
state across day boundaries and SSE gaps, globally mounted project providers,
unprotected request ordering, structural accessibility faults, and continuous
render work. These are architecture and component-contract problems, not
evidence that React is the wrong framework.

**Decision.** Retain React, Vite, and React Router for the first migration.
Re-found the frontend through complete route slices, beginning with Found
Footy. Each slice combines route-owned data, REST snapshot plus SSE
reconciliation, input and accessibility primitives, and the source-owned
two-plane component system. The current production interface is the behavioral
baseline until the complete route passes its gates.

shadcn is no longer the target component API, but existing shadcn/Radix-derived
uses stay until replaced by a proven source-owned primitive. Tailwind remains a
provisional layout and responsive-composition tool; reassess it after the
Found Footy slice instead of removing it as preliminary work. Keep the
component system in this repository until a second real consumer justifies a
package.

**Consequences.**

- The active plan is `docs/plans/frontend-refoundation.md`. The previous
  `frontend-redesign.md` is a visual exploration log, not a migration plan.
- Found Footy correctness work and its visual migration are one vertical slice;
  neither waits for a global shell rewrite.
- Project code, providers, requests, and streams move to one lazy route
  boundary. Only true preferences remain global.
- Every disconnected-to-live transition reconciles an authoritative REST
  snapshot before SSE connection is treated as current.
- No framework upgrade, dependency purge, package extraction, or navigation
  redesign is implied by this decision.

---

## 2026-08-19 — Add a dormant sequence-aware multi-node btop bridge

**Context.** The current btop path duplicates luv collectors by environment
and runs joi's btop remotely over SSH from two luv containers. The joi path
died after joi moved to NixOS and the compute VLAN. The cross-project
[native-agent decision](../../../vedanta-dhobley/docs/decisions/2026-08-19-btop-node-agents.md)
replaces that topology with one local agent per physical node and Core NATS
fan-in through this BFF.

**Decision.** Add `src/server/routes/btop.ts` as a second, dormant transport
path. It subscribes to `btop.*.frame`, validates the workspace envelope,
reconstructs one in-memory frame per node, and serves
`/api/btop/<node>/{health,stream}` using the browser's existing full/delta
format. A delta is accepted only when its publisher session matches and its
sequence is contiguous. A gap marks the node unsynchronized until a full
frame arrives.

Keep the existing `/api/btop-{luv,joi}` HTTP proxies and all current tile
configuration during the migration. Do not apply the unfinished two-plane
visual system as part of the transport work.

**Consequences.** The BFF can consume future native agents without another
browser protocol rewrite. The new path has no production effect until a tile
switches to it. The legacy path is removed only after luv and joi prove
startup, stale-state, reconnect, sequence-gap, and periodic-full recovery.
The configured node inventory preserves honest offline state for powered-down
nodes, while frame discovery admits newly deployed nodes. Public requests
cannot allocate arbitrary node caches. Subscriber credentials can be mounted
through `BTOP_NATS_CREDS` when the secured compute-interface listener lands.

---

## 2026-08-19 — Route native btop streams through owning control planes

**Context.** The first multi-node design let each node agent publish directly
to NATS. That bypassed the existing joi and Nexus control-plane boundary and
would have required exposing NATS plus distributing broker credentials to
every monitored node.

**Decision.** Each native btop agent exposes private HTTP/SSE on its compute
network. Its owning control plane consumes and reconstructs that stream,
assigns the canonical session and sequence, and publishes
`btop.<node>.frame` through Core NATS. joi-control-plane owns joi;
nexus-control-plane owns the Nexus workers. The luv path uses the same relay
contract locally. Agents and browsers never receive NATS credentials.

This supersedes only the publisher boundary in the preceding dormant-bridge
decision. The subject, envelope, frame schema, BFF reconstruction, sequence-gap
handling, and same-origin browser SSE remain valid.

**Consequences.** NATS stays on luv's internal service network. Control planes
can combine transport health with authoritative node lifecycle state, avoid
reconnecting to intentionally powered-off workers, and force a full frame
after either upstream-agent or NATS recovery. Node endpoints require private
compute-network binding and control-plane-only firewall access. The un-deployed
direct publisher in `broadcast-server.py` is a superseded prototype and must
be removed before rollout.

---

## 2026-08-22 — Contain the audited public and container boundaries

**Context.** The full-project audit found a development frontend with host
Docker and SSH access, unrestricted Vite host acceptance, browser-reachable
refresh hooks protected only by exact nginx paths, plaintext edge HTTP,
uncapped long-running containers, weak Long Exposure database defaults, and
two failed joi SSH collectors in permanent restart loops.

**Decision.** The frontend containers join only the project and ingress
networks; only the BFF joins the cross-project data network. The development
frontend has no Docker socket or host SSH mount and accepts an explicit
gitignored hostname allowlist. Caddy redirects edge HTTP and sets the baseline
response headers. nginx, Vite, and the direct dev-API Caddy route overwrite
`X-Vedanta-Public: 1`; Express returns 404 for marked requests to internal
refresh hooks. The obsolete Found Footy webhook is removed because NATS now
owns its refresh hints. nginx retains a path-family block as an earlier defense.

Every portal container receives a memory, swap, and PID ceiling; Node runtimes
also receive heap ceilings. The obsolete joi SSH collectors are opt-in through
the `legacy-joi` profile and remain stopped. Long Exposure credentials are
required Compose inputs with no checked-in password fallback; the owning
Long Exposure runtime also fails fast when its events password is absent.

**Consequences.** A normal Compose start cannot silently restore the risky
development mounts, restart the failed joi collectors, or connect Long
Exposure through a checked-in fallback. Browser traffic cannot invoke internal
refresh hooks through any declared ingress path. Credential rotation still
requires a coordinated database-role update and recreation of every consumer.
Rewriting the public Git history that contains the revoked PAT remains a
separate, deliberate recovery operation.

---

## 2026-08-23 — Separate media buffering from playback failure

**Context.** Found Footy's startup watchdog treated four seconds without
timeline movement after `HAVE_CURRENT_DATA` as a stalled player. That state is
also ordinary buffering, so the application could interrupt a healthy stream
with pause/play and then cover native playback with a misleading **Play
video** action. Global `touch-action: pan-y` and a page-level iOS `pagehide`
handler also interfered with browser ownership of native media.

**Decision.** Keep muted inline autoplay and one startup-only false-playing
recovery. Require future buffered media, a non-loading network, no seek, no
observed timeline progress, and hidden native controls before that recovery is
eligible. A rejected `play()` exposes **Play video**; a media element error
exposes **Retry video**; buffering exposes neither. Once controls appear, the
browser owns play, pause, and seek. Remove the global touch-action restriction
and the page-level code that cleared video sources. Synchronize custom mute
state from native `volumechange`.

**Consequences.** Normal startup delay and mid-play buffering no longer cause
an application reset or recovery overlay. The old Safari false-playing case
still has one automatic reset and a gesture-bound fallback. Physical iPhone
Safari and Chrome tests remain the release gate for native scrubbing and page
lifecycle behavior; this component is not yet the final reusable media
primitive.

---

## 2026-08-23 — Separate fixture process state from presentation state

**Context.** Found Footy activates fixtures before kickoff and keeps some
postponed or interrupted fixtures active so the monitor can poll them quickly.
The portal treated that process bucket as a display category and live-count
source. A postponed match with a recent activation timestamp could therefore
sit above matches with real events and show as live.

**Decision.** Preserve the Go API's `staging`, `active`, and `completed`
process buckets through the BFF. In the browser, classify provider statuses as
playing, finished, upcoming, or deferred. Render in that order within each
competition. Derive live counts only from playing statuses. Put `PST`, `CANC`,
`SUSP`, `INT`, and `ABD` in deferred presentation; keep `SUSP` and `INT`
expandable because they may already contain scores and events. Unknown statuses
fail closed into deferred instead of creating false live state.

**Consequences.** Monitoring behavior does not change. A postponed fixture can
remain on Found Footy's fast poll path while its activation timestamp no longer
affects visible ordering or live counts. The presentation taxonomy is a tested
domain policy shared by normal browsing and search. Carryover visibility and
wake/reconciliation remain separate frontend re-foundation work.

---

## 2026-08-30 — Consume backend-owned fixture presentation and targeted live hints

**Context.** The portal previously received API-Football status codes, rebuilt
their taxonomy in React, stored fixtures in Found Footy's processing buckets,
and converted structural fixture and video hints into full-window refreshes.
That duplicated provider policy, let period transitions trigger reordering,
amplified reads, and left non-replaying SSE/NATS gaps after reconnect or mobile
sleep.

**Decision.** Adopt Found Footy FF-077 as a coordinated breaking contract. REST
and `fixture.status` share the backend-owned `presentation_state`, nullable
`clock`, provider `status`, and `display` projection. Provider status codes are
opaque display data in this repo. React stores one fixture collection and uses
`presentation_state` as its sole grouping classification. Inline status/time
messages patch in place; coalesced `fixture.update` IDs resolve through a
targeted fixture read; `event.video` resolves through a targeted event read.

Retain full REST reconciliation for initial setup, browser/SSE/NATS recovery,
page restore, online, deliberate stream resume, midnight, and timezone-mode
change. Model live versus pinned date intent separately; any selection of today
follows live, while another date pins. Keep every playing carryover fixture
visible in the live view. Abort superseded snapshots and
replay live messages that arrive during a snapshot before declaring its state
current.

The shared NATS contract replaces `fixture.clock` with `fixture.status`; no
permanent compatibility path exists. This frontend, Found Footy producer, and
shared schema must deploy together.

**Consequences.** The backend is the sole owner of provider-status meaning.
Half-time and other within-group transitions no longer fetch or reorder the
window. Structural work scales with changed fixture IDs, while video placement
scales with one event. Mobile wake after midnight follows the new live day;
explicitly pinned history remains pinned and revalidates. This supersedes the
browser-owned provider taxonomy in the 2026-08-23 decision while retaining its
separation between processing and presentation state.

---

## 2026-08-30 — Make the document the mobile scroll and viewport owner

**Context.** The portal locked `html` and `body` to the dynamic viewport and
scrolled a fixed inner container. This prevented mobile browser chrome from
following ordinary page scroll. `viewport-fit=cover` exposed the physical
screen but the shell applied no safe-area insets, so an installed iPhone app
could place its header beneath the status bar or Dynamic Island. Found Footy
and Spin Cycle also retained their largest historical content height through a
phantom spacer. That height had no bounded lifetime and could leave growing
blank scroll range.

**Decision.** Use normal document scrolling as the sole page scroll boundary.
Let native scroll anchoring handle disclosure changes first; any future custom
anchoring must be scoped to one interaction and must not preserve impossible
empty height. Apply CSS safe-area environment values to the header, content
gutters, fixed bottom navigation, and document terminus. Restore browser zoom
and selection. Publish a web app manifest with `display: standalone`; retain a
black full-bleed background while keeping interactive content inside the safe
area.

**Consequences.** iOS Safari and Chrome may minimize their browser UI in
response to document scroll, but a normal tab cannot command or permanently
hide that UI. An installed home-screen app has no browser toolbar, while the
iOS status bar remains and is accommodated by the shell. The obsolete
render-phase height measurement, keyboard `scrollTop` timer, and phantom
spacer are removed. Physical iPhone testing remains the acceptance gate for
dynamic bars, installation, disclosure context, and keyboard behavior.

**Deployment status (2026-08-30).** The owner authorized production deployment
before the physical-device pass. Production runs frontend source `2ef3ba5`
with bundle `index-zClZ8SA7.js`. The portal, manifest, API, and Found Footy
health checks pass; physical iPhone behavior is validating.

---

## 2026-08-30 — Preserve disclosure position with transient scroll space

**Context.** The preceding mobile-shell change correctly removed the fixed
inner scroll container and the route-lifetime content-height maximum. It also
removed an intentional interaction: a collapse left temporary dead space so
the browser did not clamp the page or snap the user's viewport. Native scroll
anchoring does not provide that contract.

**Decision.** Keep the document as the sole scroll owner. Before an explicit
Found Footy or Spin Cycle disclosure change, capture the real document height
and scroll position. After React commits the change, retain exactly the height
removed by that transition and restore the captured position before paint. Do
not trim that space during the transition. On later document scroll events,
reduce it to only the portion still required by the current viewport; expansion
may also consume it. Do not use a route-lifetime high-water mark, render-phase
measurement, or unannounced spacer growth.

**Consequences.** Collapse keeps the page visually stationary and the resulting
dead space disappears as the user scrolls away. The mechanism remains compatible
with iOS document scrolling and cannot accumulate the largest height seen across
unrelated route states. This supersedes only the native-anchoring disclosure
clause of the preceding decision; its viewport, safe-area, zoom, and manifest
choices remain in force. Physical iPhone verification remains required.

**Deployment status (2026-08-30).** Production runs frontend source `3b2c8c6`
from image `sha256:62047f49637576a9ca669fd929196d41951969fd77fc611ae0051bf99a7c3e38`
and serves bundle `index-Dq67Ahc6.js`. Only the frontend container was
recreated with `--no-deps`; the API container retained its existing identity
and start time. The public portal, bundle, API, and Found Footy health checks
pass. Physical iPhone disclosure behavior remains validating.

---

## 2026-08-30 — Release retained space only after it leaves the viewport

**Context.** The first transition-scoped replacement reduced its spacer on
every scroll event. Each upward movement shortened the document by the same
amount and left the user pinned to its new maximum, so reversing direction
could not scroll down. Mobile browser-bar resizing could trigger the same path.
Date navigation also bypassed the disclosure hook even though its fixture
region changes height below an otherwise stable control region. Short pages
still allowed elastic vertical movement on mobile despite having no overflow.

**Decision.** Keep the full transition spacer while any part of it intersects
the viewport. Release it in one step only after its top edge is at or below the
viewport bottom; removal then changes no visible geometry. Suppress native
scroll anchoring during the React disclosure handoff. Apply vertical
`overscroll-behavior: none` without disabling normal document scrolling. Route
explicit Found Footy date actions through the same pre-layout capture and close
their old disclosure state in that commit. The advisory and date selector form
the stable upper boundary; fixture content below them is the variable region.

**Consequences.** A user can reverse direction normally while retained dead
space remains visible. Mobile browser chrome cannot progressively consume that
space, short routes do not rubber-band, and date or disclosure changes keep the
stable controls at the same viewport coordinates. The route-lifetime high-water
pattern remains prohibited.

**Deployment status (2026-08-30).** Production runs frontend source `cf93eba`
from image `sha256:03356e2077346417df5e89181334a497264d8c08944838165a08db71afbb7d54`
and serves bundle `index-B39lHdz7.js`. Only the frontend container was
recreated with `--no-deps`; the API container retained its prior image and
start time. Public Chrome assertions pass for short-route overflow, reversible
collapse scrolling, and date-boundary stability through snapshot settlement.
The portal API and Found Footy health checks pass. Physical iPhone browser-bar
behavior remains validating.

---

## 2026-08-30 — Keep vertical document scrolling unconstrained

**Context.** Applying `overscroll-behavior-y: none` to both `html` and `body`
prevented trusted desktop wheel input from advancing the production document,
despite measurable vertical overflow. A runtime comparison restored wheel
scrolling immediately when both declarations returned to `auto`. The rule was
introduced to suppress elastic movement on short iOS routes, but it changed the
global scroll owner and broke content-rich routes.

**Decision.** Remove the global vertical overscroll declarations. Keep only the
horizontal overscroll constraint. Do not solve short-route bounce, standalone
safe-area composition, or bottom-navigation geometry by constraining the
document's vertical scroll behavior. Those concerns belong to the shared shell
and must preserve native wheel, touch, keyboard, scrollbar, and browser-chrome
behavior.

**Consequences.** Desktop scrolling works again. Short-route elastic movement
remains an explicit shell redesign concern rather than a global CSS side effect.

**Deployment status.** Staged, not deployed.

---
