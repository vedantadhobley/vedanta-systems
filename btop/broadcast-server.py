#!/usr/bin/env python3
"""
btop Broadcast Server

Captures btop terminal output and broadcasts to all connected clients via SSE.
This is a true broadcast - btop runs once, all clients see the same output.

Architecture:
  btop → tmux → capture-pane → aha (ANSI→HTML) → SSE broadcast → all clients
"""

import subprocess
import time
import json
import threading
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import os

# Use WRAPPER_PORT for compatibility with existing docker-compose
PORT = int(os.environ.get('WRAPPER_PORT', os.environ.get('BROADCAST_PORT', 4102)))
TMUX_SESSION = 'btop'
REFRESH_INTERVAL = 1.0  # seconds

# Global state
current_frame = "<pre>Initializing...</pre>"
frame_lock = threading.Lock()


def log(msg):
    """Print with flush for immediate output."""
    print(msg, flush=True)


# Threaded HTTP server to handle multiple concurrent connections
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def capture_btop_frame():
    """Capture current btop display from tmux as raw ANSI."""
    try:
        # Capture with ANSI escape codes - raw terminal output
        result = subprocess.run(
            ['tmux', 'capture-pane', '-t', TMUX_SESSION, '-p', '-e'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return f"btop not running (rc={result.returncode}): {result.stderr}"
        
        ansi_output = result.stdout
        if not ansi_output.strip():
            return "Waiting for btop to start..."
        
        # Return raw ANSI - xterm.js will render it properly
        return ansi_output
        
    except subprocess.TimeoutExpired:
        return "Capture timeout"
    except Exception as e:
        return f"Error capturing btop: {type(e).__name__}: {e}"


def frame_updater():
    """Background thread that captures frames and notifies clients."""
    global current_frame
    log("Frame updater thread started")
    
    # Wait for btop to initialize
    time.sleep(3)
    
    while True:
        try:
            new_frame = capture_btop_frame()
            with frame_lock:
                current_frame = new_frame
        except Exception as e:
            log(f"Frame capture error: {e}")
        time.sleep(REFRESH_INTERVAL)


class BroadcastHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    
    def log_message(self, format, *args):
        # Log requests for debugging
        log(f"Request: {args[0]}")
    
    def do_GET(self):
        if self.path == '/stream':
            self.handle_sse()
        elif self.path == '/' or self.path == '/index.html':
            self.serve_viewer()
        elif self.path == '/frame':
            self.serve_current_frame()
        else:
            self.send_error(404)
    
    def handle_sse(self):
        """Server-Sent Events endpoint for live updates."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            last_frame = ""
            while True:
                with frame_lock:
                    frame = current_frame
                
                # Only send if frame changed (reduces bandwidth)
                if frame != last_frame:
                    # Send raw ANSI as JSON - xterm.js will render it
                    data = json.dumps({'ansi': frame})
                    self.wfile.write(f"data: {data}\n\n".encode())
                    self.wfile.flush()
                    last_frame = frame
                
                time.sleep(0.5)  # Check for updates every 500ms
                
        except (BrokenPipeError, ConnectionResetError):
            pass  # Client disconnected
    
    def serve_current_frame(self):
        """Single frame endpoint for polling fallback."""
        with frame_lock:
            frame = current_frame
        
        data = json.dumps({'ansi': frame})
        content = data.encode()
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)
    
    def serve_viewer(self):
        """Serve the viewer HTML page."""
        try:
            with open('/var/www/viewer.html', 'r') as f:
                content = f.read().encode()
        except FileNotFoundError:
            content = FALLBACK_VIEWER.encode()
        
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)


FALLBACK_VIEWER = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>btop</title>
<style>
* { margin: 0; padding: 0; }
body { background: #000; font-family: monospace; }
#terminal { 
    background: #000; 
    color: #c9a0f0;
    padding: 8px;
    font-size: 13px;
    line-height: 1.2;
    white-space: pre;
    overflow: hidden;
}
</style>
</head>
<body>
<div id="terminal">Connecting...</div>
<script>
const term = document.getElementById('terminal');
const es = new EventSource('/stream');
es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    term.innerHTML = data.html;
};
es.onerror = () => {
    term.innerHTML = 'Connection lost. Reconnecting...';
};
</script>
</body>
</html>
"""


def main():
    log("Initializing broadcast server...")
    
    # Start frame capture thread FIRST
    updater = threading.Thread(target=frame_updater, daemon=True)
    updater.start()
    log("Frame updater thread launched")
    
    # Start HTTP server immediately (don't wait for first frame)
    # Use threaded server to handle SSE + regular requests concurrently
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
