#!/bin/bash
set -e

# btop server entrypoint
# Runs btop in a persistent tmux session, serves via ttyd
# Nginx serves a wrapper page that embeds ttyd and fixes browser quirks

# Configuration
BTOP_HOST="${BTOP_HOST:-local}"  # "local" or SSH target like "user@host"
WRAPPER_PORT="${WRAPPER_PORT:-7680}"
TTYD_PORT="${TTYD_PORT:-7681}"

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

# Create tmux config to hide status bar and allow resizing
cat > /root/.tmux.conf << 'EOF'
set -g status off
set -sg escape-time 0
set -g default-terminal "xterm-256color"
set -g aggressive-resize on
setw -g window-size latest
EOF

# Determine the command to run
if [ "$BTOP_HOST" = "local" ]; then
    BTOP_CMD="/usr/local/bin/btop"
else
    # SSH to remote host and run btop
    # Requires SSH key to be mounted at /root/.ssh/id_rsa
    BTOP_CMD="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -t $BTOP_HOST btop"
fi

# Start btop in a detached tmux session
# Don't set fixed size - let it adapt to client window
tmux new-session -d -s btop "$BTOP_CMD"

# Give btop time to fully initialize
sleep 2

# Create nginx config to serve wrapper and proxy ttyd
cat > /etc/nginx/nginx.conf << EOF
worker_processes 1;
daemon off;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    
    server {
        listen ${WRAPPER_PORT};
        
        # Proxy everything to ttyd
        location / {
            proxy_pass http://127.0.0.1:${TTYD_PORT}/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_read_timeout 86400;
        }
    }
}
EOF

echo "Starting ttyd on internal port ${TTYD_PORT}..."

# Start ttyd in background
# - disableLeaveAlert: no "confirm leave" prompt
# - disableResizeOverlay: no terminal size popup on resize
ttyd -p "${TTYD_PORT}" \
    -t "disableLeaveAlert=true" \
    -t "disableResizeOverlay=true" \
    -t "titleFixed=btop" \
    -t "fontSize=13" \
    -t "theme={\"background\": \"#000000\"}" \
    tmux attach-session -t btop -r &

# Give ttyd a moment to start
sleep 1

echo "Starting nginx wrapper on port ${WRAPPER_PORT}..."

# Start nginx (foreground - this keeps the container alive)
exec nginx
