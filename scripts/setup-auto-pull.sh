#!/bin/bash

#####################################################
# Setup auto-pull systemd service and timer
# This sets up automatic git pulls every 5 minutes
#####################################################

set -e

echo "========================================="
echo "Auto-Pull Systemd Service Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "❌ Please do not run this script as root"
   exit 1
fi

# Variables
PROJECT_DIR="$HOME/projects/prod/vedanta-systems"
SCRIPT_PATH="$PROJECT_DIR/scripts/auto-pull.sh"
SERVICE_NAME="vedanta-systems-autopull"

echo "📋 Configuration:"
echo "  Project Dir: $PROJECT_DIR"
echo "  Script Path: $SCRIPT_PATH"
echo "  Service Name: $SERVICE_NAME"
echo ""

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo "⚠️  WARNING: Project directory does not exist: $PROJECT_DIR"
    echo "This is expected if you haven't cloned to ~/projects/prod yet."
    echo "The service will be created but won't work until you:"
    echo "  1. Clone the repo to ~/projects/prod/vedanta-systems"
    echo "  2. Run this setup again"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Make auto-pull script executable
if [ -f "$SCRIPT_PATH" ]; then
    chmod +x "$SCRIPT_PATH"
    echo "✅ Made auto-pull script executable"
else
    echo "⚠️  WARNING: Auto-pull script not found at $SCRIPT_PATH"
fi
echo ""

# Create systemd service file
echo "📝 Step 1: Creating systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Auto-pull and rebuild vedanta-systems
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/bin/bash $SCRIPT_PATH
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Service file created: /etc/systemd/system/${SERVICE_NAME}.service"
echo ""

# Create systemd timer file (runs every 5 minutes)
echo "⏰ Step 2: Creating systemd timer..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.timer > /dev/null <<EOF
[Unit]
Description=Auto-pull vedanta-systems every 5 minutes
Requires=${SERVICE_NAME}.service

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

echo "✅ Timer file created: /etc/systemd/system/${SERVICE_NAME}.timer"
echo ""

# Reload systemd
echo "🔄 Step 3: Reloading systemd daemon..."
sudo systemctl daemon-reload
echo "✅ Daemon reloaded"
echo ""

# Enable and start timer
echo "🚀 Step 4: Enabling and starting timer..."
sudo systemctl enable ${SERVICE_NAME}.timer
sudo systemctl start ${SERVICE_NAME}.timer
echo "✅ Timer enabled and started"
echo ""

# Show status
echo "🔍 Step 5: Verifying setup..."
if sudo systemctl is-active --quiet ${SERVICE_NAME}.timer; then
    echo "✅ Auto-pull timer is running!"
else
    echo "❌ Timer is not running. Check logs with:"
    echo "   sudo journalctl -u ${SERVICE_NAME}.timer -f"
    exit 1
fi
echo ""

echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "The system will now automatically:"
echo "  📡 Check for updates every 5 minutes"
echo "  📥 Pull changes if available"
echo "  🔨 Rebuild and restart the container"
echo ""
echo "Useful commands:"
echo "  Timer status:    sudo systemctl status ${SERVICE_NAME}.timer"
echo "  Service status:  sudo systemctl status ${SERVICE_NAME}.service"
echo "  View logs:       sudo journalctl -u ${SERVICE_NAME}.service -f"
echo "  Trigger now:     sudo systemctl start ${SERVICE_NAME}.service"
echo "  Stop timer:      sudo systemctl stop ${SERVICE_NAME}.timer"
echo "  Disable timer:   sudo systemctl disable ${SERVICE_NAME}.timer"
echo ""
echo "Timer schedule:"
sudo systemctl list-timers ${SERVICE_NAME}.timer
echo ""
