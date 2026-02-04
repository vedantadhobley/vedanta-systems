#!/usr/bin/env python3
"""
btop Broadcast Server with Delta Encoding

Captures btop terminal output, parses ANSI to cells, and broadcasts deltas via SSE.

Architecture:
  btop → tmux → capture-pane → ANSI parser → delta encoder → SSE broadcast

Delta Encoding:
  - First frame: full cell array (5676 cells)
  - Subsequent: only changed cells with indices
  - Falls back to full if >50% changed
"""

import subprocess
import time
import json
import threading
import re
import signal
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = int(os.environ.get('WRAPPER_PORT', os.environ.get('BROADCAST_PORT', 4102)))
TMUX_SESSION = 'btop'
REFRESH_INTERVAL = 1.0
COLS = 132
ROWS = 43
TOTAL_CELLS = COLS * ROWS

# Global state
current_cells = None  # List of [char, fg, bg, bold]
cells_lock = threading.Lock()

# ANSI color palette (16 basic colors)
COLORS_16 = [
    '000000', 'aa0000', '00aa00', 'aa5500',
    '0000aa', 'aa00aa', '00aaaa', 'aaaaaa',
    '555555', 'ff5555', '55ff55', 'ffff55',
    '5555ff', 'ff55ff', '55ffff', 'ffffff'
]


def log(msg):
    print(msg, flush=True)


def get_256_color(n):
    """Convert 256-color index to hex string."""
    if n < 16:
        return COLORS_16[n]
    if n < 232:
        n -= 16
        r = (n // 36) * 51
        g = ((n % 36) // 6) * 51
        b = (n % 6) * 51
        return f'{r:02x}{g:02x}{b:02x}'
    gray = (n - 232) * 10 + 8
    return f'{gray:02x}{gray:02x}{gray:02x}'


def parse_ansi_to_cells(ansi):
    """Parse raw ANSI text into cell array.
    
    Handles edge cases where btop outputs more than COLS characters per line
    by truncating at the column boundary. This prevents rendering artifacts
    from terminal size desync.
    """
    cells = []
    lines = ansi.split('\n')[:ROWS]
    
    fg = None
    bg = None
    bold = 0
    
    ansi_pattern = re.compile(r'\x1b\[([0-9;]*)m')
    
    for row in range(ROWS):
        line = lines[row] if row < len(lines) else ''
        
        col = 0
        pos = 0
        
        while col < COLS and pos < len(line):
            # Check for ANSI escape at current position
            match = ansi_pattern.match(line, pos)
            
            if match:
                # Parse ANSI codes
                codes_str = match.group(1)
                codes = [int(c) for c in codes_str.split(';') if c] if codes_str else [0]
                
                i = 0
                while i < len(codes):
                    c = codes[i]
                    if c == 0:
                        fg = None
                        bg = None
                        bold = 0
                    elif c == 1:
                        bold = 1
                    elif c == 22:
                        bold = 0
                    elif c == 38 and i + 2 < len(codes) and codes[i + 1] == 5:
                        fg = get_256_color(codes[i + 2])
                        i += 2
                    elif c == 38 and i + 4 < len(codes) and codes[i + 1] == 2:
                        fg = f'{codes[i + 2]:02x}{codes[i + 3]:02x}{codes[i + 4]:02x}'
                        i += 4
                    elif c == 48 and i + 2 < len(codes) and codes[i + 1] == 5:
                        bg = get_256_color(codes[i + 2])
                        i += 2
                    elif c == 48 and i + 4 < len(codes) and codes[i + 1] == 2:
                        bg = f'{codes[i + 2]:02x}{codes[i + 3]:02x}{codes[i + 4]:02x}'
                        i += 4
                    elif c == 39:
                        fg = None
                    elif c == 49:
                        bg = None
                    elif 30 <= c <= 37:
                        fg = COLORS_16[c - 30]
                    elif 40 <= c <= 47:
                        bg = COLORS_16[c - 40]
                    elif 90 <= c <= 97:
                        fg = COLORS_16[c - 90 + 8]
                    elif 100 <= c <= 107:
                        bg = COLORS_16[c - 100 + 8]
                    i += 1
                
                pos = match.end()
            else:
                # Regular character
                char = line[pos]
                cells.append([char, fg, bg, bold])
                col += 1
                pos += 1
        
        # Pad remaining columns with spaces
        while col < COLS:
            cells.append([' ', None, None, 0])
            col += 1
    
    # Pad remaining rows if needed
    while len(cells) < TOTAL_CELLS:
        cells.append([' ', None, None, 0])
    
    return cells


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def enforce_terminal_size():
    """Send SIGWINCH to btop to force terminal size re-check.
    
    This fixes a transient issue where btop's internal terminal size
    can get out of sync with the actual tmux pane dimensions, causing
    it to render extra characters past the line boundary.
    """
    try:
        # First, ensure tmux pane is the correct size
        subprocess.run(
            ['tmux', 'resize-pane', '-t', TMUX_SESSION, '-x', str(COLS), '-y', str(ROWS)],
            capture_output=True,
            timeout=2
        )
        # Send SIGWINCH to btop to make it re-query terminal size
        # Find btop's PID inside tmux
        result = subprocess.run(
            ['tmux', 'list-panes', '-t', TMUX_SESSION, '-F', '#{pane_pid}'],
            capture_output=True,
            text=True,
            timeout=2
        )
        if result.returncode == 0 and result.stdout.strip():
            pane_pid = result.stdout.strip()
            # Find btop process (child of the shell in the pane)
            ps_result = subprocess.run(
                ['ps', '--ppid', pane_pid, '-o', 'pid='],
                capture_output=True,
                text=True,
                timeout=2
            )
            if ps_result.returncode == 0:
                for pid in ps_result.stdout.strip().split():
                    try:
                        os.kill(int(pid), signal.SIGWINCH)
                    except (ValueError, OSError):
                        pass
    except Exception as e:
        log(f"Size enforcement error: {e}")


def capture_btop_frame():
    """Capture raw ANSI from tmux."""
    try:
        result = subprocess.run(
            ['tmux', 'capture-pane', '-t', TMUX_SESSION, '-p', '-e'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return None
        return result.stdout if result.stdout.strip() else None
    except Exception as e:
        log(f"Capture error: {e}")
        return None


def frame_updater():
    """Background thread that captures and parses frames."""
    global current_cells
    log("Frame updater thread started")
    time.sleep(3)  # Wait for btop to start
    
    # Enforce terminal size on startup
    enforce_terminal_size()
    
    frame_count = 0
    while True:
        try:
            raw_frame = capture_btop_frame()
            if raw_frame:
                new_cells = parse_ansi_to_cells(raw_frame)
                with cells_lock:
                    current_cells = new_cells
            
            # Periodically enforce terminal size (every 60 frames / ~1 minute)
            frame_count += 1
            if frame_count >= 60:
                enforce_terminal_size()
                frame_count = 0
                
        except Exception as e:
            log(f"Frame update error: {e}")
        time.sleep(REFRESH_INTERVAL)


class BroadcastHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    
    def log_message(self, format, *args):
        pass
    
    def do_GET(self):
        if self.path == '/stream':
            self.handle_sse()
        elif self.path == '/' or self.path == '/index.html':
            self.serve_viewer()
        elif self.path == '/frame':
            self.serve_current_frame()
        elif self.path == '/health':
            self.serve_health()
        else:
            self.send_error(404)
    
    def serve_health(self):
        content = b'ok'
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)
    
    def handle_sse(self):
        """SSE endpoint with delta encoding."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        last_cells = None
        
        try:
            while True:
                with cells_lock:
                    cells = current_cells
                
                if cells is None:
                    # Not ready yet
                    time.sleep(0.5)
                    continue
                
                if last_cells is None:
                    # First frame - send full
                    data = json.dumps({'t': 'f', 'c': cells}, separators=(',', ':'))
                    self.wfile.write(f"data: {data}\n\n".encode())
                    self.wfile.flush()
                    last_cells = [c[:] for c in cells]  # Deep copy
                else:
                    # Calculate delta
                    deltas = []
                    for i, (new, old) in enumerate(zip(cells, last_cells)):
                        if new != old:
                            deltas.append([i] + new)
                    
                    if len(deltas) == 0:
                        # No changes
                        pass
                    elif len(deltas) > TOTAL_CELLS * 0.5:
                        # >50% changed, send full
                        data = json.dumps({'t': 'f', 'c': cells}, separators=(',', ':'))
                        self.wfile.write(f"data: {data}\n\n".encode())
                        self.wfile.flush()
                        last_cells = [c[:] for c in cells]
                    else:
                        # Send delta
                        data = json.dumps({'t': 'd', 'd': deltas}, separators=(',', ':'))
                        self.wfile.write(f"data: {data}\n\n".encode())
                        self.wfile.flush()
                        last_cells = [c[:] for c in cells]
                
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass
    
    def serve_current_frame(self):
        """Return current frame as full cell array (for debugging)."""
        with cells_lock:
            cells = current_cells
        
        if cells is None:
            data = json.dumps({'error': 'not ready'})
        else:
            data = json.dumps({'t': 'f', 'c': cells}, separators=(',', ':'))
        
        content = data.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)
    
    def serve_viewer(self):
        try:
            with open('/var/www/viewer.html', 'r') as f:
                content = f.read().encode()
        except FileNotFoundError:
            content = b"viewer.html not found"
        
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)


def main():
    log("Initializing btop broadcast server with delta encoding...")
    log(f"  Grid: {COLS}x{ROWS} = {TOTAL_CELLS} cells")
    
    updater = threading.Thread(target=frame_updater, daemon=True)
    updater.start()
    
    server = ThreadedHTTPServer(('0.0.0.0', PORT), BroadcastHandler)
    log(f"btop broadcast server running on port {PORT}")
    log(f"  Viewer: http://localhost:{PORT}/")
    log(f"  SSE stream: http://localhost:{PORT}/stream")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()
