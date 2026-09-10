import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter, once } from 'node:events'
import { get as httpGet, type IncomingMessage } from 'node:http'
import express, { type Request, type Response } from 'express'
import { JSONCodec, type Msg } from 'nats'
import {
  BtopFrameStore,
  createBtopStreamHandler,
  consumeBtopFrames,
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
  const store = new BtopFrameStore(5_000, ['luv'])
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
  store.subscribe('luv', (frame) => replayed.push(frame), 2_500)
  assert.equal(replayed.length, 1)
  assert.equal(replayed[0].t, 'f')
  if (replayed[0].t === 'f') assert.deepEqual(replayed[0].c[10], ['X', 'a57fd8', null, 1])
})

test('rejects a sequence gap until a full frame resynchronizes the node', () => {
  const store = new BtopFrameStore(5_000, ['joi'])
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
  const store = new BtopFrameStore(5_000, ['nexus0'])
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
  const store = new BtopFrameStore(5_000, ['luv'])
  const initial = envelope('luv', 'session-a', 1, fullFrame())

  assert.equal(store.ingest(initial.message, 'btop.joi.frame', 1_000), false)
  assert.equal(store.ingest(initial.message, initial.subject, 1_000), true)
  assert.equal(store.ingest(initial.message, initial.subject, 2_000), false)
  assert.deepEqual(store.listNodes(2_000).map((node) => node.node), ['luv'])
})

test('marks a synchronized node offline after its frames become stale', () => {
  const store = new BtopFrameStore(5_000, ['luv'])
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

test('valid publications and subscriptions cannot expand the configured inventory', () => {
  const store = new BtopFrameStore(5_000, ['luv', 'luv', 'joi'])
  const unknown = envelope('nexus0', 'session-a', 0, fullFrame())
  assert.equal(store.ingest(unknown.message, unknown.subject), false)
  assert.throws(() => store.subscribe('nexus0', () => {}), /unknown/)
  assert.deepEqual(store.listNodes().map(({ node }) => node), ['joi', 'luv'])
  const empty = new BtopFrameStore()
  assert.equal(empty.ingest(unknown.message, unknown.subject), false)
  assert.deepEqual(empty.listNodes(), [])
})

test('rejects duplicate delta indices without changing sequence or freshness', () => {
  const store = new BtopFrameStore(5_000, ['luv'])
  const initial = envelope('luv', 'session-a', 0, fullFrame())
  store.ingest(initial.message, initial.subject, 1_000)
  const duplicate = envelope('luv', 'session-a', 1, {
    t: 'd', d: [[0, 'X', null, null, 0], [0, 'Y', null, null, 0]],
  })
  assert.equal(store.ingest(duplicate.message, duplicate.subject, 2_000), false)
  assert.equal(store.getStatus('luv').sequence, 0)
  assert.equal(store.getStatus('luv').lastFrameAt, 1_000)
})

test('a stale subscriber waits, then gets a reconstructed full frame before deltas', () => {
  const store = new BtopFrameStore(5_000, ['luv'])
  const initial = envelope('luv', 'session-a', 0, fullFrame())
  store.ingest(initial.message, initial.subject, 1_000)
  const received: BtopStreamFrame[] = []
  store.subscribe('luv', (frame) => received.push(frame), 10_000)
  assert.equal(received.length, 0)
  const next = envelope('luv', 'session-a', 1, { t: 'd', d: [[0, 'X', null, null, 0]] })
  store.ingest(next.message, next.subject, 10_001)
  assert.equal(received.length, 1)
  assert.equal(received[0].t, 'f')
  if (received[0].t === 'f') assert.equal(received[0].c[0][0], 'X')
})

test('NATS subscription termination invalidates snapshots until a new full frame arrives', async () => {
  const store = new BtopFrameStore(5_000, ['luv'])
  const initial = envelope('luv', 'session-a', 0, fullFrame())
  async function* messages(): AsyncIterable<Pick<Msg, 'data' | 'subject'>> {
    yield { subject: initial.subject, data: JSONCodec().encode(initial.message) }
    assert.equal(store.getStatus('luv').online, true)
  }
  await consumeBtopFrames(messages(), store)
  assert.equal(store.getStatus('luv', 1_001).online, false)
  const received: BtopStreamFrame[] = []
  store.subscribe('luv', (frame) => received.push(frame), 1_001)
  assert.equal(received.length, 0)
  const next = envelope('luv', 'session-a', 1, { t: 'd', d: [] })
  assert.equal(store.ingest(next.message, next.subject, 1_002), false)
  const recovery = envelope('luv', 'session-a', 2, fullFrame('R'))
  assert.equal(store.ingest(recovery.message, recovery.subject, 1_003), true)
  assert.equal(store.getStatus('luv', 1_003).online, true)
  assert.equal(received[0].t, 'f')
})

test('NATS subscription failure invalidates cached nodes', async () => {
  const store = liveStore()
  async function* messages(): AsyncIterable<Pick<Msg, 'data' | 'subject'>> {
    yield { subject: 'btop.luv.frame', data: new TextEncoder().encode('not json') }
    throw new Error('connection lost')
  }
  let ignored = 0
  await assert.rejects(consumeBtopFrames(messages(), store, () => { ignored += 1 }), /connection lost/)
  assert.equal(ignored, 1)
  assert.equal(store.getStatus('luv').online, false)
})

test('NATS rejects oversized frames before decoding or creating node state', async () => {
  const store = new BtopFrameStore(5_000, ['luv'])
  async function* messages(): AsyncIterable<Pick<Msg, 'data' | 'subject'>> {
    yield { subject: 'btop.luv.frame', data: new Uint8Array(1024 * 1024 + 1) }
  }
  let ignored = 0
  await consumeBtopFrames(messages(), store, () => { ignored += 1 })
  assert.equal(ignored, 1)
  assert.equal(store.getStatus('luv').lastFrameAt, null)
})

class FakeResponse extends EventEmitter {
  writes: string[] = []
  statusCode = 200
  destroyed = false
  writableEnded = false
  writeHook: (message: string) => boolean = () => true
  set() { return this }
  status(code: number) { this.statusCode = code; return this }
  json() { return this }
  flushHeaders() {}
  write(message: string) {
    this.writes.push(message)
    return this.writeHook(message)
  }
  destroy() { this.destroyed = true; this.emit('close'); return this }
}

function openStream(handler: ReturnType<typeof createBtopStreamHandler>, response = new FakeResponse(), node = 'luv') {
  const request = {
    params: { node },
    socket: { setTimeout() {}, setNoDelay() {}, setKeepAlive() {} },
  } as unknown as Request
  handler(request, response as unknown as Response)
  return response
}

function liveStore() {
  const store = new BtopFrameStore(5_000, ['luv'])
  const initial = envelope('luv', 'session-a', 0, fullFrame())
  store.ingest(initial.message, initial.subject)
  return store
}

test('SSE permits a normal full-frame write to drain before the next delta', () => {
  const store = liveStore()
  const response = new FakeResponse()
  response.writeHook = (message) => !message.startsWith('data:')
  openStream(createBtopStreamHandler(store), response)
  assert.equal(response.destroyed, false)
  response.emit('drain')
  response.writeHook = () => true
  const delta = envelope('luv', 'session-a', 1, { t: 'd', d: [] })
  store.ingest(delta.message, delta.subject)
  assert.equal(response.writes.length, 3)
  assert.equal(response.destroyed, false)
  response.destroy()
  assert.equal(response.listenerCount('drain'), 0)
})

test('SSE closes a lagging client instead of queueing or dropping deltas', () => {
  const store = liveStore()
  const handler = createBtopStreamHandler(store, { maxClients: 1 })
  const response = new FakeResponse()
  response.writeHook = (message) => !message.startsWith('data:')
  openStream(handler, response)
  const delta = envelope('luv', 'session-a', 1, { t: 'd', d: [[0, 'R', null, null, 0]] })
  store.ingest(delta.message, delta.subject)
  assert.equal(response.destroyed, true)
  assert.equal(response.writes.length, 2)
  const recovered = openStream(handler)
  assert.equal(recovered.statusCode, 200)
  const frame = JSON.parse(recovered.writes[1].slice(6)) as BtopFullFrame
  assert.equal(frame.t, 'f')
  assert.equal(frame.c[0][0], 'R')
  recovered.destroy()
})

test('SSE closes an undrained write even if no more frames arrive', async () => {
  const response = new FakeResponse()
  response.writeHook = (message) => !message.startsWith('data:')
  openStream(createBtopStreamHandler(liveStore(), { drainTimeoutMs: 10 }), response)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(response.destroyed, true)
  assert.equal(response.listenerCount('drain'), 0)
})

test('SSE limits connections and releases a slot once on close', () => {
  const handler = createBtopStreamHandler(liveStore(), { maxClients: 1 })
  const first = openStream(handler)
  assert.equal(openStream(handler).statusCode, 503)
  first.destroy()
  first.emit('close')
  const second = openStream(handler)
  assert.equal(second.statusCode, 200)
  assert.equal(openStream(handler).statusCode, 503)
  second.destroy()
})

test('SSE cleans up when the initial snapshot closes or throws synchronously', () => {
  for (const throws of [false, true]) {
    const store = liveStore()
    const subscribe = store.subscribe.bind(store)
    let unsubscribed = 0
    store.subscribe = (...args) => {
      const cleanup = subscribe(...args)
      return () => { unsubscribed += 1; cleanup() }
    }
    const handler = createBtopStreamHandler(store, { maxClients: 1 })
    const response = new FakeResponse()
    response.writeHook = (message) => {
      if (message.startsWith('data:')) {
        if (throws) throw new Error('socket gone')
        response.destroy()
      }
      return true
    }
    openStream(handler, response)
    const before = response.writes.length
    const delta = envelope('luv', 'session-a', 1, { t: 'd', d: [] })
    store.ingest(delta.message, delta.subject)
    assert.equal(response.writes.length, before)
    assert.equal(response.listenerCount('drain'), 0)
    assert.equal(unsubscribed, 1)
    const next = openStream(handler)
    assert.equal(next.statusCode, 200)
    next.destroy()
  }
})

test('SSE rejects invalid and unconfigured nodes without consuming capacity', () => {
  const store = liveStore()
  const handler = createBtopStreamHandler(store, { maxClients: 1 })
  assert.equal(openStream(handler, new FakeResponse(), '../bad').statusCode, 400)
  assert.equal(openStream(handler, new FakeResponse(), 'nexus0').statusCode, 404)
  const response = openStream(handler)
  assert.equal(response.statusCode, 200)
  assert.equal(store.hasNode('nexus0'), false)
  response.destroy()
})

test('real HTTP SSE sends a full snapshot, ordered delta, and a fresh snapshot on reconnect', async () => {
  const store = liveStore()
  const handler = createBtopStreamHandler(store, { maxClients: 1 })
  const app = express()
  let responseClosed: () => void = () => {}
  app.get('/:node/stream', (req, res) => {
    res.once('close', () => responseClosed())
    handler(req, res)
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const open = () => new Promise<IncomingMessage>((resolve, reject) => {
    const request = httpGet(`http://127.0.0.1:${address.port}/luv/stream`, resolve)
    request.on('error', reject)
    request.setTimeout(2_000, () => request.destroy(new Error('SSE test timed out')))
  })
  async function* frames(response: IncomingMessage): AsyncGenerator<BtopStreamFrame> {
    let buffer = ''
    for await (const chunk of response) {
      buffer += chunk.toString()
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const record = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (record.startsWith('data: ')) yield JSON.parse(record.slice(6)) as BtopStreamFrame
      }
    }
  }
  let response: IncomingMessage | undefined
  try {
    response = await open()
    assert.equal(response.statusCode, 200)
    const reader = frames(response)
    assert.equal((await reader.next()).value?.t, 'f')
    const delta = envelope('luv', 'session-a', 1, { t: 'd', d: [[0, 'R', null, null, 0]] })
    store.ingest(delta.message, delta.subject)
    assert.deepEqual((await reader.next()).value, delta.message.payload.frame)
    const closed = new Promise<void>((resolve) => { responseClosed = resolve })
    response.destroy()
    await reader.return(undefined)
    await closed
    response = await open()
    assert.equal(response.statusCode, 200)
    const recovered = frames(response)
    const frame = (await recovered.next()).value
    assert.equal(frame?.t, 'f')
    if (frame?.t === 'f') assert.equal(frame.c[0][0], 'R')
    response.destroy()
    await recovered.return(undefined)
  } finally {
    response?.destroy()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
