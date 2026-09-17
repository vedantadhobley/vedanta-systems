import { createRoot, type Root } from 'react-dom/client'
import { FoundFootyBrowser } from '@/components/found-footy-browser'
import { TimezoneProvider, useTimezone } from '@/contexts/timezone-context'
import type { Fixture } from '@/types/found-footy'

const kickoff = '2026-09-16T18:00:00Z'
const noop = () => {}
let root: Root

function TimezoneToggle() {
  const { toggleMode } = useTimezone()
  return <button id="fixture-timezone" onClick={toggleMode}>Toggle timezone</button>
}

export function renderFixture(overrides: Partial<Fixture> = {}, search = false, round = 'Regular Season - 22') {
  if (!root) {
    const host = document.createElement('section')
    host.id = 'fixture-schedule-test'
    Object.assign(host.style, {
      position: 'fixed', inset: '0', padding: '16px', background: 'black',
      overflow: 'auto', zIndex: '10000',
    })
    document.body.append(host)
    root = createRoot(host)
  }
  const fixture: Fixture = {
    _id: 1,
    state: 'staging',
    presentation_state: 'upcoming',
    clock: { minute: null, extra: null },
    status: { short: 'NS', long: 'Not Started' },
    display: 'status',
    fixture: { id: 1, date: kickoff, timestamp: Date.parse(kickoff) / 1000, timezone: 'UTC', referee: null },
    league: { id: 1, name: 'Test League', country: 'USA', round, season: 2026, logo: '', flag: '' },
    teams: { home: { id: 1, name: 'Columbus Crew' }, away: { id: 2, name: 'New England Revolution' } },
    goals: { home: null, away: null },
    score: { penalty: null },
    events: [],
    ...overrides,
  }
  root.render(
    <TimezoneProvider>
      <TimezoneToggle />
      <FoundFootyBrowser
        fixtures={[fixture]}
        dateIntent="pinned"
        isLoading={false}
        hasSharedVideoRoute={false}
        currentDate="2026-09-16"
        navigableDates={['2026-09-16']}
        onSelectDate={noop}
        sharedTarget={null}
        sharedTargetStatus="idle"
        searchMode={search}
        searchQuery={search ? 'Columbus' : ''}
        searchResults={search ? [{ date: '2026-09-16', fixtures: [{ ...fixture, _search: {
          teamMatch: true, matchedEventIds: ['test-event'], matchCount: 1,
        } }] }] : []}
        isSearching={false}
        onEnterSearch={noop}
        onExitSearch={noop}
        onSearch={noop}
      />
    </TimezoneProvider>,
  )
}
