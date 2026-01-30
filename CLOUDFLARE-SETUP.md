# CloudFlare Tunnel Setup

Sets up CloudFlare Tunnel to expose **only vedanta-systems frontend** to the internet at https://vedanta.systems

**Backend services are NOT exposed** - they're accessed locally on the server via SSH/KVM.

---

## 📋 Prerequisites

- CloudFlare account with vedanta.systems domain
- Production server with vedanta-systems deployed
- SSH access to server

---

## 🚀 Setup (One-Time)

### 1. Clone to Production

```bash
# SSH into server
ssh user@your-server

# Clone to prod location
mkdir -p ~/projects/prod
cd ~/projects/prod
git clone git@github.com:vedantadhobley/vedanta-systems.git
cd vedanta-systems
```

### 2. Create .env File

```bash
nano .env
```

Add:
```env
VITE_GITHUB_TOKEN=your_token_here
```

### 3. Start Container

```bash
docker compose up -d --build
docker ps  # Should show vedanta-systems-prod on port 3100
```

### 4. Run CloudFlare Tunnel Setup

```bash
./scripts/setup-cloudflare-tunnel.sh
```

This will:
- Install cloudflared
- Open browser for authentication
- Create tunnel named `vedanta-systems-prod`
- Configure DNS for vedanta.systems and www.vedanta.systems
- Set up systemd service

### 5. Setup Auto-Pull (Optional)

```bash
./scripts/setup-auto-pull.sh
```

Auto-pulls from GitHub every 5 minutes and rebuilds container.

---

## ✅ Verify

```bash
# Check tunnel is running
sudo systemctl status cloudflared-vedanta

# Test from anywhere
curl https://vedanta.systems
```

---

## 🔧 Managing Tunnel

```bash
# View logs
sudo journalctl -u cloudflared-vedanta -f

# Restart
sudo systemctl restart cloudflared-vedanta

# Stop
sudo systemctl stop cloudflared-vedanta

# Check tunnel info
cloudflared tunnel info vedanta-systems-prod
```

---

## 🖥️ Viewing Backend Dashboards

Backend dashboards (Dagster, MinIO, Temporal, etc.) are **NOT exposed via CloudFlare Tunnel**.

Access them via SSH/KVM on the server:

```bash
# SSH into server
ssh user@your-server

# Open browser on the server at:
http://localhost:3200  # found-footy Dagster
http://localhost:3201  # found-footy Mongo Express
http://localhost:3202  # found-footy MinIO console
```

Or use SSH port forwarding:

```bash
# From your local machine
ssh -L 3200:localhost:3200 user@your-server

# Then open locally:
http://localhost:3200
```

---

## 🎯 Key Points

- **Only frontend exposed**: vedanta.systems via CloudFlare Tunnel
- **Backend dashboards**: Viewed locally on server, not via tunnel
- **Security**: No public dashboard access = smaller attack surface
- **Communication**: Frontend communicates with backends via `luv-prod` network

---

## 📚 More Info

- CloudFlare Tunnel Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- Container Architecture: See [CONTAINER-ARCHITECTURE.md](./CONTAINER-ARCHITECTURE.md)
