# Found Footy Monitoring Pane

Implementation plan for showing live Grafana/Loki stats on the found-footy project page.

## Overview

Add a "monitor" pane to the found-footy project page header (alongside the existing README pane)
that shows live system stats, infrastructure health, and pipeline activity — styled in the
corpo theme, not as a Grafana iframe.

**Architecture**: Express API → Loki HTTP API → React components (same pattern as found-footy data)

## Prerequisites

### Networking (monitor stack)

Loki is currently only on the `monitor` Docker network. The vedanta-systems API container
can't reach it. Fix: add `luv-dev` and `luv-prod` networks to the Loki service in
`~/workspace/monitor/docker-compose.yml` (same as Prometheus already has).

See `~/workspace/monitor/FRONTEND_INTEGRATION.md` for the exact change and full Loki API reference.

After that, the API container can query `http://monitor-loki:3100` on the shared luv network.

---

## Changes Required

### 1. Express API — New Route (`src/server/routes/monitor.ts`)

A new Express router mounted at `/api/monitor` with two endpoints:

#### `GET /api/monitor/found-footy/stats`

Returns a single JSON object with all system state + health indicators.
Queries Loki once for the latest scaler heartbeat, plus 4 error count queries.

**Response shape:**

```json
{
  "system": {
    "workers": 2,
    "twitter": 1,
    "searching": 3,
    "inProgress": 5,
    "today": 12,
    "allTime": 847,
    "videos": 1923
  },
  "health": {
    "llmVision": 0,
    "mongodb": 0,
    "s3": 0,
    "workers": 0
  },
  "timestamp": "2026-02-06T14:30:00Z"
}
```

**Implementation notes:**

- Fetch the latest scaler heartbeat log:
  ```
  GET http://monitor-loki:3100/loki/api/v1/query
    ?query={module="scaler", action="heartbeat"} | json
    &limit=1
  ```
  Parse the log line JSON to extract `active_workflows`, `twitter_running`, etc.

- Fetch error counts (can run in parallel with `Promise.all`):
  ```
  GET http://monitor-loki:3100/loki/api/v1/query
    ?query=sum(count_over_time({container=~"found-footy-.*", level="ERROR", module="rag"} [1h])) or vector(0)
  ```
  (One query per health category — see monitor/FRONTEND_INTEGRATION.md for all 4)

- Cache responses for 15-30 seconds to avoid hammering Loki on every browser refresh.

#### `GET /api/monitor/found-footy/activity?hours=1&step=5m`

Returns time series data for sparkline charts (pipeline activity over the last N hours).

**Response shape:**

```json
{
  "downloads": [[1707220800, 3], [1707221100, 5], ...],
  "uploads": [[1707220800, 1], [1707221100, 2], ...],
  "searches": [[1707220800, 8], [1707221100, 4], ...],
  "step": "5m",
  "start": "2026-02-06T13:30:00Z",
  "end": "2026-02-06T14:30:00Z"
}
```

Uses Loki range queries. See monitor/FRONTEND_INTEGRATION.md for the LogQL.

#### Mount in `src/server/index.ts`

```typescript
import { createMonitorRouter } from './routes/monitor'

const monitorRouter = createMonitorRouter()
app.use('/api/monitor', monitorRouter)
```

No config/credentials needed — Loki has no auth.

---

### 2. React Component — `src/components/found-footy-monitor.tsx`

A new component that renders the monitoring pane.

#### Design (corpo theme)

The pane should match the existing found-footy-browser aesthetic:
- `font-mono` throughout, `uppercase tracking-wider` for labels
- `text-corpo-text/50` for labels, `text-corpo-text` for values
- `text-lavender` for active/highlighted states
- `bg-corpo-dark` or `bg-corpo-panel` for card backgrounds
- `border-corpo-border` for subtle dividers
- No border-radius (the theme uses `borderRadius: 0` everywhere)
- Transitions: `transition-none` or `linear-snap` (corpo timing)

#### Layout

```
┌─────────────────────────────────────────────────────────┐
│  SYSTEM STATUS                                          │
│                                                         │
│  workers 2    twitter 1    searching 3    in progress 5 │
│  today 12     all-time 847     videos 1923              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                         │
│                                                         │
│  ● llm/vision    ● mongodb    ● s3    ● workers        │
│    (green=ok, red=errors in last hour)                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  PIPELINE (1h)                          ▁▂▃▅▃▂▁▃▅▇▅▃  │
│                                                         │
│  downloads ▁▂▃▁▂    uploads ▁▁▂▁    searches ▃▅▃▂▁▃   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **System Status**: 7 stat values from scaler heartbeat. Numbers are large mono text.
- **Infrastructure**: 4 health indicators. Green dot (`bg-lavender`) = 0 errors.
  Red dot + error count = errors in the last hour. Uses the ping animation from ProjectStatus.
- **Pipeline**: Tiny sparkline charts (pure CSS or inline SVG — no charting library needed).
  Each sparkline is ~50px tall, shows last 12 data points (1h at 5m intervals).

#### Sparklines

The simplest sparkline is an inline SVG `<polyline>` with the data points mapped to y-coordinates:

```tsx
function Sparkline({ data, color = 'lavender' }: { data: number[], color?: string }) {
  const max = Math.max(...data, 1)
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * 100},${100 - (v / max) * 100}`
  ).join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-8">
      <polyline
        points={points}
        fill="none"
        stroke={`hsl(var(--${color}))`}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
```

No dependencies required.

#### Data Fetching

Use a simple polling hook — no SSE needed for this (stats update every ~30s anyway):

```tsx
function useMonitorStats(pollInterval = 30_000) {
  const [stats, setStats] = useState<MonitorStats | null>(null)
  const [activity, setActivity] = useState<PipelineActivity | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      const [statsRes, activityRes] = await Promise.all([
        fetch('/api/monitor/found-footy/stats'),
        fetch('/api/monitor/found-footy/activity?hours=1&step=5m')
      ])
      setStats(await statsRes.json())
      setActivity(await activityRes.json())
    }

    fetchStats()
    const interval = setInterval(fetchStats, pollInterval)
    return () => clearInterval(interval)
  }, [pollInterval])

  return { stats, activity }
}
```

Poll every 30 seconds. The Express API caches Loki responses for 15-30s, so this is lightweight.

---

### 3. Integration — Header Pane Toggle

The found-footy project page currently has the `ProjectStatus` bar with:
```
● online / readme / repository
```

Add a **monitor** button to that bar:
```
● online / readme / monitor / repository
```

Clicking "monitor" toggles the monitoring pane (same pattern as the README viewer toggle).
The pane appears between ProjectStatus and FoundFootyBrowser, pushing the video browser down.

In `App.tsx`, the `FoundFootyContent` component currently renders:
```tsx
<ProjectStatus githubUrl="..." isConnected={isBackendOnline} />
<FoundFootyBrowser ... />
```

This becomes:
```tsx
<ProjectStatus githubUrl="..." isConnected={isBackendOnline} showMonitor onToggleMonitor={...} />
{showMonitor && <FoundFootyMonitor />}
<FoundFootyBrowser ... />
```

The ProjectStatus component gets an optional `onToggleMonitor` prop to render the extra button.

---

### 4. Docker Compose — No Changes to vedanta-systems

The API container is already on `luv-dev` / `luv-prod`. Once Loki joins those networks
(a one-line change in `~/workspace/monitor/docker-compose.yml`), the API can reach
`http://monitor-loki:3100` with no compose changes to vedanta-systems.

---

## File Summary

| File | Change | Status |
|------|--------|--------|
| `~/workspace/monitor/docker-compose.yml` | Add `luv-dev` + `luv-prod` to Loki service networks | todo |
| `~/workspace/monitor/FRONTEND_INTEGRATION.md` | New doc — Loki API reference + queries | done |
| `src/server/routes/monitor.ts` | New file — Express routes for `/api/monitor/*` | todo |
| `src/server/index.ts` | Mount monitor router | todo |
| `src/components/found-footy-monitor.tsx` | New file — React monitoring pane | todo |
| `src/components/project-status.tsx` | Add "monitor" toggle button | todo |
| `src/App.tsx` | Wire up monitor pane toggle in FoundFootyContent | todo |

## Polling vs SSE

Polling at 30s is the right choice here (not SSE) because:

1. Loki data inherently has latency (promtail ships logs every ~5s, Loki indexes them)
2. The scaler only emits heartbeats every ~30s
3. Stat panels in Grafana itself use 30s auto-refresh for this dashboard
4. It avoids adding SSE complexity for data that doesn't need sub-second updates
5. The Express API can cache Loki responses, serving many frontend clients from one Loki query

## Error Handling

- If Loki is unreachable, the Express route returns `503` with `{ error: "monitoring unavailable" }`
- The React component shows a subtle "monitoring offline" state (dimmed, no stats)
- The health indicators show as grey (unknown) rather than red (errors) when Loki is down
- Sparklines show nothing (empty chart area) when activity data is unavailable
