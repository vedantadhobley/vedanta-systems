#!/bin/sh
set -e

# Cloudflared was extracted into ~/workspace/proxy/ as a sibling service.
# This container is now just nginx + the OG image server.

echo "Starting OG meta server on port 3002..."
node /app/og-server.js &

echo "Starting nginx on port 3000..."
nginx -g 'daemon off;' &

# Wait for any process to exit; exit with its status
wait -n
exit $?
