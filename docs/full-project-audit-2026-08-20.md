# Full-project audit — 2026-08-20

This is the first whole-project Codex audit of `vedanta-systems`. The earlier
[frontend audit](./frontend-audit.md) remains a useful focused review, but it
explicitly excluded the Express BFF, upstream APIs, deployment, infrastructure
security, and documentation correctness.

This document is a dated evidence record. It does not replace the living
[architecture](./architecture.md), [todo list](./todo.md), or project plans.

## Scope

The audit covered:

- React routes, providers, media behavior, input modalities, accessibility,
  responsive layout, and rendering cost;
- Express routes, REST/SSE contracts, upstream failure handling, health
  reporting, and public/internal boundaries;
- Dockerfiles, Compose topology, live container state, public routing,
  dependency posture, and source/deployment drift;
- project documentation plus the cross-project contracts this repository
  imports from dhobley, proxy, NATS, btop, joi, and Nexus.

The audit was read-only. It did not deploy, mutate databases, SSH to another
node, run load tests, or test remote firewall reachability.

## Assessment

React, Vite, and React Router remain suitable. The current problems do not
justify a framework rewrite. The largest risks come from weak deployment
boundaries, live-data lifecycle ownership, and source-of-truth drift.

The operational layout is still a useful behavior baseline for the future
component system. The two-plane visual language is not ready for production
application and is not part of the current btop transport work.

## Immediate containment

### Production Long Exposure uses a weak fallback database credential

Both Compose files construct the Long Exposure URI with a built-in user and
password fallback. Live inspection confirmed that the production API uses the
fallback and the database accepts it.

Required action:

1. rotate the Long Exposure database credential;
2. put the new value in the gitignored service environment;
3. replace the Compose fallback with required `${VAR:?}` inputs;
4. keep `.env` mode `0600` rather than its audited `0644`.

**Resolution (2026-08-23).** The owner deliberately retained the private-node
`leuser`/`lepass` convention. The credential is now explicit only in both
gitignored environments, Compose has no fallback, both files are mode `0600`,
and both portal API consumers were recreated. Pattern B will remove this
database credential from the portal rather than treating this convention as
suitable for a public or cross-node database.

### The development frontend has host-equivalent access

The root-running Vite container mounts the Docker socket read-write and the
host SSH directory read-only. It is reachable through Caddy, accepts every
host name, and joins the shared development network. A compromised development
dependency or server route could control Docker and read SSH credentials.

Remove both sensitive mounts. Restrict Vite's allowed hosts to the documented
development host. The frontend does not need the shared project-data network.

### Public plaintext HTTP is served without redirect

The public Caddy route explicitly serves `http://vedanta.systems`. A live HTTP
request returned `200` instead of redirecting to HTTPS. HTTPS responses also
lacked HSTS, CSP, `X-Content-Type-Options`, a referrer policy, and a frame
policy.

Make public HTTP redirect to HTTPS. Add a measured security-header policy at
the owning proxy/ingress layer. The current large inline bootstrap script must
be removed or given a nonce/hash before a strict CSP can land cleanly.

### Legacy btop exporters expose an overprivileged host service

The live luv exporters bind unauthenticated HTTP/SSE to every host interface.
They also run with host networking, host PID visibility, privileged mode,
host-root access, and GPU devices. A direct unauthenticated request returned a
large terminal frame. Firewall reachability from outside the node was not
verified, but the service itself enforces no caller or interface restriction.

Bind the replacement exporter only to its private compute interface, admit
only its owning control plane, and test which privileges can be removed. Do
not expose the node exporter to browsers or give it NATS credentials.

Both legacy joi collectors are also in restart storms while unable to connect
after the joi migration. Disable those obsolete services until the native
exporter path is ready.

### Open NATS does not enforce environment or publisher identity

The shared broker currently allows every container on its development and
production networks to publish and subscribe to every subject. Found Footy
uses a subject token to select an environment, but the broker does not enforce
that boundary. A compromised development or production container can forge
events for the other environment.

Introduce NATS accounts or scoped users. A Found Footy BFF should subscribe
only to its environment. Each control-plane btop relay should publish only its
owned node subjects. The vedanta-systems BFF should have subscribe-only btop
access.

### Internal refresh paths are not fully blocked

Production nginx denies exact `/api/found-footy/refresh` and
`/api/spin-cycle/refresh` paths. Express accepts the trailing-slash variants by
default, so the exact nginx locations do not enforce the stated boundary.

Block the complete path family at nginx and enforce authorization at the
Express boundary. Remove a webhook when NATS has made it obsolete.

### Public Git history and live source have diverged

The revoked GitHub PAT remains in public history and must be treated as
permanently disclosed. Revocation removes its active authority; history still
triggers scanners and should be cleaned only through a deliberate coordinated
rewrite.

The public default branch also retains the old client-token architecture while
the server-only contribution route and later work exist only in local commits.
A fresh build from the public recovery source would regress. Local `main` was
already far ahead before this audit, so do not blindly push it. Reconcile the
intended history and upstream branch deliberately.

## Live-data correctness

### Found Footy loses live intent at midnight

The provider represents “following live” as `selectedDate === getToday()`.
After midnight, yesterday no longer equals today, so wake handling neither
advances the view nor refreshes the pinned date. The renderer separately
filters active fixtures by kickoff date, so a match that continues after
midnight can freeze on yesterday and disappear from the new day's view.

The intended model has two independent values:

- `selectedDate`: the date the route renders;
- `dateIntent`: `live` or `pinned`.

Live mode advances at the active timezone's midnight and always includes
active carryover fixtures. Pinned mode preserves its selected date and still
revalidates after a disconnected interval. The complete current and target
contract is in [Found Footy live data](./found-footy-live-data.md).

### SSE reconnection does not reconcile missed state

Found Footy and Spin Cycle reopen EventSource after an error without first
fetching an authoritative snapshot. Found Footy also pauses its stream for a
video and resumes without reconciliation. Core NATS and browser SSE are
ephemeral, with no replay ID or durable cursor.

An open connection proves only that future messages can arrive. Every initial
entry, reconnect, wake, `pageshow`, `online`, timezone change, and deliberate
resume must reconcile REST before the UI declares itself current.

### Transport, upstream health, and freshness are conflated

Found Footy and Spin Cycle parse REST bodies without first checking `res.ok`.
A JSON error response can therefore become empty arrays followed by a green
online state. Both providers also treat an open EventSource transport as proof
that the upstream data source is healthy. Spin Cycle ignores the actual SSE
health payload.

Model these independently:

- stream transport: connecting, open, retrying, closed;
- upstream service health: healthy, degraded, unavailable, unknown;
- snapshot freshness: loading, current, stale, failed;
- retained data: last valid snapshot, never replaced by an error-shaped body.

### Requests do not protect current user intent

Found Footy date loads, available-date loads, search, and shared-event lookup
can commit after a newer request. Failed search can leave results from a prior
query visible. Long Exposure guards unmounting but does not cancel transport.

Use `AbortController` plus request-generation identities keyed to route,
selected date, timezone, and query. Stale asynchronous work must not overwrite
newer intent.

### Route-unowned work remains active

Found Footy and Spin Cycle providers mount above the router. Their fetches and
SSE connections can run while another route is visible. The contribution graph
also mounts on every route; its wave clock continues while hidden.

Lazy-load each project surface and mount its provider at the owning route.
Pause decorative work when hidden or offscreen and provide a reduced-motion
steady state.

### Current Found Footy snapshots amplify upstream reads

The browser loads the selected UTC date plus both adjacent dates. Each BFF date
request independently fetches the full Go API fixture window and filters it
locally. One browser snapshot therefore causes three complete upstream-window
reads, and every coalesced refresh repeats them.

Add a short BFF snapshot cache or expose one window endpoint that the client
buckets once. Preserve REST as the source of truth.

### Long Exposure has no revalidation lifecycle

Long Exposure loads its date index and latest day once. A tab left open across
the nightly pipeline remains stale. Week navigation can also enter dates that
do not exist and leave day navigation in an invalid state.

Join Long Exposure to the shared route lifecycle contract. Daily cadence may
use a cheap latest-version check rather than a permanent SSE connection.

## Confirmed application defects

- Spin Cycle's first claims/full-text toggle can leave the rendered view
  unchanged because the display default and toggle default disagree.
- Spin Cycle verdict precedence can allow `true` to override `false` in an
  overlapping highlight.
- A failed Spin Cycle claim-detail request renders an indefinite false loading
  state.
- The bootstrap script starts the React root at `opacity: 0` and performs
  unguarded storage and JSON operations before installing the reveal class. A
  denied storage operation or malformed value can leave the app blank.
- Long Exposure's timeline is mouse-only and hardcodes UTC-4 rather than using
  `America/New_York` rules.
- Native video volume changes update storage but not the React mute state, so
  the custom unmute affordance can disagree with native controls.
- The page-level iOS `pagehide` handler clears video sources behind React and
  can break back-forward-cache restoration.
- Shared Found Footy lookup and search mask upstream outages as successful
  “not found” or empty results.
- Long Exposure returns raw PostgreSQL error messages to public clients and
  accepts impossible calendar strings far enough to reach PostgreSQL.
- Long Exposure event, daily, and weekly queries do not consistently require
  `verifier_passed = true`; confirm the intended publication invariant before
  changing queries.
- The OG server interpolates an unvalidated share ID into HTML attributes. A
  harmless production probe confirmed attribute injection in bot-only markup.

## BFF and SSE resilience

- Found Footy and Spin Cycle add an SSE response to their client set, await an
  initial health check, and only then attach close cleanup. A disconnect during
  the await can leak the response and heartbeat.
- SSE fan-out ignores `res.write()` backpressure. There is no connection
  ceiling or public rate limit. Large btop frames make this material.
- Public Found Footy, GitHub, and OG upstream fetches have no deadlines. SQL
  pools have connection timeouts but no statement timeout.
- The global health route always reports `ok`; it is endpoint discovery, not
  aggregate readiness. Project routes also disagree about whether degraded
  health uses HTTP 200 or 503.
- Spin Cycle can leak a PostgreSQL pool client when its health query fails
  after checkout because release is not in `finally`.
- The dormant NATS-backed btop store creates state for any valid node slug.
  `BTOP_NODES` currently seeds display entries but does not act as an allowlist,
  contrary to the documented target contract.

## Container and dependency posture

- No audited project container has a memory limit, PID limit, or Node heap
  ceiling. This violates the workspace memory contract and leaves SSE queue
  growth unbounded.
- All live project services run as root with writable root filesystems.
- Node 18 is end-of-life, but every Node Dockerfile still uses it.
- `npm audit --omit=dev` reported 24 advisories: one critical, 11 high, and 12
  moderate. These are dependency advisories, not proof that every path is
  remotely reachable.
- The critical XML-parser path enters through unused `minio`; `mongodb` is also
  declared but unused after the Found Footy Pattern-B migration.
- The API image installs the frontend and development dependency graph to run
  TypeScript through `tsx` in production.
- The frontend Dockerfile falls back from `npm ci` to `npm install`, weakening
  lockfile reproducibility. Base images are floating tags, and the btop image
  downloads a font archive without a checksum.
- The production frontend unnecessarily joins `luv-prod`; the development
  frontend similarly joins `luv-dev`.
- Frontend and API services lack Docker healthchecks. `depends_on` orders
  startup but does not establish readiness.
- The dev API runs `npm install` on every start against a read-write worktree
  bind mount.
- Vite advertises HMR on port 4100 even though Compose and Caddy do not expose
  that port.
- The production API predates the dormant btop router. Current source and live
  production behavior must not be described as identical until deployment.

## Frontend performance and accessibility

- The production main JavaScript bundle is about 1.36 MB minified and about
  398 KB gzip. Every project surface and heavy viewer is statically imported.
- The built public tree is about 32 MB and includes a disabled 24 MB moon
  video plus a broad set of font files.
- The contribution wave performs repeated React state updates and can run at
  60 fps while hidden.
- Browser zoom is disabled. Safe-area insets are not applied despite
  `viewport-fit=cover`. Global CSS disables text selection and iOS callouts.
- Breadcrumbs, contribution links, project disclosures, dialogs, Spin Cycle
  pseudo-buttons, loading/status messages, timezone control naming, and the
  btop terminal grid have structural accessibility gaps.
- Reduced motion does not cover all project status, loading, scan, and
  contribution animations.
- API and SSE payloads have TypeScript declarations but no runtime decoding.
  One malformed payload can escape into the single route tree, which has no
  route error boundary.
- No frontend interaction test harness exists. Strict Mode remains disabled
  because provider effects are not replay-safe.
- Google Fonts and an unpkg PDF worker are runtime dependencies despite local
  copies or local-first alternatives.

## Documentation findings

- `.env.example` did not describe the current Compose inputs and retained
  retired Found Footy Mongo/S3 settings.
- Project status described the frontend visual slice as active even though
  btop transport is current and visual application is paused.
- “Node agent” obscured the boundary between the btop exporter and the owning
  control-plane relay.
- The btop source branch named as authoritative existed only in a temporary
  checkout; source ownership is not operationally durable yet.
- The btop document mixed legacy deployment, target transport, source-patch
  history, and workbench detail beyond the repository's preferred document
  size.
- Found Footy's timezone document stated intended all-active visibility as if
  it were current behavior.
- Proxy conventions still described Found Footy as Pattern A with no API and
  Long Exposure as Pattern B, the reverse of current behavior.
- NATS schema documentation omitted the environment token from one displayed
  Found Footy subject family even though schemas and golden messages include
  it.
- Deploy notes described untracked host Cloudflare configuration as the source
  of truth and claimed production needed no CORS, while Express enables
  wildcard CORS globally.
- The earlier frontend audit incorrectly called Tailwind hover variants
  unscoped. `hoverOnlyWhenSupported` already gates generated hover variants;
  duplicated component-level pointer state remains the real issue.

## Verified strengths

- TypeScript type-check passed.
- Production Vite build passed.
- Both Compose files validated.
- The btop route test and six exporter Python tests passed.
- Main public routes and API health/data endpoints responded successfully,
  except the already-known joi btop path.
- Found Footy's server-only GitHub contribution route contains no active PAT in
  current source or the built artifact.
- The autoplay recovery state machine passed type-check/build review and the
  prior targeted browser pass. This audit found follow-up state synchronization
  work, not a reason to revert it.
- The docs index covered every file already inside `docs/`, and its local links
  resolved except one stale anchor in the visual exploration plan.
- The append-only decision log correctly preserves the autoplay and input-
  modality decisions.

## Verification record

Run on 2026-08-20:

- `npm run type-check`: passed;
- production Vite build to a temporary output directory: passed;
- `npm run test:btop`: passed;
- `npm run test:btop-agent`: six tests passed;
- production and development `docker compose config --quiet`: passed;
- repository lint: existing baseline of 44 errors and 10 warnings;
- production dependency audit: 24 advisories;
- live production HTTP, headers, health routes, SSE initial frames, container
  caps/mounts, listeners, versions, logs, and restart counts: inspected.

Physical iPhone Safari/Chrome certification, load testing, base-image CVE
scanning, and remote firewall verification remain outstanding.

## Remediation order

1. Contain the credential, dev-container, HTTP, refresh-path, exposed btop,
   restart-storm, and upstream-recovery risks.
2. Harden the btop allowlist and SSE resource lifecycle before deploying the
   dormant NATS consumer.
3. Complete the private exporter to control-plane relay to scoped-NATS path,
   then remove the legacy host-port collectors.
4. Implement one shared snapshot/SSE/resume contract, beginning with Found
   Footy carryover behavior and then Spin Cycle and Long Exposure.
5. Route-scope project code and work, add runtime validation and interaction
   tests, and remove the production bootstrap/debug mutations.
6. Resume two-plane component application only after its design contract is
   ready. Preserve the current production information architecture as the
   behavior baseline.
