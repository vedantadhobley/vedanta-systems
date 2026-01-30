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
  ~/projects/dev/vedanta-systems/    (port 4100 exposed)
  ~/projects/dev/found-footy/        (port 4200 exposed - Dagster, Mongo Express, MinIO)
  ~/projects/dev/legal-tender/       (port 4300 exposed)
  etc.

All connected to: luv-dev network

Access: http://localhost:4100, http://localhost:4200, etc.

Port Scheme: 4xxx for dev (avoids collision with prod 3xxx on same machine)
             4000-4099 reserved for new stack
```

### Prod Environment (`~/projects/prod/*`)

```
Projects:
  ~/projects/prod/vedanta-systems/   (port 3100, CloudFlare Tunnel points here)
  ~/projects/prod/found-footy/       (port 3200 - Dagster, Mongo Express, MinIO)
  ~/projects/prod/legal-tender/      (port 3300)
  etc.

All connected to: luv-prod network

Internet access: https://vedanta.systems (via CloudFlare Tunnel)
Dashboard access: http://localhost:3200, http://localhost:3300, etc.

Port Scheme: 3xxx for prod
             3000-3099 reserved for new stack
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
      - "4100:3000"  # Dev uses 4100 (prod uses 3100)
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
      - "3100:3000"  # CloudFlare Tunnel points here
    networks:
      - vedanta-systems-prod
      - luv-prod
```

### Backend Project (e.g., Dagster)

**Dev** (`~/projects/dev/found-footy/docker-compose.dev.yml`):
```yaml
services:
  dagster-webserver:
    container_name: found-footy-dev-dagster
    ports:
      - "4200:3070"  # Dev uses 4200 externally
    networks:
      - found-footy-dev
      - luv-dev  # vedanta-systems-dev can call this
```

**Prod** (`~/projects/prod/found-footy/docker-compose.yml`):
```yaml
services:
  dagster-webserver:
    container_name: found-footy-prod-dagster
    ports:
      - "3200:3070"  # Prod uses 3200 externally
    networks:
      - found-footy-prod
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
# Dev uses 4xxx ports (4000-4099 reserved)
http://localhost:4100       # vedanta-systems
http://localhost:4200       # found-footy dagster dashboard
http://localhost:4201       # found-footy mongo express
http://localhost:4202       # found-footy minio console
```

### Prod (Server)

**From Internet** (only frontend):
```
https://vedanta.systems
```

**Viewing Backend Dashboards** (same machine, different ports):
```bash
# Prod uses 3xxx ports (3000-3099 reserved)
http://localhost:3200       # found-footy dagster
http://localhost:3201       # found-footy mongo express
http://localhost:3202       # found-footy minio console
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
