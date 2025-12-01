# Scripts Directory

This directory contains automation scripts for managing the vedanta-systems project.

## Scripts Overview

### 1. `setup-cloudflare-tunnel.sh`
**Purpose**: Sets up CloudFlare Tunnel for production environment

**Usage**:
```bash
chmod +x scripts/setup-cloudflare-tunnel.sh
./scripts/setup-cloudflare-tunnel.sh
```

**What it does**:
- Installs cloudflared CLI
- Authenticates with CloudFlare
- Creates tunnel named `vedanta-systems-prod`
- Configures DNS routing
- Sets up systemd service for auto-start

**Run once**: On production server (`~/projects/prod/vedanta-systems`)

---

### 2. `setup-auto-pull.sh`
**Purpose**: Sets up automatic git pulls and container rebuilds

**Usage**:
```bash
chmod +x scripts/setup-auto-pull.sh
./scripts/setup-auto-pull.sh
```

**What it does**:
- Creates systemd service for git pulling
- Creates systemd timer (runs every 5 minutes)
- Sets up logging
- Enables auto-start on boot

**Run once**: On production server (`~/projects/prod/vedanta-systems`)

---

### 3. `auto-pull.sh`
**Purpose**: Worker script that performs the actual git pull and rebuild

**Usage**:
```bash
# Automatically run by systemd timer
# Or manually:
./scripts/auto-pull.sh
```

**What it does**:
- Fetches latest changes from origin/main
- Checks if updates are available
- Pulls changes if found
- Rebuilds and restarts Docker container
- Logs all actions

**Note**: This script is called by the systemd service, you don't need to run it manually.

---

## Quick Setup (Production Server)

```bash
# 1. Clone to production location
mkdir -p ~/projects/prod
cd ~/projects/prod
git clone git@github.com:vedantadhobley/vedanta-systems.git
cd vedanta-systems

# 2. Make scripts executable
chmod +x scripts/*.sh

# 3. Setup CloudFlare Tunnel
./scripts/setup-cloudflare-tunnel.sh

# 4. Setup Auto-Pull
./scripts/setup-auto-pull.sh

# Done! Your site is now live with automatic deployments
```

---

## Monitoring

### CloudFlare Tunnel
```bash
sudo systemctl status cloudflared-vedanta
sudo journalctl -u cloudflared-vedanta -f
```

### Auto-Pull
```bash
sudo systemctl status vedanta-systems-autopull.timer
sudo journalctl -u vedanta-systems-autopull.service -f
tail -f ~/projects/prod/vedanta-systems/auto-pull.log
```

---

## Troubleshooting

### Scripts won't run
```bash
# Make sure they're executable
chmod +x scripts/*.sh

# Check for syntax errors
bash -n scripts/setup-cloudflare-tunnel.sh
```

### Service not starting
```bash
# Check service status
sudo systemctl status cloudflared-vedanta
sudo systemctl status vedanta-systems-autopull

# View full logs
sudo journalctl -u cloudflared-vedanta -n 100
sudo journalctl -u vedanta-systems-autopull.service -n 100
```

---

For detailed setup instructions, see [CLOUDFLARE-SETUP.md](../CLOUDFLARE-SETUP.md)
