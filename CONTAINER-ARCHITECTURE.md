# Container Architecture

How the luv project ecosystem works: vedanta-systems (frontend) + backend services (Dagster, Temporal, MinIO, etc.)

---

## 🏗️ Core Principle

**Services are isolated by container names and networks, not port numbers.**

All services use standard ports (3000, 3070, 9000, etc.) internally. No port juggling needed.

---

## 🌐 Network Architecture

### Dev Environment (`~/projects/dev/*`)

```
Projects:
  ~/projects/dev/vedanta-systems/    (port 4000 exposed)
  ~/projects/dev/dagster/            (port 4100 exposed)
  ~/projects/dev/minio/              (port 4200 exposed)
  ~/projects/dev/temporal/           (port 4300 exposed)
  etc.

All connected to: luv-dev network

Access: http://localhost:4000, http://localhost:4100, etc.

Port Scheme: 4xxx for dev (avoids collision with prod 3xxx on same machine)
```

### Prod Environment (`~/projects/prod/*`)

```
Projects:
  ~/projects/prod/vedanta-systems/   (127.0.0.1:3000 for CloudFlare Tunnel)
  ~/projects/prod/dagster/           (port 3100 exposed)
  ~/projects/prod/minio/             (port 3200 exposed)
  ~/projects/prod/temporal/          (port 3300 exposed)
  etc.

All connected to: luv-prod network

Internet access: https://vedanta.systems (via CloudFlare Tunnel)
Dashboard access: http://localhost:3100, http://localhost:3200, etc.

Port Scheme: 3xxx for prod
```

**Key**: Only vedanta-systems is exposed to internet via CloudFlare Tunnel. Backend dashboards accessed locally on the server.

---

## 📦 Configuration Examples

### vedanta-systems (This Project)

**Dev** (`docker-compose.dev.yml`):
```yaml
services:
  frontend:
    container_name: vedanta-systems-dev
    ports:
      - "4000:3000"  # Dev uses 4000 (prod uses 3000)
    networks:
      - vedanta-systems-dev
      - luv-dev
```

**Prod** (`docker-compose.yml`):
```yaml
services:
  frontend:
    container_name: vedanta-systems-prod
    ports:
      - "127.0.0.1:3000:3000"  # Only for CloudFlare Tunnel
    networks:
      - vedanta-systems-prod
      - luv-prod
```

### Backend Project (e.g., Dagster)

**Dev** (`~/projects/dev/dagster/docker-compose.dev.yml`):
```yaml
services:
  dagster-webserver:
    container_name: dagster-webserver-dev
    ports:
      - "4100:3070"  # Dev uses 4100 externally
    networks:
      - dagster-dev
      - luv-dev  # vedanta-systems-dev can call this
```

**Prod** (`~/projects/prod/dagster/docker-compose.yml`):
```yaml
services:
  dagster-webserver:
    container_name: dagster-webserver-prod
    ports:
      - "3100:3070"  # Prod uses 3100 externally
    networks:
      - dagster-prod
      - luv-prod  # vedanta-systems-prod can call this
```

---

## 🔌 Communication Patterns

### Frontend → Backend

**Dev**:
```typescript
// vedanta-systems calling dagster
const DAGSTER_URL = 'http://dagster-webserver-dev:3070';
const MINIO_URL = 'http://minio-dev:9000';
```

**Prod**:
```typescript
// vedanta-systems calling dagster
const DAGSTER_URL = 'http://dagster-webserver-prod:3070';
const MINIO_URL = 'http://minio-prod:9000';
```

---

## 🌍 How to Access Things

### Dev (Your Local Machine)

```bash
# Dev uses 4xxx ports
http://localhost:4000       # vedanta-systems
http://localhost:4100       # dagster dashboard
http://localhost:4200       # minio console
http://localhost:4300       # temporal UI
```

### Prod (Server)

**From Internet** (only frontend):
```
https://vedanta.systems
```

**Viewing Backend Dashboards** (same machine, different ports):
```bash
# Prod uses 3xxx ports (no SSH needed, same machine)
http://localhost:3100       # dagster
http://localhost:3200       # minio
http://localhost:3300       # temporal
```

**NOT exposed to internet** - only accessible via localhost on the server.

---

## 🚀 Starting Services

### Dev
```bash
cd ~/projects/dev/vedanta-systems
docker compose -f docker-compose.dev.yml up -d

cd ~/projects/dev/dagster
docker compose -f docker-compose.dev.yml up -d
# etc.
```

### Prod
```bash
cd ~/projects/prod/vedanta-systems
docker compose up -d

cd ~/projects/prod/dagster
docker compose up -d
# etc.
```

---

## 🔐 Security Model

- **Dev**: All ports exposed for easy access
- **Prod**:
  - vedanta-systems: Exposed via CloudFlare Tunnel (HTTPS, DDoS protection)
  - Backend services: NOT exposed externally
  - Dashboards: Viewed via SSH/KVM on the server itself
  - No public dashboard access = no attack surface

---

## 📊 Why This Works

1. **Container names prevent conflicts**: `dagster-webserver-dev` vs `dagster-webserver-prod`
2. **Networks provide isolation**: `luv-dev` vs `luv-prod`
3. **Same ports everywhere**: No need for 3001, 3002, etc.
4. **Simple config**: Dev and prod configs nearly identical
5. **Secure by default**: Only frontend exposed in prod

---

## 🎯 Summary

- **vedanta-systems**: Only project exposed to internet via CloudFlare Tunnel
- **Backend projects**: Communicate with frontend via `luv-dev` / `luv-prod` networks
- **Backend dashboards**: Viewed locally on server via SSH/KVM, NOT via CloudFlare Tunnel
- **No port conflicts**: All use standard ports, separated by container names and networks
