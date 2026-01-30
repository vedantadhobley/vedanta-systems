# Vedanta Systems

A modern, Dockerized frontend application featuring a cyberpunk corporate terminal aesthetic.

**Live Site:** https://vedanta.systems

## Tech Stack

- **Vite** - Lightning-fast build tool
- **React 18** - UI library with TypeScript
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - High-quality component library
- **Express** - API server for backend integrations
- **nginx** - Reverse proxy (production only)
- **Docker** - Containerized deployment
- **Cloudflare Tunnel** - Secure production hosting (free)

---

## 🏗️ Architecture

### Why nginx?

Cloudflare Tunnel exposes only **one port** (3000) to the internet. But the browser needs to reach both:
1. **Static files** (React app)
2. **API endpoints** (SSE stream, video proxy, health checks)

nginx solves this by routing requests on a single port:
- `/` → Static files
- `/api/*` → API server

### Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      USER'S BROWSER                                  │
│                                                                      │
│  1. Load page      → GET https://vedanta.systems/                   │
│  2. Health check   → GET https://vedanta.systems/api/found-footy/health
│  3. SSE stream     → GET https://vedanta.systems/api/found-footy/stream
│  4. Watch video    → GET https://vedanta.systems/api/found-footy/video/*
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE TUNNEL                                 │
│                 vedanta.systems → localhost:3100                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              NGINX (vedanta-systems-prod:3000)                       │
│                                                                      │
│    GET /              → /app/dist/index.html (static)               │
│    GET /assets/*      → /app/dist/assets/* (static)                 │
│    GET /api/*         → proxy to API container :3001                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
           ┌────────────────────┴────────────────────┐
           │                                         │
           ▼                                         ▼
┌─────────────────────────┐           ┌─────────────────────────────────┐
│   STATIC FILES          │           │   API (vedanta-systems-prod-api) │
│   /app/dist/*           │           │   Port 3001 (NOT exposed)        │
│                         │           │                                   │
│   - index.html          │           │   /api/found-footy/health        │
│   - assets/             │           │   /api/found-footy/stream (SSE)  │
│   - photos/             │           │   /api/found-footy/fixtures      │
└─────────────────────────┘           │   /api/found-footy/video/*       │
                                      │   /api/found-footy/refresh       │
                                      └───────────────┬───────────────────┘
                                                      │
                                                      │ Docker network
                                                      ▼
                                      ┌─────────────────────────────────┐
                                      │   BACKEND SERVICES (luv-prod)   │
                                      │                                  │
                                      │   - MongoDB (fixture data)       │
                                      │   - MinIO (video storage)        │
                                      │   - found-footy (triggers /refresh)
                                      └─────────────────────────────────┘
```

### What Goes Through nginx vs Docker Network

| Request | Source | Path | Goes Through nginx? |
|---------|--------|------|---------------------|
| Load React app | Browser | `vedanta.systems/` | ✅ Yes |
| Health check | Browser | `vedanta.systems/api/found-footy/health` | ✅ Yes |
| SSE stream | Browser | `vedanta.systems/api/found-footy/stream` | ✅ Yes |
| Video playback | Browser | `vedanta.systems/api/found-footy/video/*` | ✅ Yes |
| Trigger refresh | found-footy backend | `vedanta-systems-prod-api:3001/api/found-footy/refresh` | ❌ No (Docker network) |

### Development vs Production

| | Development | Production |
|---|-------------|------------|
| Frontend | localhost:4100 (Vite HMR) | vedanta.systems (nginx) |
| API | localhost:4101 (direct) | vedanta.systems/api/* (nginx proxy) |
| nginx | Not used | Routes all traffic |
| Why different? | Both ports exposed locally | Only port 3000 via Cloudflare |

---

## Project Structure

```
.
├── src/
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # Main App component
│   ├── components/            # React components
│   ├── hooks/                 # Custom React hooks
│   │   └── useFootyStream.ts  # SSE hook for Found Footy
│   ├── types/                 # TypeScript types
│   ├── server/                # Express API server
│   │   ├── index.ts           # Main server entry
│   │   └── routes/            # API routes by project
│   │       └── found-footy.ts # Found Footy endpoints
│   └── index.css              # Global styles
├── public/                    # Static assets
├── nginx.conf                 # Production reverse proxy config
├── Dockerfile                 # Production build (nginx + cloudflared)
├── Dockerfile.api             # API server build
├── Dockerfile.dev             # Development frontend build
├── docker-compose.yml         # Production compose
├── docker-compose.dev.yml     # Development compose
└── README.md                  # This file
```

## 🔌 Port Configuration

**Development (localhost via Docker):**
| Service | Port | Container |
|---------|------|-----------|
| Frontend (Vite) | 4000 | vedanta-systems-dev |
| API | 4001 | vedanta-systems-dev-api |

**Production (via Cloudflare Tunnel):**
| Service | Port | Container | Exposed? |
|---------|------|-----------|----------|
| nginx | 3000 | vedanta-systems-prod | ✅ via Cloudflare |
| API | 3001 | vedanta-systems-prod-api | ❌ internal only |

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development without Docker)

### Development with Docker (Recommended)

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up -d --build

# View logs
docker logs -f vedanta-systems-dev

# Stop
docker compose -f docker-compose.dev.yml down
```

Access at http://localhost:4100

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Build production Docker image
docker compose up -d --build
```

---

## 🚀 Deployment

### Production (Cloudflare Tunnel)

**Full guide:** See [CLOUDFLARE-SETUP.md](./CLOUDFLARE-SETUP.md)

#### Quick Setup

```bash
# 1. Clone to production server
git clone git@github.com:vedantadhobley/vedanta-systems.git
cd vedanta-systems

# 2. Create .env file
cp .env.example .env
# Edit .env with your values

# 3. Start container
docker compose up -d --build

# 4. Setup Cloudflare Tunnel
./scripts/setup-cloudflare-tunnel.sh

# 5. (Optional) Setup auto-pull
./scripts/setup-auto-pull.sh
```

The Cloudflare Tunnel exposes nginx on port 3000, which routes to both static files and the API. The API container is never directly exposed to the internet.

---

## ⚙️ Configuration

### Environment Variables

Create `.env` for both development and production:

```env
# GitHub API (for contribution graph)
VITE_GITHUB_TOKEN=your_github_personal_access_token

# Found Footy - MongoDB credentials (same as found-footy project)
FOUND_FOOTY_MONGO_USER=ffuser
FOUND_FOOTY_MONGO_PASS=ffpass

# Found Footy - MinIO/S3 credentials (same as found-footy project)
FOUND_FOOTY_S3_USER=ffuser
FOUND_FOOTY_S3_PASS=ffpass
```

**Development only** (set in docker-compose.dev.yml):
```env
VITE_FOOTY_API_URL=http://localhost:4101/api/found-footy
```

**Production** (baked into build via docker-compose.yml):
```env
VITE_FOOTY_API_URL=https://vedanta.systems/api/found-footy
```

### Tailwind Customization

Edit `tailwind.config.js`:
- Custom colors (lavender #a57fd8, dark theme)
- Typography (monospace fonts)
- Responsive breakpoints

---

## 📜 Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript type checking |

---

## 🐳 Docker

### Development

```bash
# Start with hot reload
docker compose -f docker-compose.dev.yml up -d --build

# View logs
docker logs -f vedanta-systems-dev
```

### Production

```bash
# Build and start
docker compose up -d --build

# Check status
docker ps
```

---

## 📦 Project Structure

```
vedanta-systems/
├── src/
│   ├── components/
│   │   ├── found-footy-browser.tsx  # Found Footy UI
│   │   ├── github-contribution-graph.tsx
│   │   ├── project-status.tsx       # Reusable project header
│   │   └── ui/                      # shadcn components
│   ├── hooks/
│   │   └── useFootyStream.ts        # SSE hook for Found Footy
│   ├── types/
│   │   └── found-footy.ts           # TypeScript types
│   ├── server/
│   │   ├── index.ts                 # Express API entry point
│   │   └── routes/
│   │       └── found-footy.ts       # /api/found-footy/* routes
│   ├── App.tsx                      # Main component
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Global styles
├── public/                          # Static assets
├── scripts/
│   ├── setup-cloudflare-tunnel.sh   # Tunnel setup
│   └── setup-auto-pull.sh           # Auto-deploy setup
├── nginx.conf                       # Production reverse proxy
├── docker-compose.yml               # Production config
├── docker-compose.dev.yml           # Development config
├── Dockerfile                       # Production build (nginx)
├── Dockerfile.api                   # API server build
├── Dockerfile.dev                   # Development build
├── CLOUDFLARE-SETUP.md              # Deployment guide
└── package.json                     # Dependencies
```

---

## 🌐 API Endpoints

All API endpoints are mounted under `/api/{project}/`:

### Found Footy (`/api/found-footy/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Backend health status (MongoDB, MinIO) |
| `/fixtures` | GET | All active and completed fixtures |
| `/stream` | GET | SSE stream for real-time updates |
| `/video/:bucket/*` | GET | Proxy video from MinIO |
| `/download/:bucket/*` | GET | Download video (Content-Disposition: attachment) |
| `/refresh` | POST | Trigger SSE broadcast (called by found-footy backend) |

### Global (`/api/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Global API health check |

---

## 🎯 Features

- ✨ **Animated GitHub Contribution Graph** - Real-time data with wave reveal
- 🎨 **Cyberpunk Aesthetic** - Dark theme with lavender accents
- 🔄 **Real-time Updates** - SSE for live data streaming
- 🌊 **Wave Animation** - Smooth 60fps reveal/erase effects
- 📱 **Responsive** - Works on all screen sizes
- ⚡ **Fast** - Vite HMR, optimized builds
- 🔒 **Type-safe** - Full TypeScript coverage
- 🐳 **Containerized** - Production-ready Docker setup
- 🔐 **Secure** - Cloudflare Tunnel (no exposed ports)

---

## 💰 Costs

**Local Development:** Free  
**Production (Cloudflare Tunnel):** Free
- Cloudflare Tunnel: Free tier
- Domain (optional): Varies by registrar

---

## 📚 Resources

- [Vite Documentation](https://vitejs.dev)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

---

**Built with ❤️ for the cyberpunk corpo terminal aesthetic**
