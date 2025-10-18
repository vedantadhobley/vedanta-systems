# Quick Deployment Commands

## Initial Setup (One-time)
```bash
# 1. Create Lightsail instance ($10/month, Ubuntu 22.04)
# 2. Attach static IP
# 3. Open ports 22, 80, 443

# 4. SSH in
ssh -i ~/path/to/key.pem ubuntu@YOUR_IP

# 5. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
sudo apt-get install docker-compose-plugin -y

# 6. Create network
docker network create vedanta-network

# 7. Setup GitHub SSH key
ssh-keygen -t ed25519 -C "deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub  # Add to GitHub deploy keys

# 8. Clone repo
git clone git@github.com:vedantadhobley/vedanta-systems.git
cd vedanta-systems

# 9. Create .env file
echo "VITE_GITHUB_TOKEN=your_token_here" > .env

# 10. Deploy
docker-compose -f docker-compose.prod.yml up -d --build

# 11. Install Nginx + SSL
sudo apt-get install nginx certbot python3-certbot-nginx -y
# Configure Nginx (see DEPLOYMENT.md)
sudo certbot --nginx -d vedanta.systems -d www.vedanta.systems

# 12. Setup DNS in Route 53
# Point vedanta.systems to YOUR_IP
```

## Daily Usage

### Deploy updates
```bash
cd ~/vedanta-systems
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

### View logs
```bash
docker logs -f vedanta-frontend
```

### Restart
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Stop
```bash
docker-compose -f docker-compose.prod.yml down
```

## GitHub Actions Auto-Deploy

Add these secrets to GitHub repo settings:
- `LIGHTSAIL_HOST`: Your static IP
- `LIGHTSAIL_USER`: `ubuntu`
- `LIGHTSAIL_SSH_KEY`: Content of your .pem file

Then every push to `main` auto-deploys! ✨
