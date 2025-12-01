# Vedanta Systems

A modern, Dockerized frontend application featuring a cyberpunk corporate terminal aesthetic.

**Live Site:** https://vedanta.systems

## Tech Stack

- **Vite** - Lightning-fast build tool
- **React 18** - UI library with TypeScript
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - High-quality component library
- **Docker** - Containerized deployment
- **AWS Lightsail** - Production hosting ($10/month)

## Project Structure

```
.
├── src/                    # Source code
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Main App component
│   └── index.css          # Global styles
├── public/                # Static assets
├── index.html             # HTML entry point
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies
├── Dockerfile             # Docker configuration
└── README.md              # This file
```

## 🔌 Port Configuration

**Port Range:** 3000-3099 (Vedanta-systems allocation)

**Development Access (via SSH forwarding):**
- **Frontend:** http://localhost:3000

**Production:**
- **Live Site:** https://vedanta.systems

> See [Multi-Project Setup Guide](../MULTI_PROJECT_SETUP.md) for full port allocation details.

## Getting Started

### Prerequisites
- Node.js 16+ and npm/yarn
- Docker (for containerization)

### Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```
   The app will open at `http://localhost:3000`

3. **Run type checking:**
   ```bash
   npm run type-check
   ```

4. **Lint code:**
   ```bash
   npm run lint
   ```

### Building

1. **Build for production:**
   ```bash
   npm run build
   ```
   Output will be in the `dist/` directory

2. **Preview production build locally:**
   ```bash
   npm run preview
   ```

## Docker

### Building the Docker Image

```bash
docker build -t vedanta-systems-frontend:latest .
```

### Running Locally with Docker

```bash
docker run -p 3000:3000 vedanta-systems-frontend:latest
```

Visit `http://localhost:3000`

### Docker Image Details

- **Base Image:** `node:18-alpine` (lightweight, production-ready)
- **Multi-stage build:** Optimized for smaller final image size
- **Health check:** Built-in health check endpoint
- **Port:** 3000 (configurable via environment)

---

## 🚀 Deployment

### Production (AWS Lightsail)

**Full guide:** See [DEPLOYMENT.md](./DEPLOYMENT.md)

#### Quick Setup

```bash
# 1. Create Lightsail instance ($10/mo, Ubuntu 22.04, 2GB RAM)
# 2. Install Docker & Docker Compose
# 3. Clone repo and deploy
cd ~/vedanta-systems
docker-compose -f docker-compose.prod.yml up -d --build

# 4. Setup Nginx + SSL
sudo apt-get install nginx certbot python3-certbot-nginx -y
sudo certbot --nginx -d vedanta.systems

# 5. Point DNS to instance IP in Route 53
```

#### Auto-Deploy with GitHub Actions

Every push to `main` automatically deploys:

1. Add GitHub secrets:
   - `LIGHTSAIL_HOST` - Your instance IP
   - `LIGHTSAIL_USER` - `ubuntu`
   - `LIGHTSAIL_SSH_KEY` - Your private key content

2. Push to main → Live in 2-3 minutes! ✨

---

## ⚙️ Configuration

### Environment Variables

Create `.env` for local development:

```env
VITE_GITHUB_TOKEN=your_github_personal_access_token
```

Variables must be prefixed with `VITE_` to be exposed to the client.

### Tailwind Customization

Edit `tailwind.config.js`:
- Custom colors (lavender #a57fd8, dark theme)
- Typography (monospace fonts)
- Responsive breakpoints

### TypeScript

- Full type safety with strict mode
- Path aliases configured (`@/*` → `src/*`)
- Type definitions for all dependencies

---

## 📜 Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (port 5173) |
| `npm run build` | Build for production → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript type checking |

---

## 🐳 Docker

### Local Development with Docker

```bash
# Build image
docker build -t vedanta-systems:latest .

# Run container
docker run -p 3000:3000 vedanta-systems:latest

# Or use docker-compose
docker-compose up
```

### Production

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 📦 Project Structure

```
vedanta-systems/
├── src/
│   ├── components/
│   │   ├── github-contribution-graph.tsx
│   │   └── ui/                      # shadcn components
│   ├── lib/
│   │   └── utils.ts                 # Utilities
│   ├── App.tsx                      # Main component
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Global styles
├── public/                          # Static assets
├── .github/workflows/
│   └── deploy.yml                   # Auto-deploy
├── docker-compose.prod.yml          # Production config
├── Dockerfile                       # Multi-stage build
├── DEPLOYMENT.md                    # Deployment guide
└── package.json                     # Dependencies
```

---

## 🎯 Features

- ✨ **Animated GitHub Contribution Graph** - Real-time data with wave reveal
- 🎨 **Cyberpunk Aesthetic** - Dark theme with lavender accents
- 🔄 **Auto-refresh** - Live connection status monitoring
- 🌊 **Wave Animation** - Smooth 60fps reveal/erase effects
- 📱 **Responsive** - Works on all screen sizes
- ⚡ **Fast** - Vite HMR, optimized builds
- 🔒 **Type-safe** - Full TypeScript coverage
- 🐳 **Containerized** - Production-ready Docker setup

---

## 💰 Costs

**Local Development:** Free  
**Production (Lightsail):** ~$10-12/month
- Lightsail instance (2GB RAM): $10/mo
- Route 53 hosted zone: $0.50/mo
- SSL Certificate: Free (Let's Encrypt)

---

## 📚 Resources

- [Vite Documentation](https://vitejs.dev)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [TypeScript](https://www.typescriptlang.org)
- [AWS Lightsail](https://aws.amazon.com/lightsail/)

---

## 🤝 Contributing

This is a personal project, but feel free to open issues or submit PRs!

---

**Built with ❤️ for the cyberpunk corpo terminal aesthetic**