# btop Integration

Real-time system monitor displayed on vedanta.systems using btop + SSE broadcast + CSS Grid rendering.

## Features

- **AMD APU Support**: Custom-patched btop for Ryzen AI MAX+ 395 (Strix Halo)
  - GTT memory type 2 detection
  - rocm-smi v1.x compatibility
- **Custom Theme**: Lavender theme matching site aesthetics
- **SSE Broadcast**: Single btop instance, all clients receive same stream
- **Delta Encoding**: Only send changed cells, ~80% bandwidth reduction
- **CSS Grid Rendering**: Pixel-perfect character alignment on all devices
- **Read-only**: No keyboard input, display only
- **Host Networking**: Sees real host network traffic

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ btop Container (network_mode: host, pid: host)              │
│                                                             │
│   btop ──► tmux ──► capture ──► ANSI Parser ──► SSE Server │
│            (132x43)              (Python)        (deltas)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ SSE (full frame or delta)
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│   viewer.html ──► Apply Delta ──► Cell State ──► CSS Grid  │
│   (EventSource)   (merge changes)  (5676 cells)  (render)  │
└─────────────────────────────────────────────────────────────┘
```

### Why This Stack?

| Component | Purpose |
|-----------|---------|
| **btop** | Best-looking TUI system monitor with GPU support |
| **tmux** | Fixed-size terminal (132x43), consistent capture |
| **Python SSE** | Broadcast server with ANSI parsing + delta encoding |
| **CSS Grid** | Pixel-perfect alignment, each character in fixed 6×12px cell |

### Why CSS Grid over xterm.js?

- xterm.js has variable Unicode character widths causing misalignment
- CSS Grid forces each character into a fixed-size cell
- Scales perfectly on mobile with CSS transform
- No external dependencies (xterm.js library)
- Simpler and more predictable rendering

## Delta Encoding

### Problem

Full terminal frame = 132×43 = 5,676 cells × ~20 bytes = **~12 KB per frame**.
But only ~30% of cells actually change between frames (graphs, numbers, processes).
We were resending 70% unchanged data every second.

### Solution

Server parses ANSI, tracks state, sends only changed cells:

```
Frame 1: FULL     → 5,676 cells    (~12 KB)
Frame 2: DELTA    →   847 changed  (~2.5 KB)  79% smaller
Frame 3: DELTA    →   312 changed  (~1 KB)    92% smaller
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

### Bandwidth Savings

| Scenario | Full | Delta | Reduction |
|----------|------|-------|-----------|
| Idle system | 12 KB | ~0.5 KB | 96% |
| Light activity | 12 KB | ~1.5 KB | 87% |
| Heavy activity | 12 KB | ~3 KB | 75% |
| **Average** | 12 KB | ~2 KB | **~85%** |

## Files

```
btop/
├── Dockerfile           # Multi-stage build: compile btop, runtime with Python
├── entrypoint.sh        # Starts tmux→btop, then Python SSE server
├── broadcast-server.py  # Python SSE server, captures tmux, broadcasts raw ANSI
├── viewer.html          # CSS Grid viewer, parses ANSI client-side
├── btop.conf            # btop configuration (lavender theme, shown boxes, etc.)
├── themes/
│   └── vedanta-lavender.theme
└── src/                 # Patched btop source (AMD APU fixes)
```

## Configuration

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

The viewer parses ANSI escape codes client-side and renders each character in its own fixed-size grid cell, then scales the entire grid with CSS transform to fit the container.

## Ports

| Environment | Port | Notes |
|-------------|------|-------|
| Development | 4102 | Direct access (network_mode: host) |
| Production | 3102 | Direct access (network_mode: host), proxied via API |

**Note**: btop uses `network_mode: host` to see real host network traffic, so it binds directly to host ports rather than using Docker port mapping.

## Docker Compose

### Development (docker-compose.dev.yml)

```yaml
btop:
  container_name: vedanta-systems-dev-btop
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
```

### Production

Same configuration, proxied through nginx:

```nginx
location /btop/ {
    set $btop_upstream vedanta-systems-prod-btop;
    proxy_pass http://$btop_upstream:4102/;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
}
```

## SSE Protocol

The Python server exposes:

- `GET /` - Returns viewer.html
- `GET /stream` - SSE endpoint, sends JSON frames
- `GET /health` - Health check endpoint

Each frame:
```json
{"frame": "<raw ANSI output from btop>"}
```

The viewer parses ANSI codes and renders to CSS Grid:
```javascript
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const cells = parseAnsiToGrid(data.frame);
    renderGrid(cells);
};
```

### Proxy Support

When loaded through the API proxy (`/api/btop/`), the viewer detects this and uses the correct stream URL:
```javascript
function getStreamUrl() {
    const path = window.location.pathname;
    if (path.includes('/api/btop')) return '/api/btop/stream';
    return '/stream';
}
```

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

None currently. The CSS Grid rendering provides pixel-perfect alignment on both desktop and mobile.

## Future: Multi-System Support

The architecture supports monitoring multiple systems:

```yaml
environment:
  - BTOP_HOST=local           # This system
  # or
  - BTOP_HOST=user@10.0.0.5   # SSH to remote system
```

When `BTOP_HOST` is not "local", the container SSHs to the remote host and runs btop there. Requires SSH key mounted.

## Relationship to Other Services

- **API Server (4101)**: Node.js Express server for found-footy and other projects
- **btop Server (4102)**: Separate Python SSE server, no dependencies on API

These are independent services. btop does not use the Express API - it has its own lightweight Python server specifically for SSE broadcast.
