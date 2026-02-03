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
# Using 120x41 - extra row because first line sometimes gets cut off
export TERM=xterm-256color
tmux new-session -d -s btop -x 100 -y 45 "$BTOP_CMD"

# Give btop time to fully initialize
sleep 2

echo "Starting broadcast server on port ${BROADCAST_PORT}..."
echo "Architecture: btop → tmux → capture → aha → SSE broadcast"
echo "All clients receive the same pre-rendered HTML (no per-client connections)"

# Start the Python broadcast server (foreground - keeps container alive)
exec python3 /usr/local/bin/broadcast-server.py
