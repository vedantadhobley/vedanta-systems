# btop Integration

Real-time system monitor displayed on vedanta.systems using a public-display
btop build, a terminal-frame encoder, the Express BFF, and CSS Grid rendering.

## Current and target state

Production still uses the legacy deployment described below:

- only the legacy production luv collector remains, on host port 3102;
- the duplicate dev luv collector and both obsolete SSH joi collectors were
  removed from Docker and Compose on 2026-09-10;
- legacy Express proxies remain for the old public bundle until cutover.

The normal dev page at `/workspace/vedanta-systems` now points both tiles
at `/api/btop/{luv,joi}`, backed by native exporters on each node and their
Control-owned relays on luv through workspace NATS. Joi's separate Docker
project is activated by NixOS; its private listener admits only luv. Layout
and colors are unchanged. The public frontend has not switched. See
[browser acceptance](./btop-browser-acceptance.md#private-phone-preview).

The replacement keeps the existing browser frame format but changes the
collection topology:

```text
one native btop exporter on each node
  -> private HTTP/SSE (Unix socket on luv; compute network on remote nodes)
  -> owning control-plane relay
  -> Core NATS btop.<node>.frame events
  -> vedanta-systems BFF reconstructs current node frames
  -> same-origin /api/btop/<node>/stream SSE
  -> existing CSS Grid renderer
```

There is one exporter per physical node, with no development/production
duplication. Each node's declared Compose or NixOS configuration owns exporter
deployment: luv uses Compose, joi uses a separate telemetry Compose stack
activated through NixOS, and
Nexus uses its shared `virtualisation.oci-containers` module. The owning
control plane consumes the private exporter stream and publishes canonical
NATS frames. Control planes own node lifecycle, but do not use btop health as
workload readiness. Exporters never connect to NATS or the frontend.

`src/server/routes/btop.ts` subscribes to the NATS subjects and exposes
`/api/btop/{node}/{health,stream}` while the legacy HTTP proxies remain active.
Both dev tiles use this route; production still uses its older bundle.
`BTOP_NODES` is the complete allowed inventory, including powered-off nodes.
Neither NATS publications nor SSE subscriptions can create an unconfigured
node. This bounds inventory; it does not authenticate a publisher on the
currently open broker.
The cross-project ownership and rollout live in the
[multi-node btop plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md).

NATS authentication is deferred until joi becomes the production environment,
per the [workspace decision](../../../vedanta-dhobley/docs/decisions/2026-09-10-defer-nats-authentication.md).
Continue this migration against the existing private, open-mode broker. Keep
optional credential support and isolated tests; do not activate auth overlays
or provision live credentials now. Network reachability remains the broker's
access boundary; node allowlisting does not authenticate publishers.

### 2026-09-10 scoped legacy cleanup

After both native dev feeds passed, remove only
`vedanta-systems-dev-btop-luv`, `vedanta-systems-dev-btop-joi`, and
`vedanta-systems-prod-btop-joi`, plus their Compose declarations. Their images,
historical declarations, host bind contents, and SSH sockets are preserved.
Ports 4102, 4103, and 3103 are retired. No broad image or volume prune ran.

The live public luv collector, its port 3102, embedded source, and proxy routes
remain until public ingress and phone acceptance allow cutover. Control's
common exporter/relay source now lives in `shared/telemetry/`; node deployment
and hardware profiles stay node-owned. The cross-project plan links its
guarded `bin/telemetry` commands and deployment evidence.

### 2026-09-10 pre-deployment inventory

Historical checkpoint, superseded by native activation and cleanup above.
Read-only Docker and service checks confirmed:

- luv remains on Ubuntu. Its two legacy luv collectors still serve the live
  displays. Keep them until the replacement passes acceptance and cutover.
- `vedanta-systems-dev-btop-joi` and `vedanta-systems-prod-btop-joi` are stopped
  on luv, not joi. Both remain declared under `legacy-joi`, with
  `unless-stopped` restart policies and a read-only host SSH-agent socket
  mount. They are known obsolete services, not unidentified orphans. Removing
  either container requires explicit approval; never remove its host socket.
- No btop pilot or temporary BuildKit container remained on luv.
- joi has only its four declared, healthy inference containers, with zero
  restarts and no OOM flags. No btop/tmux process, legacy btop listener, or
  btop service appeared in the checked system and user inventories.
- joi's live inference Compose hash matches the accepted immutable release,
  not the working declaration with pending launch changes. Do not reconcile
  inference as part of telemetry cleanup. Retained rollback and experiment
  images are outside this migration's cleanup scope.

No container, image, host service, firewall, or deployment changed. This is a
dated inventory, not authorization to prune resources or deploy telemetry.

## Source ownership

`~/workspace/btop/vedanta-profiles` is the durable reconciled source checkout.
Control's `feat/btop-telemetry` worktree owns the standing luv exporter and
relay declaration. It is now a live bind-mount dependency; preserve that
worktree until a separate deployment-path migration. Source
state, profile options, legacy patch history, and the packaging gate live in
[btop source and public-display profile](./btop-source.md). This repo's
embedded `btop/src` remains only for the live legacy image.

Control release `2026-09-10.3` uses source `4cf9509` and btop `4aca040` with
immutable registry digests. It serves dev through the workspace broker;
production tiles remain legacy. Candidate `.1` was superseded because its
unregistered theme path silently selected btop's default colors; `.2` fixed
the palette and `.3` added physical profiles and capture supervision.

Joi accepted the same image on 2026-09-10. Native checks passed its 32 cores,
125 GiB RAM, 1.78 TiB root display, 124 GiB GTT ceiling, physical enp191s0
counters, and lavender palette. Exporter stop/start and luv-side relay restart
recovered through the existing BFF. Inference IDs, start times, Compose hash,
and health were unchanged. These checks do not establish Vulkan utilization
accuracy under load or a tested physical reboot. The
[multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md) routes
to Control's exact activation and rollback record.

The luv probe uses read-only statistics without GPU devices or privileged
mode. Two fresh packaged containers pass host-counter, lavender-palette, and
freeze/resume/exit/replacement checks. Freshness requires new terminal output;
repeatedly capturing a frozen screen cannot keep it healthy.

The packaged exporter runs as UID 65534 and serves a mode-0600 Unix socket
inside a mode-0700 runtime volume. The relay mounts that volume read-only and
publishes to the existing open-mode broker. The focused BFF/SSE suite passes,
including reconnect from a full frame. Earlier authenticated tests
remain available for the deferred rollout; live credentials are not required.

The [browser acceptance harness](./btop-browser-acceptance.md) passes in
Chromium and mobile-sized WebKit against the pulled artifacts. It also found
and fixed stale live indicators and unreliable offline-heuristic gating.
The monitor now proves freshness from frames and requires a full frame after
resume. Physical iPhone and final-ingress interruption checks remain before
production cutover. No production collector or public route has switched.

The [phone preview](./btop-browser-acceptance.md#private-phone-preview) now uses
the normal dev page and API with the permanent broker path. The separate UI,
hostname, showcase page, and preview-only Compose overlays are removed.

## Legacy and target capabilities

The live legacy image provides the AMD APU, theme, SSE broadcast, CSS Grid,
read-only, and host-visibility items below. Private exporter transport,
control-plane relay, and canonical cross-node delta sequencing are target-path
capabilities, not features of the deployed legacy image.

- **AMD APU Support**: GTT memory reporting for Ryzen AI MAX+ 395 (Strix Halo)
- **Custom Theme**: Lavender theme matching site aesthetics
- **SSE Broadcast**: Single btop instance, all clients receive same stream
- **Private Exporter Stream**: Node-local HTTP/SSE consumed only by its control plane
- **Control-plane Relay**: Canonical NATS publication and reconnect handling
- **Delta Encoding**: Send changed cells, with a full-frame fallback
- **CSS Grid Rendering**: Deterministic fixed-cell alignment across layouts
- **Read-only**: No keyboard input, display only
- **Host Networking**: Sees real host network traffic

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ btop Container (host network; host PID namespace on luv)    │
│                                                             │
│   btop ──► tmux ──► capture ──► ANSI Parser ──► SSE Server │
│            (132x43)              (Python)        (deltas)   │
└─────────────────────────────────────────────────────────────┘
                              │ remaining legacy host port 3102
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Express BFF                                                 │
│ /api/btop-{luv,joi}/{health,stream} → host-gateway          │
└─────────────────────────────────────────────────────────────┘
                              │ same-origin SSE
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│   BtopMonitor ──► Apply Delta ──► Cell State ──► CSS Grid  │
│   (EventSource)   (merge changes)  (5676 cells)  (render)  │
└─────────────────────────────────────────────────────────────┘
```

### Why This Stack?

| Component | Purpose |
|-----------|---------|
| **btop** | Best-looking TUI system monitor with GPU support |
| **tmux** | Fixed-size terminal (132x43), consistent capture |
| **Python SSE** | Broadcast server with ANSI parsing + delta encoding |
| **CSS Grid** | Deterministic alignment, each character in a fixed 6×12px cell |

### Why CSS Grid over xterm.js?

- xterm.js has variable Unicode character widths causing misalignment
- CSS Grid forces each character into a fixed-size cell
- Scales perfectly on mobile with CSS transform
- No external dependencies (xterm.js library)
- Simpler and more predictable rendering

## Delta Encoding

### Problem

A full terminal frame contains 132×43 = 5,676 cells. Most captures change
only a subset of those cells, so repeating the whole JSON cell array wastes
bandwidth and browser work.

### Solution

Server parses ANSI, tracks state, sends only changed cells:

```
Frame 1: FULL     → 5,676 cells
Frame 2: DELTA    → changed cells only
Frame N: FULL     → fallback when more than 50% of cells changed
```

### Message Format

```javascript
// FULL frame (first frame, or >50% cells changed)
{
  "t": "f",           // type: full
  "c": [              // cells: 5,676 elements
    ["╭", "5a4080", null, 0],    // [char, fg, bg, bold]
    ["─", "5a4080", null, 0],
    ...
  ]
}

// DELTA frame (only changed cells)
{
  "t": "d",           // type: delta
  "d": [              // [index, char, fg, bg, bold]
    [127, "5", "a57fd8", null, 0],
    [128, "2", "a57fd8", null, 0],
    ...
  ]
}
```

## Multi-node relay and NATS contract

The node exporter exposes its parsed full/delta stream over private HTTP/SSE. The
owning control plane opens that connection, validates and reconstructs the
terminal, then publishes one canonical NATS stream per node. Delta calculation
no longer happens independently for every public browser connection.

- Subject: `btop.<node>.frame`. btop is an environment-less infrastructure
  singleton; the node token is the routing dimension.
- Envelope: the workspace `{id, ts, source, version, subject, payload}` shape.
- Payload: `{node, session, sequence, frame}`.
- `session`: assigned by the control-plane relay and changes when its upstream
  exporter connection is replaced.
- `sequence`: increases for every full or delta frame in a session.
- `frame`: the existing compact `{t:"f",c:[...]}` or `{t:"d",d:[...]}`
  browser representation.

The control-plane relay owns sequence numbers and any future NATS credentials. It emits a
full frame when it first synchronizes an exporter, after reconnecting to NATS, and
periodically so a restarted BFF can recover without NATS request/reply or
durable replay. The BFF accepts a delta only when its session matches and its
sequence is the next value. A gap marks that node unsynchronized until a later
full frame restores it.

The BFF ends its NATS session on disconnect and invalidates every cached node.
Its outer retry loop runs every second; connection-error logs remain bounded.
Recovery requires a new full frame; a locally contiguous delta cannot bypass
invalidation. The hardened relay uses five-second snapshots, with unchanged
periodic snapshots reduced to deltas for already-synchronized browser streams.
See [recovery and node profiles](./btop-recovery.md) for candidate versus
deployed behavior, resource tradeoffs, and fault acceptance.

While the private exporter stream and health endpoint remain fresh, the relay
publishes an empty delta for an unchanged capture. It advances sequence and
acts as a small liveness event, so a quiet terminal is not mistaken for an
offline node. Cadence and periodic-full frequency must be measured during the
luv pilot.

Frames use Core NATS because they are transient live state. Replaying old
terminal motion after a node powers off would be incorrect. The BFF keeps the
current reconstructed frame in memory. A new browser gets a full frame only
when that state is fresh and synchronized. Otherwise it waits for fresh data;
its first delivery is always a reconstructed full frame, even if the next
accepted upstream message is a delta.

The target route admits at most 64 SSE clients per BFF process. It permits one
write to wait for drain for up to five seconds, without queueing further
frames. If another frame arrives while blocked, the connection closes; it must
reconnect for a complete snapshot. Never skip an intermediate delta and keep
the connection open. Cleanup is registered before headers or synchronous
snapshot delivery. Heartbeat comments do not renew node health.

Messages above 1 MiB and deltas with duplicate indices are rejected before
state mutation. Ignored-frame diagnostics are rate-limited to one log entry
per five seconds and omit payloads. Store, connection teardown, backpressure,
real HTTP full/delta/reconnect, and dev-page browser checks pass. Physical
device and production-ingress acceptance remain outstanding.

## Files

```
btop/
├── Dockerfile           # Multi-stage build: compile btop, runtime with Python
├── entrypoint.sh        # Starts tmux→btop, then Python SSE server
├── broadcast-server.py  # Captures tmux, parses ANSI, broadcasts cell deltas
├── frame_protocol.py    # Canonical full/delta and workspace envelope encoder
├── viewer.html          # Standalone development viewer for the cell protocol
├── btop.conf            # btop configuration (lavender theme, shown boxes, etc.)
├── themes/
│   └── vedanta-lavender.theme
└── src/                 # Patched btop source (AMD APU fixes)
```

## Configuration

### Native-exporter boundary

The target node exporter exposes only private HTTP endpoints:

- `/stream`: full/delta terminal cells for one control-plane consumer;
- `/health`: capture freshness for relay admission;
- `/frame`: optional full-frame diagnostics, private to operators.

On luv, these HTTP paths use a private Unix socket shared only with its local
relay. There is no new TCP listener. Remote-node TCP listeners still require
compute-interface binding and host firewall rules that admit only the owning
control plane. The exporter has no NATS URL or NATS credentials.

The current un-deployed prototype in `broadcast-server.py` still contains an
optional direct NATS publisher. That was a boundary mistake. Do not enable it;
remove it when the control-plane relays land.

### Control-plane relay

The `control-joi` domain owns the joi relay. `control-nexus` owns one relay per
known Nexus worker and uses its lifecycle state to decide whether silence means
expected power-off or a fault. The luv relay follows the same protocol locally.
Each relay:

1. connects to the private exporter `/stream` and checks `/health`;
2. reconstructs a complete 132×43 frame;
3. assigns relay session and sequence values;
4. forces a full frame after either upstream or NATS reconnect;
5. publishes only the nodes its control plane owns.

Because the control planes run on luv, they reach workspace NATS through its
internal Docker network. No compute-network NATS listener is required.

### BFF environment

| Variable | Meaning | Default |
|---|---|---|
| `BTOP_NATS_URL` | Optional btop-specific broker URL; falls back to `NATS_URL` | shared workspace broker |
| `NATS_CREDS_FILE` | Server-only credential file shared by both BFF bridges | unset until coordinated account cutover |
| `BTOP_NATS_CREDS` | Optional btop-specific subscriber credential override | falls back to `NATS_CREDS_FILE` |
| `BTOP_NODES` | Comma-separated desired node inventory, including nodes that may be powered off | set to `luv,joi` in current Compose files |

When authentication is activated, control-plane credentials may publish only
their owned subjects: luv gets
`btop.luv.frame`, joi gets `btop.joi.frame`, and Nexus gets an explicit list of
accepted node subjects such as `btop.nexus0.frame`. The
BFF may subscribe only to `btop.*.frame`. Do not expose NATS to the compute
network or public internet, and do not put credentials in exporters or browsers.

### btop.conf highlights

```ini
color_theme = "vedanta-lavender"
theme_background = false          # Transparent for web
truecolor = true                  # 24-bit color output
shown_boxes = "cpu mem net"       # CPU, memory/disks, network
show_disks = true                 # Disks shown in mem box
only_physical = false             # Required for container
disks_filter = "/hostfs"          # Show host root filesystem
show_uptime = true
update_ms = 1000                  # 1 second refresh
rounded_corners = true            # Nice box corners
graph_symbol = "braille"          # Highest resolution graphs
```

### tmux settings (in entrypoint.sh)

```bash
set -g status off                  # Hide tmux status bar
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc"  # Enable true color
```

### CSS Grid viewer (viewer.html)

```css
#terminal {
    display: grid;
    grid-template-columns: repeat(132, 6px);  /* Fixed width cells */
    grid-template-rows: repeat(43, 12px);     /* Fixed height cells */
    font-family: 'JetBrainsMono NF', monospace;
    transform-origin: center center;
}
#terminal span {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 6px;
    height: 12px;
}
```

The Python broadcaster parses ANSI into cells. The production
`BtopMonitor` component applies full/delta cell messages, renders each
character in a fixed-size grid cell, and scales the grid to fit its container.
`viewer.html` is a standalone diagnostic client for the same protocol.

## Legacy deployment and ports

The only remaining collector declaration here is `btop-luv` in
[production Compose](../docker-compose.yml). It retains host PID/network
access and privilege until public cutover. The native exporters do not need
those broad privileges. Current bindings live in [the port register](./ports.md).
The removed dev and SSH declarations remain in Git history, not runnable
examples in this runbook.

The remaining public collector path is:

```text
browser /api/btop-luv/{health,stream}
  → in-container nginx
  → vedanta-systems-prod-api:3001
  → host-gateway:3102
  → Python broadcaster
```

nginx returns `404` for the standalone `/api/btop-luv/` and
`/api/btop-joi/` roots. Only health and stream paths are public.

## SSE Protocol

The Python server exposes:

- `GET /` - Returns viewer.html
- `GET /stream` - SSE endpoint, sends JSON frames
- `GET /health` - Health check endpoint

Each frame:
```json
{"t":"f","c":[["╭","5a4080",null,0]]}
{"t":"d","d":[[127,"5","a57fd8",null,0]]}
```

The browser applies a full frame or changed cells directly:
```javascript
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.t === 'f') renderFull(data.c);
    if (data.t === 'd') applyDelta(data.d);
};
```

### Proxy Support

`BtopMonitor` opens `${apiPrefix}/stream`. Current source selects
`/api/btop/{luv,joi}` for both NATS-backed tiles.
The deployed production bundle still selects `/api/btop-luv` for luv.
Legacy Express routes proxy `health` and `stream` to the matching host port;
the new route serves the BFF's reconstructed NATS frames.

## Source, profile, and GPU limitation

Source authority, the configurable public-display profile, legacy embedded
patch history, theme colors, and the Strix Halo Vulkan-utilization limitation
live in [btop source and public-display profile](./btop-source.md). Keep this
document focused on deployment and transport.

## Retired SSH capture

The embedded legacy image still contains its old `BTOP_HOST` SSH mode for
historical rollback. No declared service uses it now. Both nodes have native
exporters consumed by their owning Control relays; do not restore a
login-session or SSH-agent dependency for monitoring.

## Relationship to Other Services

The exporter does not depend on Express to capture or encode btop. Its owning
control plane is the only cross-node consumer and the only NATS publisher. The
public browser depends on the Express BFF for same-origin SSE and never
connects to NATS, a control plane, or a node directly. Prometheus remains the
owner of historical host and GPU metrics; btop is a transient interactive
instrument.
