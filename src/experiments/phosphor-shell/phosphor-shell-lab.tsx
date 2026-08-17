import { useMemo, useState, type CSSProperties } from 'react'
import './phosphor-shell-lab.css'

type ProjectId = 'found-footy' | 'vedanta-systems' | 'long-exposure' | 'spin-cycle'

interface ProjectStudy {
  id: ProjectId
  index: string
  name: string
  role: string
  state: string
  metric: string
  metricLabel: string
  side: 'left' | 'right'
  rows: Array<{ label: string; value: string; tone?: 'live' | 'good' | 'quiet' }>
}

const PROJECTS: ProjectStudy[] = [
  {
    id: 'found-footy',
    index: '01',
    name: 'FOUND FOOTY',
    role: 'LIVE EVENT / CLIP DISCOVERY',
    state: 'TRACKING',
    metric: '03',
    metricLabel: 'ACTIVE',
    side: 'left',
    rows: [
      { label: 'FIXTURE 1429803', value: "HOME  1 — 1  AWAY     67'", tone: 'live' },
      { label: 'EVENT 7C21', value: 'GOAL · SEARCHING · 02 CLIPS' },
      { label: 'FEED', value: 'REST SNAPSHOT + NATS HINTS', tone: 'good' },
    ],
  },
  {
    id: 'vedanta-systems',
    index: '02',
    name: 'VEDANTA SYSTEMS',
    role: 'STEM / OPERATIONS',
    state: 'NOMINAL',
    metric: '02',
    metricLabel: 'NODES',
    side: 'right',
    rows: [
      { label: 'LUV', value: 'CPU 07% · MEM 31% · GPU 02%', tone: 'good' },
      { label: 'JOI', value: 'CPU 04% · MEM 18% · LINK 12ms', tone: 'good' },
      { label: 'INGRESS', value: 'CLOUDFLARE → CADDY → NGINX', tone: 'quiet' },
    ],
  },
  {
    id: 'long-exposure',
    index: '03',
    name: 'LONG EXPOSURE',
    role: 'MARKET NARRATION',
    state: 'SETTLED',
    metric: '14',
    metricLabel: 'EVENTS',
    side: 'left',
    rows: [
      { label: 'SESSION', value: '2026.08.16 · CLOSED' },
      { label: 'EXTREME', value: 'POST-CANCEL PRESSURE · NVDA' },
      { label: 'NARRATION', value: '14 EVENTS · 04 SYMBOLS', tone: 'good' },
    ],
  },
  {
    id: 'spin-cycle',
    index: '04',
    name: 'SPIN CYCLE',
    role: 'CLAIM VERIFICATION',
    state: 'ONLINE',
    metric: '21',
    metricLabel: 'CLAIMS',
    side: 'right',
    rows: [
      { label: 'TRANSCRIPT', value: 'INGEST COMPLETE · 00:43:12' },
      { label: 'VERDICT', value: 'SUPPORTED 12 · MIXED 06 · FALSE 03' },
      { label: 'EVIDENCE', value: 'CHAINS RESOLVED', tone: 'good' },
    ],
  },
]

function ExcitedValue({ value, pulse }: { value: string; pulse: number }) {
  return (
    <span className="ps-excited-value">
      <span className="ps-excited-core">{value}</span>
      <span key={pulse} aria-hidden="true" className="ps-excited-emission">
        {value}
      </span>
    </span>
  )
}

function ProjectCell({
  project,
  sequence,
  selected,
  pulse,
  onSelect,
}: {
  project: ProjectStudy
  sequence: number
  selected: boolean
  pulse: number
  onSelect: () => void
}) {
  return (
    <div
      className={`ps-project-slot ps-project-slot--${project.side} ${selected ? 'is-selected' : ''}`}
      style={{
        '--ps-cell-delay': `${190 + sequence * 92}ms`,
        '--ps-connector-delay': `${170 + sequence * 92}ms`,
      } as CSSProperties}
    >
      <span aria-hidden="true" className="ps-connector" />
      <span aria-hidden="true" className="ps-junction" />
      <button
        type="button"
        className="ps-project-cell"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span aria-hidden="true" className="ps-cell-emission" />
        <span className="ps-cell-index">CELL {project.index}</span>
        <span className="ps-cell-heading">
          <span className="ps-cell-name">{project.name}</span>
          <span className={`ps-cell-state ${project.id === 'found-footy' ? 'is-live' : ''}`}>
            {project.state}
          </span>
        </span>
        <span className="ps-cell-role">{project.role}</span>
        <span className="ps-cell-reading">
          <ExcitedValue value={String(Number(project.metric) + pulse).padStart(2, '0')} pulse={pulse} />
          <span>{project.metricLabel}</span>
        </span>
      </button>
    </div>
  )
}

function ProjectPanel({
  project,
  pulse,
  onClose,
  onExcite,
}: {
  project: ProjectStudy
  pulse: number
  onClose: () => void
  onExcite: () => void
}) {
  return (
    <section className="ps-project-panel" aria-labelledby="ps-project-title">
      <span key={`panel-${pulse}`} aria-hidden="true" className="ps-panel-afterglow" />

      <header className="ps-panel-header">
        <div>
          <span className="ps-kicker">CELL {project.index} / INSTRUMENT ACTIVE</span>
          <h1 id="ps-project-title">{project.name}</h1>
          <p>{project.role}</p>
        </div>
        <button type="button" className="ps-key" onClick={onClose}>
          <span aria-hidden="true">◀</span> COLLAPSE
        </button>
      </header>

      <div className="ps-panel-grid">
        <div className="ps-primary-readout">
          <span className="ps-readout-label">CURRENT ACTIVITY</span>
          <ExcitedValue
            value={String(Number(project.metric) + pulse).padStart(2, '0')}
            pulse={pulse}
          />
          <span className="ps-readout-unit">{project.metricLabel}</span>
        </div>

        <div className="ps-record-stack">
          {project.rows.map((row, index) => (
            <div className="ps-record-row" key={row.label}>
              <span className="ps-record-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="ps-record-label">{row.label}</span>
              <span className={`ps-record-value ${row.tone ? `is-${row.tone}` : ''}`}>
                {index === 0 ? <ExcitedValue value={row.value} pulse={pulse} /> : row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <footer className="ps-panel-controls">
        <button type="button" className="ps-key ps-key--primary" onClick={onExcite}>
          SIMULATE LIVE SIGNAL
        </button>
        <span className="ps-control-note">STATE CHANGES NOW · LIGHT DECAYS AFTER</span>
      </footer>
    </section>
  )
}

export default function PhosphorShellLab() {
  const [bootCycle, setBootCycle] = useState(0)
  const [selectedId, setSelectedId] = useState<ProjectId | null>(null)
  const [signals, setSignals] = useState<Record<ProjectId, number>>({
    'found-footy': 0,
    'vedanta-systems': 0,
    'long-exposure': 0,
    'spin-cycle': 0,
  })

  const selectedProject = useMemo(
    () => PROJECTS.find((project) => project.id === selectedId) ?? null,
    [selectedId],
  )
  const openedAt = useMemo(() => {
    const now = new Date()
    const date = now.toLocaleDateString('en-CA').replaceAll('-', '.')
    const time = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    })
    return `${date} / ${time}`
  }, [])

  const replay = () => {
    setSelectedId(null)
    setBootCycle((cycle) => cycle + 1)
  }

  const excite = (id: ProjectId) => {
    setSignals((current) => ({ ...current, [id]: current[id] + 1 }))
  }

  return (
    <main className={`ps-lab ${selectedProject ? 'is-project-open' : ''}`}>
      <div aria-hidden="true" className="ps-atmosphere" />
      <div aria-hidden="true" className="ps-screen-material" />

      <div key={bootCycle} className="ps-machine">
        <header className="ps-system-header">
          <div className="ps-identity">
            <span className="ps-kicker">PUBLIC INSTRUMENT / LUV</span>
            <span className="ps-wordmark" data-text="VEDANTA SYSTEMS">
              VEDANTA SYSTEMS
            </span>
          </div>

          <div className="ps-header-status" aria-label="System status nominal">
            <span className="ps-status-light" />
            <span>NOMINAL</span>
            <span className="ps-header-clock">{openedAt}</span>
          </div>

          <button type="button" className="ps-key ps-replay" onClick={replay}>
            REPLAY POWER SEQUENCE
          </button>
        </header>

        <div className="ps-workspace">
          <nav className="ps-cell-map" aria-label="Project cells">
            <div aria-hidden="true" className="ps-stem">
              <span className="ps-stem-label">ONE STEM / LUV</span>
            </div>

            {PROJECTS.map((project, index) => (
              <ProjectCell
                key={project.id}
                project={project}
                sequence={index}
                selected={selectedId === project.id}
                pulse={signals[project.id]}
                onSelect={() => setSelectedId(project.id)}
              />
            ))}
          </nav>

          {selectedProject ? (
            <ProjectPanel
              key={selectedProject.id}
              project={selectedProject}
              pulse={signals[selectedProject.id]}
              onClose={() => setSelectedId(null)}
              onExcite={() => excite(selectedProject.id)}
            />
          ) : (
            <section className="ps-idle-copy" aria-label="Navigation guidance">
              <span className="ps-kicker">CELLS INTERLINKED / SELECT AN INSTRUMENT</span>
              <p>
                Four operating surfaces share one stem. Each cell carries a quiet live reading;
                selection expands the instrument without leaving the system.
              </p>
            </section>
          )}
        </div>

        <footer className="ps-system-footer">
          <span>DESIGN LAB / NOT PRODUCTION</span>
          <span>SEMANTIC CORE · EMISSION · SCREEN MATERIAL</span>
          <span>REDUCED MOTION SUPPORTED</span>
        </footer>
      </div>
    </main>
  )
}
