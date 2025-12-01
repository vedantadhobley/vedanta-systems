# Port Allocation

Dev and prod run on **same machine**, so we use different port ranges to avoid collisions.

## 📊 Port Scheme

- **3xxx**: Production services
- **4xxx**: Development services

## 🗺️ Current Allocation

### Production (3xxx)
```
3000-3099: vedanta-systems
  3000     Frontend (exposed via 127.0.0.1 for CloudFlare Tunnel)

3100-3199: found-footy (future)
  3100     Dagster webserver
  3101     Mongo Express
  3102     MinIO console

3200-3299: legal-tender (future)
  3200     Dagster webserver
  3201     Mongo Express
  3202     MinIO console

3300-3399: (next project)
3400-3499: (next project)
```

### Development (4xxx)
```
4000-4099: vedanta-systems
  4000     Frontend

4100-4199: found-footy (future)
  4100     Dagster webserver
  4101     Mongo Express
  4102     MinIO console

4200-4299: legal-tender (future)
  4200     Dagster webserver
  4201     Mongo Express
  4202     MinIO console

4300-4399: (next project)
4400-4499: (next project)
```

## 📝 Rules

1. **Services** (mongo, postgres, redis): No external ports, use container names
2. **Dashboards** (UIs): Follow port ranges above
3. **Internal ports**: Stay consistent (Dagster always 3070, MinIO always 9001, etc.)
4. **External mapping**: Changes based on environment (3100 vs 4100)

## 🔌 Example

```yaml
# Dev: ~/projects/dev/found-footy/docker-compose.dev.yml
dagster-webserver:
  ports: ["4100:3070"]  # External 4100 → Internal 3070

# Prod: ~/projects/prod/found-footy/docker-compose.yml
dagster-webserver:
  ports: ["3100:3070"]  # External 3100 → Internal 3070
```

Both can run simultaneously, no collision!
