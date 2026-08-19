# btop Integration

Real-time system monitor displayed on vedanta.systems using a public-display
btop build, a terminal-frame encoder, the Express BFF, and CSS Grid rendering.

## Current and target state

The live path is still the legacy deployment described below:

- luv runs separate development and production btop containers;
- both joi containers run on luv and SSH to joi to start the remote btop
  process;
- the joi path is unavailable after joi's NixOS and network migration;
- Express proxies four host ports through `/api/btop-{luv,joi}`.

The replacement keeps the existing browser frame format but changes the
collection topology:

```text
one native btop agent on each node
  -> private HTTP/SSE over the node's compute network
  -> owning control-plane relay
  -> Core NATS btop.<node>.frame events
  -> vedanta-systems BFF reconstructs current node frames
  -> same-origin /api/btop/<node>/stream SSE
  -> existing CSS Grid renderer
```

There is one agent per physical node, with no development/production
duplication. luv uses Compose, joi uses its declared NixOS-hosted Compose
stack, and Nexus uses its shared `virtualisation.oci-containers` module. The
joi and Nexus control planes deploy the agents, consume their private streams,
and publish the canonical NATS frames. They also own node lifecycle, but do not
use btop health as workload readiness. The node agents never connect to NATS or
the frontend.

`src/server/routes/btop.ts` is the first migration slice. It subscribes to the
future NATS subjects and exposes `/api/btop/{node}/{health,stream}` while the
legacy HTTP proxies remain active. No current tile uses the new route yet.
`BTOP_NODES` seeds the desired inventory so a powered-off node remains visible;
valid frames can also discover a node. Unknown public stream requests are
rejected instead of allocating unbounded in-memory node state.
The cross-project ownership and rollout live in the
[multi-node btop plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md).

## Source ownership

`~/workspace/btop/src` is the authoritative modified btop checkout. The
`btop/src` tree in this repository is the older public-display child used by
the live legacy image; it is not the parent of future node agents.

Current upstream btop 1.4.7 already contains the robust ROCm 1.x ABI probe and
AMD APU sysfs fallback that the child predates. Branch
`feature/vedanta-profiles` in the authoritative checkout adds only the parts
still required here:

- `public_display_mode` for the compact, non-interactive embedded layout;
- `show_net_ip` as an independent privacy control;
- `gpu_mem_type = "vram" | "gtt"` across both ROCm and sysfs collectors;
- `/hostfs` labeling as the monitored root.

The default remains normal operator btop. A Strix Halo public-display profile
sets `public_display_mode = true`, `show_net_ip = false`,
`gpu_mem_type = "gtt"`, and `show_cpu_watts = false`. The last setting avoids
labeling whole-package APU power as CPU-only power. Both GPU and non-GPU builds
of commit `6f76ec6` pass with GCC 14. The packaging migration must build the
node-agent image from that source authority and then remove this repo's stale
embedded source copy.

## Legacy image features

- **AMD APU Support**: GTT memory reporting for Ryzen AI MAX+ 395 (Strix Halo)
- **Custom Theme**: Lavender theme matching site aesthetics
- **SSE Broadcast**: Single btop instance, all clients receive same stream
- **Private Agent Stream**: Node-local HTTP/SSE consumed only by its control plane
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
                              │ host ports 3102/3103 or 4102/4103
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

The node agent exposes its parsed full/delta stream over private HTTP/SSE. The
owning control plane opens that connection, validates and reconstructs the
terminal, then publishes one canonical NATS stream per node. Delta calculation
no longer happens independently for every public browser connection.

- Subject: `btop.<node>.frame`. btop is an environment-less infrastructure
  singleton; the node token is the routing dimension.
- Envelope: the workspace `{id, ts, source, version, subject, payload}` shape.
- Payload: `{node, session, sequence, frame}`.
- `session`: assigned by the control-plane relay and changes when its upstream
  agent connection is replaced.
- `sequence`: increases for every full or delta frame in a session.
- `frame`: the existing compact `{t:"f",c:[...]}` or `{t:"d",d:[...]}`
  browser representation.

The control-plane relay owns sequence numbers and NATS credentials. It emits a
full frame when it first synchronizes an agent, after reconnecting to NATS, and
periodically so a restarted BFF can recover without NATS request/reply or
durable replay. The BFF accepts a delta only when its session matches and its
sequence is the next value. A gap marks that node unsynchronized until a later
full frame restores it.

While the private agent stream and health endpoint remain fresh, the relay
publishes an empty delta for an unchanged capture. It advances sequence and
acts as a small liveness event, so a quiet terminal is not mistaken for an
offline node. Cadence and periodic-full frequency must be measured during the
luv pilot.

Frames use Core NATS because they are transient live state. Replaying old
terminal motion after a node powers off would be incorrect. The BFF keeps the
current reconstructed frame in memory and sends it as a full frame to each new
browser SSE connection.

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

### Native-agent boundary

The target node agent exposes only private HTTP endpoints:

- `/stream`: full/delta terminal cells for one control-plane consumer;
- `/health`: capture freshness for relay admission;
- `/frame`: optional full-frame diagnostics, private to operators.

The service binds only on the node's compute interface. Host firewall rules
admit its owning control plane and reject other callers. The agent has no NATS
URL or NATS credentials.

The current un-deployed prototype in `broadcast-server.py` still contains an
optional direct NATS publisher. That was a boundary mistake. Do not enable it;
remove it when the control-plane relays land.

### Control-plane relay

`joi-control-plane` owns the joi relay. `nexus-control-plane` owns one relay per
known Nexus worker and uses its lifecycle state to decide whether silence means
expected power-off or a fault. The luv relay follows the same protocol locally.
Each relay:

1. connects to the private agent `/stream` and checks `/health`;
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
| `BTOP_NATS_CREDS` | Optional subscriber credentials file inside the API container | unset during the local open-mode pilot only |
| `BTOP_NODES` | Comma-separated desired node inventory, including nodes that may be powered off | set to `luv,joi` in current Compose files |

Control-plane credentials may publish only their owned subjects: joi gets
`btop.joi.frame`, while Nexus gets the approved `btop.nexus*.frame` set. The
BFF may subscribe only to `btop.*.frame`. Do not expose NATS to the compute
network or public internet, and do not put credentials in agents or browsers.

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

## Ports

| Environment | luv | joi | Browser path |
|-------------|-----|-----|--------------|
| Development | 4102 | 4103 | `/api/btop-{luv,joi}` through Vite → Express |
| Production | 3102 | 3103 | `/api/btop-{luv,joi}` through nginx → Express |

**Note**: btop uses `network_mode: host` to see real host network traffic, so it binds directly to host ports rather than using Docker port mapping.

## Docker Compose

### Per-node shape

```yaml
btop-luv:
  container_name: vedanta-systems-dev-btop-luv
  build:
    context: ./btop
    dockerfile: Dockerfile
  network_mode: host      # See host network traffic
  pid: host               # See host processes
  privileged: true        # GPU access + full /proc visibility
  volumes:
    - /proc:/proc:ro
    - /sys:/sys:ro
    - /:/hostfs:ro        # Host root for disk stats
    - /dev/dri:/dev/dri
    - /dev/kfd:/dev/kfd
  environment:
    - WRAPPER_PORT=4102
    - BTOP_HOST=local
  group_add:
    - "44"   # video
    - "992"  # render

btop-joi:
  container_name: vedanta-systems-dev-btop-joi
  network_mode: host
  volumes:
    - /run/user/1000/keyring/ssh:/ssh-agent:ro
  environment:
    - WRAPPER_PORT=4103
    - BTOP_HOST=${BTOP_JOI_SSH_HOST}
    - SSH_AUTH_SOCK=/ssh-agent
```

Production uses the same two services with ports `3102` and `3103`. The joi
container runs locally but SSHes to joi for the btop process; its health check
returns `503` when no fresh capture arrives for 30 seconds.

The public request path is:

```text
browser /api/btop-{luv,joi}/{health,stream}
  → in-container nginx
  → vedanta-systems-prod-api:3001
  → host-gateway:{3102,3103}
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

`BtopMonitor` receives `/api/btop-luv` or `/api/btop-joi` as `apiPrefix`
and opens `${apiPrefix}/stream`. Express proxies only `health` and `stream` to
the matching host port with SSE buffering disabled along the request path.

## Source Modifications

The btop source (`btop/src/`) is cloned from the official [aristocratos/btop](https://github.com/aristocratos/btop) repository with the following patches applied:

### AMD APU Patches

For Ryzen AI MAX+ 395 (Strix Halo) and other AMD APU support:

**1. ROCm SMI v1.x Support (src/linux/btop_collect.cpp)**

Ubuntu 24.04's rocm-smi package (5.7.0-1) reports library version as 1.0.0, but btop only accepts versions 5, 6, or 7. This patch treats version 1.x the same as v6/7:

```cpp
// Line ~1577: Accept version 1.x (Ubuntu 24.04 rocm-smi compatibility)
} else if (version.major == 6 || version.major == 7 || version.major == 1) {
```

**2. GPU Memory Type Option (src/linux/btop_collect.cpp, src/btop_config.cpp)**

On AMD APUs, the GPU uses unified memory (GTT - Graphics Translation Table) shared with the CPU. By default, btop queries VRAM which only shows the small BIOS carve-out (~512MB). This patch adds a `gpu_mem_type` config option:

```ini
# btop.conf
gpu_mem_type = "gtt"   # Show unified memory (APUs)
# gpu_mem_type = "vram" # Show dedicated VRAM (default)
```

```cpp
// Line ~212: Add GTT memory type define
#define RSMI_MEM_TYPE_GTT             2

// Line ~1764: Use configured memory type
rsmi_memory_type_t mem_type = (Config::getS("gpu_mem_type") == "gtt") ? RSMI_MEM_TYPE_GTT : RSMI_MEM_TYPE_VRAM;
```

**3. Show Net IP Option (src/btop_config.cpp, src/btop_draw.cpp)**

Privacy option to hide IP address in network box:

```ini
# btop.conf
show_net_ip = false  # Hide IP for public displays
```

### Display Customizations

For the public-facing display:

```ini
# btop.conf
custom_cpu_name = "AMD STRIX HALO"   # Custom CPU name in title
custom_gpu_name0 = "AMD STRIX HALO"  # Custom GPU name
gpu_mem_type = "gtt"                 # Show unified memory (~62GB) instead of VRAM carve-out
show_net_ip = false                  # Hide IP address for privacy
```

### UI Customizations for Public Display

Since this is a read-only public display, several interactive UI elements have been removed for a cleaner look:

**src/btop_draw.cpp modifications:**

1. **Box numbering removed** (line ~263)
   - Removed superscript numbers (¹²³) from box titles
   - `const string numbering = "";`

2. **CPU box buttons disabled** (lines ~593-605)
   - Removed: `menu` button
   - Removed: `preset` button
   - Removed: `- +` buttons around update interval
   - Kept: Update interval display (e.g., "1000ms") without buttons

3. **Network box buttons disabled** (lines ~1479-1496)
   - Removed: `sync` button
   - Removed: `auto` button  
   - Removed: `zero` button
   - Removed: Interface selector arrows (`←b` / `n→`)
   - Kept: Interface name display (e.g., "enp191s0")

## Theme Colors

The `vedanta-lavender.theme` uses colors from the GitHub contribution graph lavender palette:

| Variable | Color | Usage |
|----------|-------|-------|
| `main_fg` | `#7a5aaf` | General text |
| `graph_text` | `#c9a0f0` | Uptime, network scaling |
| `title` | `#a57fd8` | Box titles |
| `hi_fg` | `#c9a0f0` | Keyboard shortcuts |
| `inactive_fg` | `#3d2d5c` | Bar backgrounds |
| Box outlines | `#5a4080` | CPU, mem, net boxes |
| Gradients | `#7a5aaf` → `#a57fd8` → `#c9a0f0` | All graphs |

## Known Issues

**iGPU utilization bar reads 0% on Strix Halo under Vulkan workloads.**

Symptom: GPU compute is clearly running (model is generating tokens, the
power/clock/memory side of the GPU panel spikes, system temps rise), but
btop's GPU utilization percentage bar stays pinned at 0%.

Cause: btop reads the iGPU's busy percentage from ROCm SMI (which only
counts HIP / ROCm queues, not Vulkan compute on gfx1151) and from the
kernel's `/sys/class/drm/card*/device/gpu_busy_percent` sysfs counter,
which is unreliable for Vulkan compute on Strix Halo APUs as of the
6.x kernel series. The clock + memory panels read correctly because
those come from different sysfs paths (`pp_dpm_sclk` / `pp_dpm_mclk`).

This is a kernel/driver-side gap, not something the patches above can
fix in btop itself. **For accurate iGPU utilization monitoring on
joi, use [`amdgpu_top`](https://github.com/Umio-Yasuno/amdgpu_top)**:

```bash
# install (Cargo or pre-built release)
cargo install amdgpu_top
# or download the .deb from the GitHub releases page

# live read of GFX / compute / decode / encode engine utilization
amdgpu_top
```

`amdgpu_top` reads the per-engine ring busy counters directly from
`/sys/kernel/debug/dri/*/amdgpu_*` (the kernel side btop doesn't
plumb), and explicitly handles APU + Vulkan workloads correctly. It's
the tool of record for any Strix Halo iGPU monitoring this stack
doesn't surface.

The CSS Grid rendering preserves fixed terminal-cell alignment on desktop and
mobile.

## Legacy remote-node support

The architecture supports monitoring multiple systems:

```yaml
environment:
  - BTOP_HOST=local           # This system
  # or
  - BTOP_HOST=vedanta@<host>.<your-tailnet>.ts.net  # SSH to remote system
```

When `BTOP_HOST` is not `local`, the container SSHes to the remote host and
runs btop there. The dead joi services still use this mode. This mechanism is
being removed; every node will run its own native agent and its control plane
will consume that agent over private HTTP/SSE.

## Relationship to Other Services

The agent does not depend on Express to capture or encode btop. Its owning
control plane is the only cross-node consumer and the only NATS publisher. The
public browser depends on the Express BFF for same-origin SSE and never
connects to NATS, a control plane, or a node directly. Prometheus remains the
owner of historical host and GPU metrics; btop is a transient interactive
instrument.
