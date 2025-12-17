#!/bin/sh
set -e

echo "Starting OG meta server on port 3002..."
node /app/og-server.js &

echo "Starting nginx on port 3000..."
nginx -g 'daemon off;' &

echo "Starting CloudFlare Tunnel..."
cloudflared tunnel --config /root/.cloudflared/config.yml run vedanta-systems-prod &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
