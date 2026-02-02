# btop Integration Design Document

## Goal
Display real-time btop TUI from multiple systems (primary + secondary) on the vedanta.systems frontend as **read-only visual displays** (no user interaction).

## Current State

### Existing btop Setup (`~/workspace/btop/`)
- **Dockerfile.server**: Builds btop with AMD APU patches (GTT memory, rocm-smi)
- **ttyd**: Serves btop as a web terminal on port 7681
- **btop-public.conf**: Config with `show_net_ip = false` to hide IP addresses
- **docker-compose.yml**: Runs with `pid: host`, `network_mode: host`, `privileged: true` to see real host metrics

### Key Config Options
```ini
# btop-public.conf
show_net_ip = false       # Hide IP for public display
shown_boxes = "cpu mem net"  # Which panels to show
```

## Architecture Options

### Option A: ttyd iframe embed (Simplest)
```
┌─────────────────────────────────────────────────────────────┐
│  vedanta.systems (this server)                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  <iframe src="http://localhost:7681" />              │   │  ← Local btop
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  <iframe src="https://system2.vedanta.systems:7681" />   │  ← Remote btop via tunnel
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Zero frontend code needed - ttyd already renders a terminal
- ttyd has `--readonly` flag for no-input mode
- Updates in real-time (it's a websocket terminal)

**Cons:**
- iframes can be finicky (CORS, sizing, mobile)
- Two separate websocket connections to different origins
- Can't style the terminal (ttyd has limited theming)
- Exposes ttyd port publicly (even in readonly mode)

---

### Option B: ttyd via reverse proxy (Better security)
```
┌─────────────────────────────────────────────────────────────┐
│  vedanta.systems nginx                                      │
│                                                             │
│  /btop/local   →  localhost:7681 (ttyd websocket)          │
│  /btop/remote  →  wireguard-peer:7681 (ttyd websocket)     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

ttyd supports WebSocket proxying. Nginx can proxy both local and remote btop instances.

**Pros:**
- Single origin (no CORS issues)
- Can add authentication at nginx level
- Both systems accessible from same domain

**Cons:**
- Need Wireguard/Tailscale between systems for remote btop
- Still iframe-based rendering

---

### Option C: Canvas/SVG terminal renderer (Most control)
```
┌─────────────────────────────────────────────────────────────┐
│  Backend                                                    │
│                                                             │
│  btop → pty → ANSI frames → WebSocket → Frontend            │
│                                                             │
│  Capture terminal output as ANSI sequences, broadcast       │
│  to connected clients                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Frontend                                                   │
│                                                             │
│  WebSocket → xterm.js / custom renderer → <canvas>          │
│                                                             │
│  Render ANSI sequences as styled output                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Full control over styling and sizing
- Can add overlays, labels, custom UI
- Single SSE/WebSocket endpoint for all metrics
- More React-native (no iframes)

**Cons:**
- More complex to implement
- Need xterm.js or similar library
- Still essentially reimplementing what ttyd does

---

### Option D: Static snapshots (Lowest bandwidth)
```
┌─────────────────────────────────────────────────────────────┐
│  Each System                                                │
│                                                             │
│  btop --update_ms 2000 → capture terminal → png/svg         │
│  Cron every 2s, upload to S3 or serve locally               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Frontend                                                   │
│                                                             │
│  <img src="/btop/system1.png" /> (auto-refresh)             │
│  <img src="/btop/system2.png" />                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Using tools like `ansishot`, `termshot`, or `vhs` to capture terminal as image.

**Pros:**
- Dead simple frontend (just images)
- Works offline, no websocket needed
- Very low bandwidth for viewers
- Easy to cache/CDN

**Cons:**
- Not truly real-time (2-5s delay)
- Image generation overhead on source systems
- Less crisp than native terminal rendering

---

## Recommended Approach: Hybrid (B + xterm.js)

1. **Local btop**: Proxy ttyd through nginx at `/api/btop/local`
2. **Remote btop**: System 2 runs btop-server, tunneled via Cloudflare Tunnel or Wireguard
3. **Frontend**: Use xterm.js in read-only mode to render the WebSocket stream
4. **Fallback**: If WebSocket fails, show "System Offline" placeholder

### Why xterm.js over raw iframe?
- Native React integration
- Can match site theme (corpo dark)
- Better mobile responsiveness
- Can overlay system labels/status

---

## Implementation Steps

### Phase 1: Local btop on primary system
1. [ ] Start btop-server container with `--readonly` mode
2. [ ] Add nginx proxy rule: `/api/btop/local → localhost:7681`
3. [ ] Create `<BtopTerminal />` React component using xterm.js
4. [ ] Display on vedanta.systems page

### Phase 2: Remote btop from secondary system
1. [ ] Set up Cloudflare Tunnel or Wireguard between systems
2. [ ] Run btop-server on system 2
3. [ ] Add nginx proxy rule: `/api/btop/remote → system2:7681`
4. [ ] Add second `<BtopTerminal />` for system 2

### Phase 3: Polish
1. [ ] System labels/names
2. [ ] Connection status indicators
3. [ ] Graceful offline handling
4. [ ] Mobile-responsive sizing

---

## Port Allocation (per PORT-ALLOCATION.md)

| Service | Port | Notes |
|---------|------|-------|
| btop-local | 7681 | ttyd default, internal only |
| btop-remote | tunneled | Via Cloudflare/Wireguard |

Both proxied through nginx on 3100, no direct exposure.

---

## Security Considerations

1. **Read-only mode**: `BTOP_READONLY=true` in btop-server
2. **No IP display**: `show_net_ip = false` in btop config
3. **No direct port exposure**: Proxy through nginx
4. **Optional auth**: Can add basic auth at nginx level if needed

---

## Questions to Resolve

1. **System 2 connectivity**: Cloudflare Tunnel vs Wireguard vs Tailscale?
2. **Update frequency**: Default btop is 2000ms, good for web display?
3. **Mobile**: Show one system at a time? Or side-by-side?
4. **System names**: "Primary" / "Secondary"? Or custom names?
