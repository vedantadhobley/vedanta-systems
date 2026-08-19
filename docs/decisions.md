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
