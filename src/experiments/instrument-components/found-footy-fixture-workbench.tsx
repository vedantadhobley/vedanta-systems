import { useState, type CSSProperties } from 'react'

import {
  InstrumentAction,
  InstrumentDisclosure,
  InstrumentIcon,
  InstrumentProjectionField,
  PhosphorData,
  type InstrumentFrameBehavior,
  type PhosphorTone,
} from '@/components/instrument'

interface EventRow {
  detail: string
  player: string
  score: string
  time: string
  tone?: PhosphorTone
}

type WorkbenchGround = 'black' | 'raised'

const initialEvents: EventRow[] = [
  { score: 'Arsenal (2) - 1 Liverpool', time: "68'", detail: 'Goal', player: 'Martin Ødegaard', tone: 'accent' },
  { score: 'Arsenal 1 - (1) Liverpool', time: "42'", detail: 'Goal', player: 'Mohamed Salah' },
  { score: 'Arsenal (1) - 0 Liverpool', time: "14'", detail: 'Goal', player: 'Bukayo Saka' },
]

function FixtureEvent({ event, exciteKey }: { event: EventRow; exciteKey: number }) {
  return (
    <div className="fixture-study__event">
      <PhosphorData className="fixture-study__event-glyph" tone="quiet">+</PhosphorData>
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
  const [frameBehavior, setFrameBehavior] = useState<InstrumentFrameBehavior>('handoff')
  const [occlusionEnabled, setOcclusionEnabled] = useState(false)
  const [occlusionDepth, setOcclusionDepth] = useState(4)
  const [occlusionWidth, setOcclusionWidth] = useState(2)
  const [scatterPercent, setScatterPercent] = useState(3)
  const [ground, setGround] = useState<WorkbenchGround>('black')
  const [projectionEnabled, setProjectionEnabled] = useState(true)
  const [projectionTrail, setProjectionTrail] = useState(8)
  const [projectionFalloff, setProjectionFalloff] = useState(1.8)
  const [projectionIntensity, setProjectionIntensity] = useState(40)
  const [bloomPercent, setBloomPercent] = useState(100)
  const [stepBeatMs, setStepBeatMs] = useState(100)
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
        tone: 'accent',
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

  const scopeStyle = {
    '--instrument-ground': ground === 'black' ? '#000000' : '#050407',
    '--instrument-data-bloom-near-opacity': Math.min(1, 0.85 * bloomPercent / 100),
    '--instrument-data-bloom-far-opacity': Math.min(1, 0.3 * bloomPercent / 100),
    '--instrument-frame-occlusion': '0px',
    '--instrument-projected-occlusion-opacity': occlusionEnabled ? 1 : 0,
    '--instrument-projected-occlusion-width': `${occlusionWidth}px`,
    '--instrument-rear-field-opacity': scatterPercent / 100,
  } as CSSProperties

  return (
    <InstrumentProjectionField
      enabled={projectionEnabled}
      occlusionDepth={occlusionDepth}
      trailFalloff={projectionFalloff}
      trailIntensity={projectionIntensity / 100}
      trailLength={projectionTrail}
    >
      <main className="instrument-workbench instrument-scope" style={scopeStyle}>
        <div className="instrument-workbench__page">
        <header className="instrument-workbench__header">
          <PhosphorData className="instrument-workbench__eyebrow" tone="accent">
            COMPONENT STUDY / 01
          </PhosphorData>
          <h1><PhosphorData>Found Footy fixture cell</PhosphorData></h1>
          <p>
            <PhosphorData tone="quiet">
              Compact and expanded are two settled frames. The cut is immediate;
              emitted light registers the change of scale.
            </PhosphorData>
          </p>
        </header>

        <section className="instrument-workbench__stage" aria-labelledby="fixture-study-title">
          <div className="instrument-workbench__stage-label" id="fixture-study-title">
            <PhosphorData tone="quiet">ENGLAND — PREMIER LEAGUE</PhosphorData>
            <PhosphorData active tone="accent">LIVE / 1</PhosphorData>
          </div>

          <div className="instrument-workbench__calibration" aria-label="Projection calibration">
            <div className="instrument-workbench__calibration-actions">
              <InstrumentAction
                aria-pressed={frameBehavior === 'handoff'}
                onClick={() => setFrameBehavior((current) => current === 'persistent' ? 'handoff' : 'persistent')}
                tone="accent"
              >
                frame / {frameBehavior}
              </InstrumentAction>
              <InstrumentAction
                aria-pressed={projectionEnabled}
                onClick={() => setProjectionEnabled((current) => !current)}
                tone="accent"
              >
                projector / {projectionEnabled ? 'center' : 'off'}
              </InstrumentAction>
              <InstrumentAction
                aria-pressed={occlusionEnabled}
                onClick={() => setOcclusionEnabled((current) => !current)}
                tone="accent"
              >
                occlusion / {occlusionEnabled ? 'projected' : 'off'}
              </InstrumentAction>
              <InstrumentAction
                aria-pressed={ground === 'raised'}
                onClick={() => setGround((current) => current === 'black' ? 'raised' : 'black')}
                tone="accent"
              >
                ground / {ground}
              </InstrumentAction>
            </div>

            <label className="instrument-workbench__scale">
              <PhosphorData tone="quiet">scatter</PhosphorData>
              <input
                type="range"
                min="0"
                max="8"
                step="0.5"
                value={scatterPercent}
                onChange={(event) => setScatterPercent(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{scatterPercent.toFixed(1)}%</PhosphorData>
            </label>

            <label className="instrument-workbench__scale" data-disabled={!occlusionEnabled || undefined}>
              <PhosphorData tone="quiet">offset</PhosphorData>
              <input
                type="range"
                disabled={!occlusionEnabled}
                min="0"
                max="12"
                step="0.5"
                value={occlusionDepth}
                onChange={(event) => setOcclusionDepth(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{occlusionDepth.toFixed(1)} px</PhosphorData>
            </label>

            <label className="instrument-workbench__scale" data-disabled={!occlusionEnabled || undefined}>
              <PhosphorData tone="quiet">width</PhosphorData>
              <input
                type="range"
                disabled={!occlusionEnabled}
                min="0.5"
                max="6"
                step="0.5"
                value={occlusionWidth}
                onChange={(event) => setOcclusionWidth(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{occlusionWidth.toFixed(1)} px</PhosphorData>
            </label>

            <label className="instrument-workbench__scale">
              <PhosphorData tone="quiet">trail</PhosphorData>
              <input
                type="range"
                min="0"
                max="32"
                step="0.5"
                value={projectionTrail}
                onChange={(event) => setProjectionTrail(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{projectionTrail.toFixed(1)} px</PhosphorData>
            </label>

            <label className="instrument-workbench__scale">
              <PhosphorData tone="quiet">rays</PhosphorData>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={projectionIntensity}
                onChange={(event) => setProjectionIntensity(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{projectionIntensity}%</PhosphorData>
            </label>

            <label className="instrument-workbench__scale">
              <PhosphorData tone="quiet">fade</PhosphorData>
              <input
                type="range"
                min="0.4"
                max="4"
                step="0.1"
                value={projectionFalloff}
                onChange={(event) => setProjectionFalloff(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{projectionFalloff.toFixed(1)}×</PhosphorData>
            </label>

            <label className="instrument-workbench__scale">
              <PhosphorData tone="quiet">bloom</PhosphorData>
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={bloomPercent}
                onChange={(event) => setBloomPercent(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{bloomPercent}%</PhosphorData>
            </label>

            <label className="instrument-workbench__scale">
              <PhosphorData tone="quiet">beat</PhosphorData>
              <input
                type="range"
                min="60"
                max="180"
                step="10"
                value={stepBeatMs}
                onChange={(event) => setStepBeatMs(Number(event.target.value))}
              />
              <PhosphorData tone="quiet">{stepBeatMs} ms</PhosphorData>
            </label>
          </div>

          <InstrumentDisclosure
            className="fixture-study"
            contentId="fixture-study-events"
            expanded={expanded}
            frameBehavior={frameBehavior}
            onExpandedChange={setExpanded}
            stepBeatMs={stepBeatMs}
            summary={(
              <>
                <PhosphorData className="fixture-study__toggle-icon" exciteKey={expanded ? 'open' : 'closed'} tone="quiet">
                  <InstrumentIcon name={expanded ? 'collapse' : 'expand'} />
                </PhosphorData>

                <span className="fixture-study__identity">
                  <span className="fixture-study__score-line">
                    <PhosphorData>Arsenal</PhosphorData>
                    <PhosphorData className="fixture-study__score" exciteKey={dataVersion} tone="accent">
                      {homeScore} - 1
                    </PhosphorData>
                    <PhosphorData>Liverpool</PhosphorData>
                  </span>
                  <PhosphorData className="fixture-study__round" tone="quiet">Premier League · Matchweek 31</PhosphorData>
                </span>

                <PhosphorData className="fixture-study__scan" active tone="accent">
                  <InstrumentIcon name="extract" />
                </PhosphorData>
                <PhosphorData className="fixture-study__minute" exciteKey={dataVersion} tone="accent">
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
                <PhosphorData active tone="accent"><InstrumentIcon name="extract" /></PhosphorData>
                <PhosphorData active tone="accent">extracting clips…</PhosphorData>
              </div>
            </div>
          </InstrumentDisclosure>

          <div className="instrument-workbench__actions">
            <InstrumentAction onClick={() => setExpanded((current) => !current)} tone="accent">
              {expanded ? 'contract fixture' : 'expand fixture'}
            </InstrumentAction>
            <InstrumentAction onClick={simulateGoal} exciteKey={dataVersion} tone="accent">
              simulate goal
            </InstrumentAction>
            <InstrumentAction onClick={reset} tone="quiet">reset</InstrumentAction>
          </div>
        </section>

        <aside className="instrument-workbench__notes" aria-label="Prototype contract">
          <div>
            <PhosphorData tone="quiet">FRAME</PhosphorData>
            <p><PhosphorData tone="quiet">Occlusion is off by default. Offset moves its black shadow away from the center source; width changes the shadow thickness.</PhosphorData></p>
          </div>
          <div>
            <PhosphorData tone="quiet">STEP ZOOM</PhosphorData>
            <p><PhosphorData tone="quiet">Each geometry change is one 100 ms beat apart. Expanded-only data disappears immediately on contraction.</PhosphorData></p>
          </div>
          <div>
            <PhosphorData tone="quiet">DATA</PhosphorData>
            <p><PhosphorData tone="quiet">Readable cores stay fixed. Decorative rays pause during scroll, then recalculate once against the viewport-center origin.</PhosphorData></p>
          </div>
        </aside>
        </div>
      </main>
    </InstrumentProjectionField>
  )
}
