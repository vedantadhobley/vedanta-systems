import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BtopFrameStore,
  type BtopCell,
  type BtopFullFrame,
  type BtopStreamFrame,
} from './btop'

const TOTAL_CELLS = 132 * 43

function fullFrame(char = ' '): BtopFullFrame {
  const cells: BtopCell[] = Array.from(
    { length: TOTAL_CELLS },
    () => [char, null, null, 0],
  )
  return { t: 'f', c: cells }
}

function envelope(node: string, session: string, sequence: number, frame: BtopStreamFrame) {
  const subject = `btop.${node}.frame`
  return {
    subject,
    message: {
      id: `${session}-${sequence}`,
      ts: '2026-08-19T12:00:00Z',
      source: `btop-${node}`,
      version: 1,
      subject,
      payload: { node, session, sequence, frame },
    },
  }
}

test('applies an ordered full and delta stream', () => {
  const store = new BtopFrameStore(5_000)
  const received: BtopStreamFrame[] = []
  store.subscribe('luv', (frame) => received.push(frame))

  const initial = envelope('luv', 'session-a', 1, fullFrame())
  assert.equal(store.ingest(initial.message, initial.subject, 1_000), true)

  const delta = envelope('luv', 'session-a', 2, {
    t: 'd',
    d: [[10, 'X', 'a57fd8', null, 1]],
  })
  assert.equal(store.ingest(delta.message, delta.subject, 2_000), true)
  assert.equal(received.length, 2)
  assert.deepEqual(received[1], delta.message.payload.frame)
  assert.equal(store.getStatus('luv', 2_500).online, true)

  const replayed: BtopStreamFrame[] = []
  store.subscribe('luv', (frame) => replayed.push(frame))
  assert.equal(replayed.length, 1)
  assert.equal(replayed[0].t, 'f')
  if (replayed[0].t === 'f') assert.deepEqual(replayed[0].c[10], ['X', 'a57fd8', null, 1])
})

test('rejects a sequence gap until a full frame resynchronizes the node', () => {
  const store = new BtopFrameStore(5_000)
  const initial = envelope('joi', 'session-a', 4, fullFrame())
  assert.equal(store.ingest(initial.message, initial.subject, 1_000), true)

  const gap = envelope('joi', 'session-a', 6, { t: 'd', d: [[0, 'X', null, null, 0]] })
  assert.equal(store.ingest(gap.message, gap.subject, 2_000), false)
  assert.equal(store.getStatus('joi', 2_000).synchronized, false)
  assert.equal(store.getStatus('joi', 2_000).online, false)

  const recovery = envelope('joi', 'session-a', 7, fullFrame('R'))
  assert.equal(store.ingest(recovery.message, recovery.subject, 3_000), true)
  assert.equal(store.getStatus('joi', 3_000).online, true)
})

test('requires a full frame when the publisher session changes', () => {
  const store = new BtopFrameStore(5_000)
  const initial = envelope('nexus0', 'session-a', 10, fullFrame())
  assert.equal(store.ingest(initial.message, initial.subject, 1_000), true)

  const newSessionDelta = envelope('nexus0', 'session-b', 1, {
    t: 'd',
    d: [[0, 'N', null, null, 0]],
  })
  assert.equal(store.ingest(newSessionDelta.message, newSessionDelta.subject, 2_000), false)
  assert.equal(store.getStatus('nexus0', 2_000).synchronized, false)

  const newSessionFull = envelope('nexus0', 'session-b', 2, fullFrame('N'))
  assert.equal(store.ingest(newSessionFull.message, newSessionFull.subject, 3_000), true)
  assert.equal(store.getStatus('nexus0', 3_000).synchronized, true)
})

test('rejects malformed subjects, node mismatches, and duplicate frames', () => {
  const store = new BtopFrameStore(5_000)
  const initial = envelope('luv', 'session-a', 1, fullFrame())

  assert.equal(store.ingest(initial.message, 'btop.joi.frame', 1_000), false)
  assert.equal(store.ingest(initial.message, initial.subject, 1_000), true)
  assert.equal(store.ingest(initial.message, initial.subject, 2_000), false)
  assert.deepEqual(store.listNodes(2_000).map((node) => node.node), ['luv'])
})

test('marks a synchronized node offline after its frames become stale', () => {
  const store = new BtopFrameStore(5_000)
  const initial = envelope('luv', 'session-a', 1, fullFrame())
  store.ingest(initial.message, initial.subject, 1_000)

  assert.equal(store.getStatus('luv', 6_000).online, true)
  assert.equal(store.getStatus('luv', 6_001).online, false)
})

test('keeps configured but silent nodes visible without accepting arbitrary names', () => {
  const store = new BtopFrameStore(5_000, ['luv', 'joi', '../../bad'])

  assert.equal(store.hasNode('luv'), true)
  assert.equal(store.hasNode('joi'), true)
  assert.equal(store.hasNode('nexus0'), false)
  assert.deepEqual(store.listNodes().map((node) => node.node), ['joi', 'luv'])
})
