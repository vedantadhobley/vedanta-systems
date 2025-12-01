#!/bin/bash

#####################################################
# Auto-pull and rebuild script for vedanta-systems
# This script pulls latest changes and rebuilds the container
#####################################################

set -e

# Configuration
PROJECT_DIR="$HOME/projects/prod/vedanta-systems"
LOG_FILE="$HOME/projects/prod/vedanta-systems/auto-pull.log"
COMPOSE_FILE="docker-compose.yml"

# Create log file if it doesn't exist
touch "$LOG_FILE"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========================================="
log "Starting auto-pull process..."

# Check if directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log "❌ ERROR: Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# Fetch latest changes
log "📡 Fetching latest changes from origin..."
git fetch origin main

# Check if there are any updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "✅ Already up to date. No changes detected."
    log "========================================="
    exit 0
fi

log "📥 New changes detected! Pulling updates..."
log "  Current: ${LOCAL:0:8}"
log "  Remote:  ${REMOTE:0:8}"

# Pull the changes
if git pull origin main; then
    log "✅ Successfully pulled changes"
else
    log "❌ ERROR: Failed to pull changes"
    exit 1
fi

# Show what changed
log "📝 Changes:"
git log --oneline HEAD@{1}..HEAD | while read -r line; do
    log "  - $line"
done

# Rebuild and restart the container
log "🔨 Rebuilding and restarting container..."
if docker compose -f "$COMPOSE_FILE" up -d --build; then
    log "✅ Container rebuilt and restarted successfully"
else
    log "❌ ERROR: Failed to rebuild container"
    exit 1
fi

# Wait a bit for container to start
sleep 5

# Check if container is running
if docker ps | grep -q "vedanta-systems-prod"; then
    log "✅ Container is running"
else
    log "⚠️  WARNING: Container may not be running properly"
    log "Check with: docker ps"
fi

log "✅ Auto-pull completed successfully!"
log "========================================="

# Keep only last 1000 lines of log
tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
