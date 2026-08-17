import { useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { BtopMonitor } from '@/components/btop-monitor'
import { FoundFootyBrowser } from '@/components/found-footy-browser'
import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import { LongExposureBrowser } from '@/components/long-exposure-browser'
import { ProjectStatus } from '@/components/project-status'
import { SpinCycleBrowser } from '@/components/spin-cycle-browser'
import { FootyStreamProvider, useFootyStream } from '@/contexts/FootyStreamContext'
import { SpinCycleStreamProvider, useSpinCycleStream } from '@/contexts/SpinCycleStreamContext'
import { TimezoneProvider } from '@/contexts/timezone-context'
import './phosphor-shell-lab.css'

type ProjectId = 'vedanta-systems' | 'found-footy' | 'long-exposure' | 'spin-cycle'

interface ProjectDefinition {
  id: ProjectId
  index: string
  name: string
  role: string
}

const PROJECTS: ProjectDefinition[] = [
  {
    id: 'vedanta-systems',
    index: '01',
    name: 'VEDANTA SYSTEMS',
    role: 'LIVE SYSTEMS',
  },
  {
    id: 'found-footy',
    index: '02',
    name: 'FOUND FOOTY',
    role: 'MATCHES + CLIPS',
  },
  {
    id: 'long-exposure',
    index: '03',
    name: 'LONG EXPOSURE',
    role: 'MARKET EVENTS',
  },
  {
    id: 'spin-cycle',
    index: '04',
    name: 'SPIN CYCLE',
    role: 'CLAIM EVIDENCE',
  },
]

const GITHUB_URLS: Record<ProjectId, string> = {
  'vedanta-systems': 'https://github.com/vedantadhobley/vedanta-systems',
  'found-footy': 'https://github.com/vedantadhobley/found-footy',
  'long-exposure': 'https://github.com/vedantadhobley/long-exposure',
  'spin-cycle': 'https://github.com/vedantadhobley/spin-cycle',
}

function SystemsSurface() {
  return (
    <div className="ps2-project-content ps2-systems">
      <ProjectStatus githubUrl={GITHUB_URLS['vedanta-systems']} />
      <div className="ps2-monitor-heading" aria-hidden="true">
        <span>LIVE TERMINAL FRAME</span>
        <span>CHANGED CELLS EXCITE / 200MS DECAY</span>
      </div>
      <div className="ps2-monitor-grid">
        <BtopMonitor label="luv" apiPrefix="/api/btop-luv" phosphor />
        <BtopMonitor label="joi" apiPrefix="/api/btop-joi" phosphor />
      </div>
    </div>
  )
}

function FoundFootySurface() {
  const {
    stagingFixtures,
    activeFixtures,
    completedFixtures,
    isBackendOnline,
    isLoading,
    isChangingDate,
    lastUpdate,
    pauseStream,
    resumeStream,
    currentDate,
    navigableDates,
    setDate,
    goToToday,
    goToPreviousDate,
    goToNextDate,
    navigateToEvent,
    searchMode,
    searchQuery,
    searchResults,
    isSearching,
    searchTotalFixtures,
    enterSearch,
    exitSearch,
    executeSearch,
  } = useFootyStream()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const eventId = searchParams.get('v')
  const shareId = searchParams.get('s')
  const initialVideo = eventId ? { eventId, shareId: shareId || undefined } : null

  return (
    <div className="ps2-project-content">
      <ProjectStatus githubUrl={GITHUB_URLS['found-footy']} isConnected={isBackendOnline} />
      <FoundFootyBrowser
        stagingFixtures={stagingFixtures}
        fixtures={activeFixtures}
        completedFixtures={completedFixtures}
        isConnected={isBackendOnline}
        isLoading={isLoading}
        isChangingDate={isChangingDate}
        lastUpdate={lastUpdate}
        initialVideo={initialVideo}
        onPauseStream={pauseStream}
        onResumeStream={resumeStream}
        currentDate={currentDate}
        navigableDates={navigableDates}
        onDateChange={setDate}
        onGoToToday={goToToday}
        onPreviousDate={goToPreviousDate}
        onNextDate={goToNextDate}
        onNavigateToEvent={navigateToEvent}
        searchMode={searchMode}
        searchQuery={searchQuery}
        searchResults={searchResults}
        isSearching={isSearching}
        searchTotalFixtures={searchTotalFixtures}
        onEnterSearch={enterSearch}
        onExitSearch={exitSearch}
        onSearch={executeSearch}
      />
    </div>
  )
}

function SpinCycleSurface() {
  const {
    transcripts,
    isBackendOnline,
    isLoading,
    lastUpdate,
    fetchClaimDetail,
  } = useSpinCycleStream()

  return (
    <div className="ps2-project-content">
      <ProjectStatus githubUrl={GITHUB_URLS['spin-cycle']} isConnected={isBackendOnline} />
      <SpinCycleBrowser
        transcripts={transcripts}
        isConnected={isBackendOnline}
        isLoading={isLoading}
        lastUpdate={lastUpdate}
        fetchClaimDetail={fetchClaimDetail}
      />
    </div>
  )
}

function ProjectSurface({ project }: { project: ProjectDefinition }) {
  switch (project.id) {
    case 'vedanta-systems':
      return <SystemsSurface />
    case 'found-footy':
      return (
        <TimezoneProvider>
          <FootyStreamProvider>
            <FoundFootySurface />
          </FootyStreamProvider>
        </TimezoneProvider>
      )
    case 'long-exposure':
      return (
        <div className="ps2-project-content">
          <ProjectStatus githubUrl={GITHUB_URLS['long-exposure']} />
          <LongExposureBrowser />
        </div>
      )
    case 'spin-cycle':
      return (
        <SpinCycleStreamProvider>
          <SpinCycleSurface />
        </SpinCycleStreamProvider>
      )
  }
}

function ExpansionFrame({
  project,
  revealCycle,
  children,
}: {
  project: ProjectDefinition
  revealCycle: number
  children: ReactNode
}) {
  return (
    <section
      key={`${project.id}-${revealCycle}`}
      className="ps2-instrument"
      data-project={project.id}
      aria-labelledby="ps2-instrument-title"
    >
      <span aria-hidden="true" className="ps2-pop ps2-pop--one" />
      <span aria-hidden="true" className="ps2-pop ps2-pop--two" />
      <span aria-hidden="true" className="ps2-pop ps2-pop--three" />

      <header className="ps2-instrument-header">
        <div>
          <span className="ps2-index">CELL {project.index} / ACTIVE INSTRUMENT</span>
          <h1 id="ps2-instrument-title">{project.name}</h1>
        </div>
        <span className="ps2-role">{project.role}</span>
      </header>

      <div className="ps2-instrument-body">{children}</div>
    </section>
  )
}

export default function PhosphorShellLab() {
  const [activeId, setActiveId] = useState<ProjectId>('vedanta-systems')
  const [revealCycle, setRevealCycle] = useState(0)
  const activeProject = useMemo(
    () => PROJECTS.find((project) => project.id === activeId) ?? PROJECTS[0],
    [activeId],
  )

  const selectProject = (id: ProjectId) => {
    setActiveId(id)
    setRevealCycle((cycle) => cycle + 1)
  }

  return (
    <main className="ps2-lab">
      <div className="ps2-scroll content-scroll">
        <header className="ps2-header">
          <div className="ps2-identity">
            <span className="ps2-eyebrow">PUBLIC OPERATIONS / LUV</span>
            <span className="ps2-wordmark">VEDANTA SYSTEMS</span>
          </div>

          <div className="ps2-status" aria-label="Design lab status">
            <span className="ps2-status-light" />
            <span>DESIGN LAB / LIVE DATA</span>
          </div>

          <button
            type="button"
            className="ps2-replay"
            onClick={() => setRevealCycle((cycle) => cycle + 1)}
          >
            REPLAY 3-BEAT OPEN
          </button>
        </header>

        <section className="ps2-contributions" aria-label="GitHub contributions">
          <div className="ps2-rail-label">
            <span>CONTRIBUTION HISTORY</span>
            <span>REAL DATA / 12 MONTHS</span>
          </div>
          <GitHubContributionGraph username="vedantadhobley" />
        </section>

        <nav className="ps2-project-nav" aria-label="Project instruments">
          {PROJECTS.map((project) => {
            const selected = project.id === activeId
            return (
              <button
                key={project.id}
                type="button"
                className="ps2-project-key"
                data-project={project.id}
                aria-pressed={selected}
                onClick={() => selectProject(project.id)}
              >
                <span className="ps2-key-index">{project.index}</span>
                <span className="ps2-key-copy">
                  <span className="ps2-key-name">{project.name}</span>
                  <span className="ps2-key-role">{project.role}</span>
                </span>
                <span aria-hidden="true" className="ps2-key-state" />
              </button>
            )
          })}
        </nav>

        <ExpansionFrame project={activeProject} revealCycle={revealCycle}>
          <ProjectSurface project={activeProject} />
        </ExpansionFrame>

        <footer className="ps2-footer">
          <span>EXPLORATION 02 / NOT PRODUCTION</span>
          <span>REAL SURFACES · RESTRAINED COLOR · DATA-DRIVEN EMISSION</span>
        </footer>
      </div>
    </main>
  )
}
