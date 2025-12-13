# Quick Deployment Commands

## Initial Setup (One-time)

```bash
# 1. SSH into your production server
ssh user@your-server

# 2. Install Docker (if not installed)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt-get install docker-compose-plugin -y

# 3. Create shared network
docker network create luv-prod

# 4. Setup GitHub SSH key
ssh-keygen -t ed25519 -C "deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub  # Add to GitHub deploy keys

# 5. Clone repo
mkdir -p ~/projects/prod
cd ~/projects/prod
git clone git@github.com:vedantadhobley/vedanta-systems.git
cd vedanta-systems

# 6. Create .env file
cp .env.example .env
nano .env  # Add your values

# 7. Deploy container
docker compose up -d --build

# 8. Setup Cloudflare Tunnel
./scripts/setup-cloudflare-tunnel.sh

# 9. (Optional) Setup auto-pull
./scripts/setup-auto-pull.sh
```

## Daily Usage

### Deploy updates
```bash
cd ~/projects/prod/vedanta-systems
git pull
docker compose up -d --build
```

### View logs
```bash
docker logs -f vedanta-systems-prod
```

### Restart
```bash
docker compose restart
```

### Stop
```bash
docker compose down
```

## Cloudflare Tunnel Management

```bash
# Check tunnel status
sudo systemctl status cloudflared-vedanta

# View tunnel logs
sudo journalctl -u cloudflared-vedanta -f

# Restart tunnel
sudo systemctl restart cloudflared-vedanta
```

## GitHub Actions Auto-Deploy

Add these secrets to GitHub repo settings:
- `PROD_HOST`: Your server hostname/IP
- `PROD_USER`: Your SSH username
- `PROD_SSH_KEY`: Content of your SSH private key

Then every push to `main` auto-deploys! ✨
