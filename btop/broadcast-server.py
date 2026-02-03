#!/usr/bin/env python3
"""
btop Broadcast Server

Captures btop terminal output and broadcasts via SSE.

Architecture:
  btop → tmux → capture-pane (ANSI) → SSE broadcast
"""

import subprocess
import time
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import os

PORT = int(os.environ.get('WRAPPER_PORT', os.environ.get('BROADCAST_PORT', 4102)))
TMUX_SESSION = 'btop'
REFRESH_INTERVAL = 1.0

current_frame = "Initializing..."
frame_lock = threading.Lock()


def log(msg):
    print(msg, flush=True)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def capture_btop_frame():
    try:
        result = subprocess.run(
            ['tmux', 'capture-pane', '-t', TMUX_SESSION, '-p', '-e'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return "btop not running"
        
        return result.stdout if result.stdout.strip() else "Waiting for btop..."
        
    except subprocess.TimeoutExpired:
        return "Capture timeout"
    except Exception as e:
        return f"Error: {e}"


def frame_updater():
    global current_frame
    log("Frame updater thread started")
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
                
                if frame != last_frame:
                    data = json.dumps({'frame': frame})
                    self.wfile.write(f"data: {data}\n\n".encode())
                    self.wfile.flush()
                    last_frame = frame
                
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass
    
    def serve_current_frame(self):
        with frame_lock:
            frame = current_frame
        
        data = json.dumps({'frame': frame})
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
    log("Initializing btop broadcast server...")
    
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
