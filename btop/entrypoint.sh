#!/bin/bash
set -e

# btop broadcast server entrypoint
# Runs btop in tmux, captures output, broadcasts to all clients via SSE
# 
# Architecture:
#   btop → tmux → capture-pane → aha (ANSI→HTML) → SSE → all clients
#
# This is TRUE broadcast - btop runs once, all clients see the same rendered output.
# No per-client WebSocket connections like ttyd.

# Configuration
BTOP_HOST="${BTOP_HOST:-local}"
BROADCAST_PORT="${WRAPPER_PORT:-4102}"  # Reuse WRAPPER_PORT env var for compatibility

# Ensure config directory exists
mkdir -p /root/.config/btop/themes

# Copy themes from bundled location
if [ -d "/etc/btop/themes" ]; then
    cp /etc/btop/themes/*.theme /root/.config/btop/themes/ 2>/dev/null || true
fi

# Use mounted config or fall back to bundled config
if [ -f "/config/btop.conf" ]; then
    cp /config/btop.conf /root/.config/btop/btop.conf
elif [ -f "$BTOP_CONFIG" ]; then
    cp "$BTOP_CONFIG" /root/.config/btop/btop.conf
elif [ -f "/etc/btop/btop.conf" ]; then
    cp /etc/btop/btop.conf /root/.config/btop/btop.conf
fi

echo "Starting btop monitor for: $BTOP_HOST"

# Create tmux config with true color support
cat > /root/.tmux.conf << 'EOF'
set -g status off
set -sg escape-time 0
set -g default-terminal "tmux-256color"
# Enable 24-bit true color
set -ga terminal-overrides ",*256col*:Tc"
set -ga terminal-overrides ",xterm*:Tc"
EOF

# Determine the command to run
if [ "$BTOP_HOST" = "local" ]; then
    BTOP_CMD="/usr/local/bin/btop"
else
    # SSH to remote host and run btop
    BTOP_CMD="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -t $BTOP_HOST btop"
fi

# Start btop in a detached tmux session with fixed size for consistent capture
export TERM=xterm-256color
export COLUMNS=132
export LINES=43

# Create tmux session with explicit size
tmux new-session -d -s btop -x 132 -y 43 "$BTOP_CMD"

# Give btop time to start
sleep 1

# Force resize the pane to ensure btop sees correct dimensions
# This handles the case where btop queries terminal size before tmux fully initializes
tmux resize-pane -t btop -x 132 -y 43

# Send SIGWINCH to btop to force it to re-check terminal size
# Find the btop process and signal it
PANE_PID=$(tmux list-panes -t btop -F '#{pane_pid}')
if [ -n "$PANE_PID" ]; then
    # btop is a child of the shell in the pane
    BTOP_PID=$(ps --ppid "$PANE_PID" -o pid= 2>/dev/null | head -1 | tr -d ' ')
    if [ -n "$BTOP_PID" ]; then
        kill -WINCH "$BTOP_PID" 2>/dev/null || true
    fi
fi

# Give btop time to process the resize
sleep 1

echo "Starting broadcast server on port ${BROADCAST_PORT}..."
echo "Architecture: btop → tmux → capture → aha → SSE broadcast"
echo "All clients receive the same pre-rendered HTML (no per-client connections)"

# Start the Python broadcast server (foreground - keeps container alive)
exec python3 /usr/local/bin/broadcast-server.py
