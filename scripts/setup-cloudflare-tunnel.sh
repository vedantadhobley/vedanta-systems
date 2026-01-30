#!/bin/bash

#####################################################
# CloudFlare Tunnel Setup Script for vedanta.systems
# This script sets up cloudflared tunnel for production
#####################################################

set -e

echo "========================================="
echo "CloudFlare Tunnel Setup for vedanta.systems"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "❌ Please do not run this script as root"
   exit 1
fi

# Variables
TUNNEL_NAME="vedanta-systems-prod"
SERVICE_URL="http://localhost:3100"
INSTALL_DIR="$HOME/.cloudflared"

echo "📋 Configuration:"
echo "  Tunnel Name: $TUNNEL_NAME"
echo "  Service URL: $SERVICE_URL"
echo "  Install Dir: $INSTALL_DIR"
echo ""

# Step 1: Install cloudflared
echo "📦 Step 1: Installing cloudflared..."
if command -v cloudflared &> /dev/null; then
    echo "✅ cloudflared is already installed"
    cloudflared --version
else
    echo "Installing cloudflared..."
    
    # Download and install cloudflared
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    
    echo "✅ cloudflared installed successfully"
    cloudflared --version
fi
echo ""

# Step 2: Create config directory
echo "📁 Step 2: Creating config directory..."
mkdir -p "$INSTALL_DIR"
echo "✅ Directory created: $INSTALL_DIR"
echo ""

# Step 3: Login to CloudFlare
echo "🔑 Step 3: CloudFlare Login"
echo "This will open a browser window for authentication..."
echo "Press Enter to continue..."
read -r

cloudflared tunnel login

if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo "❌ Login failed. cert.pem not found."
    exit 1
fi

echo "✅ Successfully logged in to CloudFlare"
echo ""

# Step 4: Create tunnel
echo "🚇 Step 4: Creating tunnel..."
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo "⚠️  Tunnel '$TUNNEL_NAME' already exists"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    echo "✅ Tunnel created successfully"
fi
echo "Tunnel ID: $TUNNEL_ID"
echo ""

# Step 5: Create config file
echo "📝 Step 5: Creating tunnel config..."
cat > "$INSTALL_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $INSTALL_DIR/$TUNNEL_ID.json

ingress:
  # Frontend
  - hostname: vedanta.systems
    service: $SERVICE_URL
  - hostname: www.vedanta.systems
    service: $SERVICE_URL
  
  # Backend API (add when ready)
  # - hostname: api.vedanta.systems
  #   service: http://localhost:8080
  
# Step 6: Configure DNS
echo "🌐 Step 6: Configuring DNS..."
echo "Setting up DNS routes for:"
echo "  - vedanta.systems"
echo "  - www.vedanta.systems"
echo ""
echo "To add more subdomains later, run:"
echo "  cloudflared tunnel route dns $TUNNEL_NAME <subdomain>.vedanta.systems"
echo "  Then update ~/.cloudflared/config.yml and restart the service"
echo ""

cloudflared tunnel route dns "$TUNNEL_NAME" vedanta.systems || echo "⚠️  DNS route for vedanta.systems may already exist"
cloudflared tunnel route dns "$TUNNEL_NAME" www.vedanta.systems || echo "⚠️  DNS route for www.vedanta.systems may already exist"

echo "✅ DNS configured"
echo ""

echo "✅ Config file created: $INSTALL_DIR/config.yml"
echo ""

# Step 6: Configure DNS
echo "🌐 Step 6: Configuring DNS..."
echo "Setting up DNS routes for:"
echo "  - vedanta.systems"
echo "  - www.vedanta.systems"

cloudflared tunnel route dns "$TUNNEL_NAME" vedanta.systems || echo "⚠️  DNS route for vedanta.systems may already exist"
cloudflared tunnel route dns "$TUNNEL_NAME" www.vedanta.systems || echo "⚠️  DNS route for www.vedanta.systems may already exist"

echo "✅ DNS configured"
echo ""

# Step 7: Install as systemd service
echo "⚙️  Step 7: Installing systemd service..."

sudo tee /etc/systemd/system/cloudflared-vedanta.service > /dev/null <<EOF
[Unit]
Description=CloudFlare Tunnel for vedanta.systems
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/bin/cloudflared tunnel --config $INSTALL_DIR/config.yml run $TUNNEL_NAME
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cloudflared-vedanta.service
sudo systemctl start cloudflared-vedanta.service

echo "✅ Systemd service installed and started"
echo ""

# Step 8: Verify
echo "🔍 Step 8: Verifying setup..."
sleep 3

if sudo systemctl is-active --quiet cloudflared-vedanta.service; then
    echo "✅ CloudFlare tunnel is running!"
else
    echo "❌ Service is not running. Check logs with:"
    echo "   sudo journalctl -u cloudflared-vedanta.service -f"
    exit 1
fi
echo ""

echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Your website should now be accessible at:"
echo "  🌐 https://vedanta.systems"
echo "  🌐 https://www.vedanta.systems"
echo ""
echo "Useful commands:"
echo "  Status:  sudo systemctl status cloudflared-vedanta"
echo "  Logs:    sudo journalctl -u cloudflared-vedanta -f"
echo "  Restart: sudo systemctl restart cloudflared-vedanta"
echo "  Stop:    sudo systemctl stop cloudflared-vedanta"
echo ""
echo "Tunnel info: cloudflared tunnel info $TUNNEL_NAME"
echo ""
