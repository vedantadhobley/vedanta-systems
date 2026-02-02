# btop Integration

Real-time system monitor displayed on vedanta.systems using btop + SSE broadcast.

## Features

- **AMD APU Support**: Custom-patched btop for Ryzen AI MAX+ 395 (Strix Halo)
  - GTT memory type 2 detection
  - rocm-smi v1.x compatibility
- **Custom Theme**: Lavender theme matching site aesthetics
- **SSE Broadcast**: Single btop instance, all clients receive same stream
- **xterm.js Rendering**: Proper terminal emulation in browser
- **Read-only**: No keyboard input, display only
- **Host Networking**: Sees real host network traffic

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ btop Container (network_mode: host, pid: host)              │
│                                                             │
│   btop ──► tmux ──► capture-pane ──► Python SSE Server     │
│            (120x40)      (raw ANSI)      (port 4102)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ SSE (Server-Sent Events)
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│   viewer.html ──► xterm.js ──► Canvas rendering            │
│   (EventSource)   (Terminal)   (proper char widths)        │
└─────────────────────────────────────────────────────────────┘
```

### Why This Stack?

| Component | Purpose |
|-----------|---------|
| **btop** | Best-looking TUI system monitor with GPU support |
| **tmux** | Fixed-size terminal (120x40), consistent capture |
| **Python SSE** | Simple broadcast server, ~100 lines |
| **xterm.js** | Proper terminal emulation, handles Unicode/ANSI correctly |

### Why NOT ttyd/WebSocket?

- ttyd requires per-client WebSocket connections
- Each client would spawn a new btop process
- Doesn't scale well for public display
- SSE broadcast is simpler and more efficient

## Files

```
btop/
├── Dockerfile           # Multi-stage build: compile btop, runtime with Python
├── entrypoint.sh        # Starts tmux→btop, then Python SSE server
├── broadcast-server.py  # Python SSE server, captures tmux, broadcasts to clients
├── viewer.html          # xterm.js-based viewer, connects to /stream
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

### xterm.js settings (in viewer.html)

```javascript
const term = new Terminal({
    cols: 120,
    rows: 40,
    convertEol: true,
    scrollback: 0,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 14,
    theme: {
        background: '#000000',
        foreground: '#c9a0f0'
    }
});
```

## Ports

| Environment | Port | Notes |
|-------------|------|-------|
| Development | 4102 | Direct access (network_mode: host) |
| Production | 4102 internal | Proxied via nginx at /btop/ |

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

Each frame:
```json
{"ansi": "<raw ANSI output from btop>"}
```

The viewer strips trailing newlines and writes to xterm.js:
```javascript
const content = data.ansi.replace(/\n$/, '');
term.write('\x1b[H\x1b[J' + content);
```

## AMD APU Patches

The btop source includes patches for AMD Strix Halo APUs:

### 1. GTT Memory Type (src/linux/btop_collect.cpp)

```cpp
// Line ~2308: Add memory type 2 (GTT) for APUs
if (mem_type <= 2) {  // was: mem_type <= 1
```

### 2. rocm-smi v1.x Support (src/linux/btop_collect.cpp)

```cpp
// Use rsmi_dev_gpu_clk_freq_get instead of rsmi_dev_clk_freq_get
// The older API is available in Ubuntu 24.04's librocm-smi
```

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

1. **Minor color artifacts**: Some border colors may appear slightly off due to xterm.js theme mapping of 16-color ANSI codes vs btop's 24-bit colors. The actual graph colors are correct.

2. **Slight pixel alignment**: Unicode box-drawing characters may have sub-pixel alignment differences at certain font sizes.

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
