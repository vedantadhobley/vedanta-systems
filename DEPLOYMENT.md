# Vedanta Systems - AWS Lightsail Deployment Guide

This guide will walk you through deploying the vedanta-systems frontend to AWS Lightsail.

---

## 📋 Prerequisites

- AWS Account
- Domain: `vedanta.systems` (already purchased in Route 53)
- GitHub repository with code

---

## 🚀 Phase 1: Create Lightsail Instance (One-time Setup)

### Step 1: Create Lightsail Instance

1. Go to [AWS Lightsail Console](https://lightsail.aws.amazon.com/)
2. Click **Create instance**
3. Select:
   - **Instance location**: Choose closest to you (e.g., `us-east-1`)
   - **Platform**: Linux/Unix
   - **Blueprint**: OS Only → **Ubuntu 24.04 LTS**
   - **Instance plan**: **$10/month** (2GB RAM, 1 vCPU, 60GB SSD)
   - **Instance name**: `vedanta-systems-lightsail`
4. Click **Create instance**
5. Wait ~2 minutes for instance to start

### Step 2: Set Up Static IP

1. In Lightsail, go to **Networking** tab
2. Click **Create static IP**
3. Select your instance: `vedanta-systems-lightsail`
4. Name it: `vedanta-systems-ip`
5. Click **Create**
6. **Note down the IP address** (e.g., `52.12.34.56`)

### Step 3: Configure Firewall

1. Go to your instance → **Networking** tab
2. Under **IPv4 Firewall**, add these rules:
   - SSH (22) - Already there
   - HTTP (80) - Click **Add rule**
   - HTTPS (443) - Click **Add rule**

---

## 🔑 Phase 2: SSH Key Setup

### Step 1: Create SSH Key in Lightsail UI

1. Go to [Lightsail Console](https://lightsail.aws.amazon.com/)
2. Go to **Account** → **SSH keys**
3. Click **Create key pair**
4. **Important**: Select **Custom key** (not default)
   - Custom key: Unique to this instance, more secure
   - Default key: Shared across instances, less secure
5. Name it: `vedanta-systems-ssh`
6. Download the `.pem` file (save it somewhere safe, e.g., `~/.ssh/vedanta-systems-ssh.pem`)

### Step 2: Set Proper Permissions

```bash
# Make the key secure (Linux/Mac)
chmod 600 ~/.ssh/vedanta-systems-ssh.pem
```

### Step 3: Connect to Instance

```bash
# Connect with your key (replace IP with your static IP)
ssh -i ~/.ssh/vedanta-systems-ssh.pem ubuntu@YOUR_STATIC_IP
```

You should now be connected to your Lightsail instance!

---

## 🐳 Phase 3: Install Docker & Docker Compose

Run these commands on your Lightsail instance:

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo apt-get install docker-compose-plugin -y

# Verify installations
docker --version
docker compose version

# Log out and back in for group changes to take effect
exit
```

**Reconnect via SSH** (same command as before)

---

## 🌐 Phase 4: Create Shared Docker Network

This network allows containers from different projects to communicate:

```bash
docker network create vedanta-systems-network
```

---

## 📦 Phase 5: Clone and Deploy Frontend

### Step 1: Clone Repository

First, we need to generate a **second SSH key** on the instance itself (different from your admin key). This key is for the instance to pull code from GitHub:

```bash
# On the Lightsail instance (after SSH in)
# Generate GitHub deploy key (no passphrase)
ssh-keygen -t ed25519 -C "vedanta-systems-deploy" -f ~/.ssh/vedanta-systems-deploy -N ""

# View the public key
cat ~/.ssh/vedanta-systems-deploy.pub
```

**Copy the output**, then:

1. Go to your GitHub repo: `github.com/vedantadhobley/vedanta-systems`
2. Settings → Deploy keys → Add deploy key
3. Title: `vedanta-systems-deploy`
4. Paste the key from the instance
5. **Check** "Allow write access" (optional, for auto-updates)
6. Click **Add key**

### Step 2: Configure SSH for GitHub

```bash
# Add to SSH config
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/vedanta-systems-deploy
  StrictHostKeyChecking no
EOF

# Test connection
ssh -T git@github.com
# Should see: "Hi vedantadhobley! You've successfully authenticated..."
```

### Step 3: Clone Repository

```bash
cd ~
git clone git@github.com:vedantadhobley/vedanta-systems.git
cd vedanta-systems
```

### Step 4: Create Environment File

```bash
# Create .env file with your GitHub token
nano .env
```

Add this content (replace with your actual token):
```
VITE_GITHUB_TOKEN=your_github_personal_access_token_here
```

Save with `Ctrl+O`, `Enter`, `Ctrl+X`

### Step 5: Build and Run

```bash
# Build and start the container
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker ps

# Check logs
docker logs vedanta-frontend

# Test locally
curl http://localhost:3000
```

You should see your HTML output!

---

## 🔒 Phase 6: Install Nginx & SSL

### Step 1: Install Nginx

```bash
sudo apt-get install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 2: Configure Nginx for Frontend

```bash
sudo nano /etc/nginx/sites-available/vedanta-systems
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name vedanta.systems www.vedanta.systems;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save and enable:

```bash
sudo ln -s /etc/nginx/sites-available/vedanta-systems /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 3: Install SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx -y

# Get SSL certificate (replace email)
sudo certbot --nginx -d vedanta.systems -d www.vedanta.systems --email your-email@example.com --agree-tos --no-eff-email

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot will automatically update your Nginx config for HTTPS!

---

## 🌍 Phase 7: Configure DNS (Route 53)

1. Go to [Route 53 Console](https://console.aws.amazon.com/route53/)
2. Click on **Hosted zones** → `vedanta.systems`
3. Create/Update these records:

**Record 1: Root domain**
- Record name: (leave blank)
- Record type: `A`
- Value: `YOUR_STATIC_IP`
- TTL: `300`

**Record 2: WWW subdomain**
- Record name: `www`
- Record type: `A`
- Value: `YOUR_STATIC_IP`
- TTL: `300`

4. Click **Create records**

**Wait 5-10 minutes for DNS propagation**

---

## 🎉 Phase 8: Test Your Deployment

```bash
# Check if site is live (might take 5-10 min for DNS)
curl https://vedanta.systems

# Or open in browser:
# https://vedanta.systems
```

You should see your site with HTTPS! 🚀

---

## 🔄 Phase 9: Setup GitHub Actions Auto-Deploy

### Step 1: Create GitHub Secrets

1. Go to your repo: `github.com/vedantadhobley/vedanta-systems`
2. Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

**Secret 1: LIGHTSAIL_HOST**
- Name: `LIGHTSAIL_HOST`
- Value: `YOUR_STATIC_IP` (e.g., `52.12.34.56`)

**Secret 2: LIGHTSAIL_USER**
- Name: `LIGHTSAIL_USER`
- Value: `ubuntu`

**Secret 3: LIGHTSAIL_SSH_KEY**
- Name: `LIGHTSAIL_SSH_KEY`
- Value: Copy the **entire content** of your SSH private key

To get the private key content:
```bash
# On your LOCAL machine (not Lightsail):
cat ~/Downloads/LightsailDefaultKey-us-east-1.pem
```

Copy **everything** including:
```
-----BEGIN RSA PRIVATE KEY-----
...entire content...
-----END RSA PRIVATE KEY-----
```

### Step 2: Test Auto-Deploy

```bash
# On your LOCAL machine, make a small change
# Then commit and push to main
git add .
git commit -m "Test auto-deploy"
git push origin main
```

Go to your repo → **Actions** tab and watch the deployment! 

In ~2-3 minutes, your changes should be live at `https://vedanta.systems` 🎉

---

## 🛠️ Useful Commands

```bash
# SSH into Lightsail
ssh -i ~/Downloads/LightsailDefaultKey-us-east-1.pem ubuntu@YOUR_STATIC_IP

# Check container status
docker ps

# View logs
docker logs vedanta-frontend
docker logs -f vedanta-frontend  # Follow logs

# Restart container
cd ~/vedanta-systems
docker compose -f docker-compose.prod.yml restart

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Stop container
docker compose -f docker-compose.prod.yml down

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Check Nginx status
sudo systemctl status nginx

# Reload Nginx config
sudo nginx -t && sudo systemctl reload nginx
```

---

## 📊 Monitoring

```bash
# Check resource usage
docker stats

# Check disk space
df -h

# Check memory
free -h

# Check running processes
htop  # Install with: sudo apt-get install htop
```

---

## 🔧 Troubleshooting

### Container won't start
```bash
docker logs vedanta-frontend
# Check for errors in logs
```

### Can't access site
```bash
# Check if container is running
docker ps

# Check if Nginx is running
sudo systemctl status nginx

# Check firewall rules in Lightsail console
# Make sure ports 80 and 443 are open

# Test locally
curl http://localhost:3000
```

### SSL certificate issues
```bash
# Renew certificate manually
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

---

## 💰 Cost Tracking

- Lightsail instance: $10/month
- Route 53 hosted zone: $0.50/month
- DNS queries: ~$0.01/month
- **Total: ~$10.51/month**

---

## 🎯 Next Steps

After frontend is deployed:

1. Deploy `legal-tender` backend (similar process)
2. Add subdomains:
   - `api.vedanta.systems` → Backend API
   - `dagster.vedanta.systems` → Dagster UI
3. Configure Nginx to route to multiple containers

---

## 📝 Notes

- SSL certificates auto-renew every 90 days
- Lightsail includes 2TB data transfer/month
- Consider setting up automated backups (Lightsail snapshots)
- Monitor your spending in AWS Billing dashboard

---

**Need help?** Check the troubleshooting section or review the logs!
