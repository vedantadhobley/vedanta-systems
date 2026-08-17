import { useState } from 'react'

import {
  InstrumentAction,
  InstrumentDisclosure,
  InstrumentIcon,
  PhosphorData,
  type PhosphorTone,
} from '@/components/instrument'

interface EventRow {
  detail: string
  player: string
  score: string
  time: string
  tone?: PhosphorTone
}

const initialEvents: EventRow[] = [
  { score: 'Arsenal (2) - 1 Liverpool', time: "68'", detail: 'Goal', player: 'Martin Ødegaard', tone: 'accent' },
  { score: 'Arsenal 1 - (1) Liverpool', time: "42'", detail: 'Goal', player: 'Mohamed Salah' },
  { score: 'Arsenal (1) - 0 Liverpool', time: "14'", detail: 'Goal', player: 'Bukayo Saka' },
]

function FixtureEvent({ event, exciteKey }: { event: EventRow; exciteKey: number }) {
  return (
    <div className="fixture-study__event">
      <span className="fixture-study__event-glyph" aria-hidden="true">+</span>
      <span className="fixture-study__event-copy">
        <PhosphorData className="fixture-study__event-title" exciteKey={exciteKey} tone={event.tone}>
          {event.score}
        </PhosphorData>
        <PhosphorData className="fixture-study__event-detail" exciteKey={exciteKey} tone="quiet">
          {event.time} {event.detail} — {event.player}
        </PhosphorData>
      </span>
      <PhosphorData className="fixture-study__clip-count" exciteKey={exciteKey} tone="quiet">
        [3]
      </PhosphorData>
    </div>
  )
}

export function FoundFootyFixtureWorkbench() {
  const [expanded, setExpanded] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [homeScore, setHomeScore] = useState(2)
  const [minute, setMinute] = useState(73)
  const [events, setEvents] = useState(initialEvents)

  const simulateGoal = () => {
    const nextScore = homeScore + 1
    setHomeScore(nextScore)
    setMinute((current) => Math.min(current + 4, 90))
    setEvents((current) => [
      {
        score: `Arsenal (${nextScore}) - 1 Liverpool`,
        time: `${Math.min(minute + 4, 90)}'`,
        detail: 'Goal',
        player: 'Declan Rice',
        tone: 'live',
      },
      ...current,
    ])
    setDataVersion((current) => current + 1)
  }

  const reset = () => {
    setExpanded(false)
    setHomeScore(2)
    setMinute(73)
    setEvents(initialEvents)
    setDataVersion((current) => current + 1)
  }

  return (
    <main className="instrument-workbench instrument-scope">
      <div className="instrument-workbench__page">
        <header className="instrument-workbench__header">
          <PhosphorData className="instrument-workbench__eyebrow" tone="accent">
            COMPONENT STUDY / 01
          </PhosphorData>
          <h1>Found Footy fixture cell</h1>
          <p>
            Compact and expanded are two settled frames. The cut is immediate;
            emitted light registers the change of scale.
          </p>
        </header>

        <section className="instrument-workbench__stage" aria-labelledby="fixture-study-title">
          <div className="instrument-workbench__stage-label" id="fixture-study-title">
            <PhosphorData tone="quiet">ENGLAND — PREMIER LEAGUE</PhosphorData>
            <PhosphorData active tone="live">LIVE / 1</PhosphorData>
          </div>

          <InstrumentDisclosure
            className="fixture-study"
            contentId="fixture-study-events"
            expanded={expanded}
            onExpandedChange={setExpanded}
            tone="live"
            summary={(
              <>
                <PhosphorData className="fixture-study__toggle-icon" exciteKey={expanded ? 'open' : 'closed'} tone="quiet">
                  <InstrumentIcon name={expanded ? 'collapse' : 'expand'} />
                </PhosphorData>

                <span className="fixture-study__identity">
                  <span className="fixture-study__score-line">
                    <PhosphorData exciteKey={dataVersion}>Arsenal</PhosphorData>
                    <PhosphorData className="fixture-study__score" exciteKey={dataVersion} tone="accent">
                      {homeScore} - 1
                    </PhosphorData>
                    <PhosphorData exciteKey={dataVersion}>Liverpool</PhosphorData>
                  </span>
                  <PhosphorData className="fixture-study__round" tone="quiet">Premier League · Matchweek 31</PhosphorData>
                </span>

                <PhosphorData className="fixture-study__scan" active tone="warning">
                  <InstrumentIcon name="extract" />
                </PhosphorData>
                <PhosphorData className="fixture-study__minute" exciteKey={dataVersion} tone="live">
                  {minute}'
                </PhosphorData>
              </>
            )}
          >
            <div className="fixture-study__rail">
              {events.map((event, index) => (
                <FixtureEvent
                  key={`${event.time}-${event.player}`}
                  event={event}
                  exciteKey={index === 0 ? dataVersion : 0}
                />
              ))}
              <div className="fixture-study__work-state">
                <PhosphorData active tone="warning"><InstrumentIcon name="extract" /></PhosphorData>
                <PhosphorData active tone="warning">extracting clips…</PhosphorData>
              </div>
            </div>
          </InstrumentDisclosure>

          <div className="instrument-workbench__actions">
            <InstrumentAction onClick={() => setExpanded((current) => !current)} tone="accent">
              {expanded ? 'contract fixture' : 'expand fixture'}
            </InstrumentAction>
            <InstrumentAction onClick={simulateGoal} exciteKey={dataVersion} tone="live">
              simulate goal
            </InstrumentAction>
            <InstrumentAction onClick={reset} tone="quiet">reset</InstrumentAction>
          </div>
        </section>

        <aside className="instrument-workbench__notes" aria-label="Prototype contract">
          <div><span>FRAME</span><p>Snaps to the destination geometry. No opacity or height transition.</p></div>
          <div><span>STEP ZOOM</span><p>Three fast emission registrations: previous, intermediate, destination.</p></div>
          <div><span>DATA</span><p>A sharp core is current immediately. Overshoot and decay happen behind it.</p></div>
        </aside>
      </div>
    </main>
  )
}
