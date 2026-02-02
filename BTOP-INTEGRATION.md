# btop Integration

Real-time system monitor displayed on vedanta.systems using btop + ttyd.

## Features

- **AMD APU Support**: Custom-patched btop for Ryzen AI MAX+ 395 (Strix Halo)
  - GTT memory type 2 detection
  - rocm-smi v1.x compatibility
- **Custom Theme**: Lavender theme matching site aesthetics
- **Web Terminal**: ttyd serves btop over WebSocket
- **Read-only**: No keyboard input, display only
- **Privacy**: IP addresses hidden in network display

## Architecture

```
Browser → nginx (:4102 dev / :3102 prod)
              ↓
         nginx proxy
              ↓
         ttyd (:7681 internal)
              ↓
         tmux session
              ↓
         btop (with GPU support)
```

### Why This Stack?

| Component | Purpose |
|-----------|---------|
| **btop** | Best-looking TUI system monitor with GPU support |
| **tmux** | Persistent session - btop always runs, clients just attach |
| **ttyd** | Serves terminal over WebSocket, handles resize/reconnect |
| **nginx** | Reverse proxy, allows future path-based routing |

## Files

```
btop/
├── Dockerfile          # Multi-stage build: compile btop, runtime with ttyd
├── entrypoint.sh       # Starts tmux→btop, ttyd, nginx
├── btop.conf           # btop configuration
├── wrapper.html        # (unused, kept for reference)
├── themes/
│   └── vedanta-lavender.theme
└── src/                # Patched btop source (AMD APU fixes)
```

## Configuration

### btop.conf highlights

```ini
color_theme = "vedanta-lavender"
theme_background = false          # Transparent for web
shown_boxes = "cpu mem net"       # No proc box (cleaner)
show_uptime = true
show_net_ip = false               # Privacy
update_ms = 1000                  # 1 second refresh
```

### ttyd options

```bash
ttyd \
  -t "disableLeaveAlert=true"     # No "confirm leave" prompt
  -t "disableResizeOverlay=true"  # No size popup on resize
  -t "titleFixed=btop"
  -t "fontSize=13"
  -t "theme={\"background\": \"#000000\"}"
  tmux attach-session -t btop -r   # Read-only attach
```

### tmux config

```bash
set -g status off                  # Hide tmux status bar
set -g aggressive-resize on        # Resize to current client
setw -g window-size latest         # Use latest client size
```

## Ports

| Environment | External Port | Internal ttyd | Range Convention |
|-------------|---------------|---------------|------------------|
| Development | 4102 | 7681 | 41xx |
| Production | 3102 | 7681 | 31xx |

## Docker Compose

### Development (docker-compose.dev.yml)

```yaml
btop:
  container_name: vedanta-systems-dev-btop
  build:
    context: ./btop
    dockerfile: Dockerfile
  pid: host           # See host processes
  privileged: true    # GPU access + full /proc
  volumes:
    - /proc:/proc:ro
    - /sys:/sys:ro
    - /dev/dri:/dev/dri
    - /dev/kfd:/dev/kfd
  environment:
    - WRAPPER_PORT=4102
    - TTYD_PORT=7681
    - BTOP_HOST=local
  ports:
    - "4102:4102"
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

## Frontend Integration

Simple iframe embed:

```tsx
<iframe 
  src="/btop/" 
  className="w-full h-[600px] border-0 bg-black"
  title="System Monitor"
/>
```

Or use the BtopMonitor component (if created).

## Known Issues

1. **Initial resize snap**: Terminal briefly shows at default size before resizing to fit. This is a ttyd/xterm.js behavior - the WebSocket connection must establish before the client can report its size.

## Theme Colors

The `vedanta-lavender.theme` uses colors from the GitHub contribution graph lavender palette:

| Variable | Color | Usage |
|----------|-------|-------|
| `main_fg` | `#7a5aaf` | General text, % symbols |
| `graph_text` | `#c9a0f0` | Uptime, network scaling text |
| `title` | `#a57fd8` | Box titles |
| `hi_fg` | `#c9a0f0` | Keyboard shortcuts |
| `inactive_fg` | `#3d2d5c` | Bar backgrounds |
| Box outlines | `#5a4080` | CPU, mem, net, proc boxes |
| Gradients | `#7a5aaf` → `#a57fd8` → `#c9a0f0` | All graphs |

Palette reference:
- `#3d2d5c` - darkest (level1)
- `#5a4080` - medium-dark (level2)
- `#7a5aaf` - medium (level3)
- `#a57fd8` - bright (level4)
- `#c9a0f0` - brightest (derived)

## Future: Multi-System Support

The architecture supports monitoring multiple systems:

```yaml
environment:
  - BTOP_HOST=local           # This system
  # or
  - BTOP_HOST=user@10.0.0.5   # SSH to remote system
```

When `BTOP_HOST` is not "local", the container SSHs to the remote host and runs btop there. Requires SSH key mounted at `/root/.ssh/id_rsa`.

## Security

| Measure | Implementation |
|---------|----------------|
| Read-only | tmux attach with `-r` flag |
| No IP display | `show_net_ip = false` |
| No external ttyd | Only nginx port exposed |
| No proc box | Can't see process arguments |
