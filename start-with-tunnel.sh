#!/bin/sh
set -e

echo "Starting application server on port 3000..."
serve -s dist -l 3000 &

echo "Starting CloudFlare Tunnel..."
cloudflared tunnel --config /root/.cloudflared/config.yml run vedanta-systems-prod &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
