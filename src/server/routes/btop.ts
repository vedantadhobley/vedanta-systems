import { Router, type Request, type Response } from 'express'
import { connect, JSONCodec, type Msg, type NatsConnection } from 'nats'
import { loadNatsAuthenticator } from '../nats-auth'

const COLS = 132
const ROWS = 43
const TOTAL_CELLS = COLS * ROWS
const SUBJECT_PATTERN = 'btop.*.frame'
const DEFAULT_STALE_AFTER_MS = 5_000
const RETRY_DELAY_MS = 5_000
const SSE_HEARTBEAT_MS = 15_000
const MAX_SSE_CLIENTS = 64
const SSE_DRAIN_TIMEOUT_MS = 5_000
const MAX_MESSAGE_BYTES = 1024 * 1024

export type BtopCell = [string, string | null, string | null, 0 | 1]
export type BtopFullFrame = { t: 'f'; c: BtopCell[] }
export type BtopDeltaFrame = {
  t: 'd'
  d: Array<[number, string, string | null, string | null, 0 | 1]>
}
export type BtopStreamFrame = BtopFullFrame | BtopDeltaFrame

interface BtopFramePayload {
  node: string
  session: string
  sequence: number
  frame: BtopStreamFrame
}

interface BtopFrameEnvelope {
  id: string
  ts: string
  source: string
  version: 1
  subject: string
  payload: BtopFramePayload
}

interface NodeState {
  cells: BtopCell[] | null
  session: string | null
  sequence: number | null
  synchronized: boolean
  lastFrameAt: number | null
  listeners: Set<(frame: BtopStreamFrame) => void>
}

export interface BtopNodeStatus {
  node: string
  online: boolean
  synchronized: boolean
  lastFrameAt: number | null
  ageMs: number | null
  session: string | null
  sequence: number | null
}

export interface BtopRouterConfig {
  natsUrl?: string
  natsCredsPath?: string
  nodes?: string[]
  staleAfterMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(value)
}

function isColor(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^[0-9a-f]{6}$/i.test(value))
}

function isCharacter(value: unknown): value is string {
  return typeof value === 'string' && [...value].length === 1
}

function isCell(value: unknown): value is BtopCell {
  return Array.isArray(value)
    && value.length === 4
    && isCharacter(value[0])
    && isColor(value[1])
    && isColor(value[2])
    && (value[3] === 0 || value[3] === 1)
}

function parseFrame(value: unknown): BtopStreamFrame | null {
  if (!isRecord(value)) return null

  if (value.t === 'f') {
    if (!Array.isArray(value.c) || value.c.length !== TOTAL_CELLS || !value.c.every(isCell)) {
      return null
    }
    return { t: 'f', c: value.c }
  }

  if (value.t === 'd') {
    if (!Array.isArray(value.d) || value.d.length > TOTAL_CELLS) return null

    const deltas: BtopDeltaFrame['d'] = []
    const indices = new Set<number>()
    for (const entry of value.d) {
      if (!Array.isArray(entry) || entry.length !== 5) return null
      const [index, char, foreground, background, bold] = entry
      if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS) return null
      if (indices.has(index)) return null
      indices.add(index)
      if (!isCharacter(char) || !isColor(foreground) || !isColor(background)) return null
      if (bold !== 0 && bold !== 1) return null
      deltas.push([index, char, foreground, background, bold])
    }
    return { t: 'd', d: deltas }
  }

  return null
}

function parseEnvelope(value: unknown, messageSubject: string): BtopFrameEnvelope | null {
  if (!isRecord(value) || value.version !== 1 || value.subject !== messageSubject) return null
  if (typeof value.id !== 'string' || typeof value.ts !== 'string' || typeof value.source !== 'string') {
    return null
  }
  if (!isRecord(value.payload)) return null

  const subjectParts = messageSubject.split('.')
  if (subjectParts.length !== 3 || subjectParts[0] !== 'btop' || subjectParts[2] !== 'frame') {
    return null
  }

  const node = value.payload.node
  const session = value.payload.session
  const sequence = value.payload.sequence
  const frame = parseFrame(value.payload.frame)

  if (!isNodeName(node) || node !== subjectParts[1]) return null
  if (typeof session !== 'string' || session.length === 0 || session.length > 128) return null
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0 || !frame) {
    return null
  }

  return {
    id: value.id,
    ts: value.ts,
    source: value.source,
    version: 1,
    subject: messageSubject,
    payload: { node, session, sequence, frame },
  }
}

function cloneCells(cells: BtopCell[]): BtopCell[] {
  return cells.map((cell) => [...cell] as BtopCell)
}

export class BtopFrameStore {
  private readonly nodes = new Map<string, NodeState>()

  constructor(
    private readonly staleAfterMs = DEFAULT_STALE_AFTER_MS,
    initialNodes: string[] = [],
  ) {
    for (const node of initialNodes) {
      if (isNodeName(node)) this.getOrCreateNode(node)
    }
  }

  private getOrCreateNode(node: string): NodeState {
    const existing = this.nodes.get(node)
    if (existing) return existing

    const created: NodeState = {
      cells: null,
      session: null,
      sequence: null,
      synchronized: false,
      lastFrameAt: null,
      listeners: new Set(),
    }
    this.nodes.set(node, created)
    return created
  }

  ingest(rawEnvelope: unknown, messageSubject: string, receivedAt = Date.now()): boolean {
    // Inventory is configuration, never something a publisher can create.
    const subjectNode = messageSubject.split('.')[1]
    if (!this.nodes.has(subjectNode)) return false
    const envelope = parseEnvelope(rawEnvelope, messageSubject)
    if (!envelope) return false

    const { node, session, sequence, frame } = envelope.payload
    const state = this.nodes.get(node)
    if (!state) return false

    if (state.session === session && state.sequence !== null && sequence <= state.sequence) {
      return false
    }

    if (frame.t === 'f') {
      state.cells = cloneCells(frame.c)
      state.session = session
      state.sequence = sequence
      state.synchronized = true
      state.lastFrameAt = receivedAt
      this.emit(state, { t: 'f', c: cloneCells(state.cells) })
      return true
    }

    const isNextFrame = state.synchronized
      && state.cells !== null
      && state.session === session
      && state.sequence !== null
      && sequence === state.sequence + 1

    if (!isNextFrame) {
      state.session = session
      state.sequence = sequence
      state.synchronized = false
      state.lastFrameAt = receivedAt
      return false
    }

    const cells = state.cells as BtopCell[]
    for (const [index, char, foreground, background, bold] of frame.d) {
      cells[index] = [char, foreground, background, bold]
    }
    state.sequence = sequence
    state.lastFrameAt = receivedAt
    this.emit(state, frame)
    return true
  }

  subscribe(node: string, listener: (frame: BtopStreamFrame) => void, now = Date.now()): () => void {
    const state = this.nodes.get(node)
    if (!state) throw new Error('unknown btop node')
    let initialized = false
    const forward = (frame: BtopStreamFrame) => {
      if (!initialized) {
        if (!state.cells) return
        initialized = true
        listener({ t: 'f', c: cloneCells(state.cells) })
      } else {
        listener(frame)
      }
    }
    state.listeners.add(forward)
    try {
      if (this.getStatus(node, now).online && state.cells) {
        forward({ t: 'f', c: state.cells })
      }
    } catch (error) {
      state.listeners.delete(forward)
      throw error
    }
    return () => state.listeners.delete(forward)
  }

  hasNode(node: string): boolean {
    return this.nodes.has(node)
  }

  invalidateAll(): void {
    for (const state of this.nodes.values()) state.synchronized = false
  }

  getStatus(node: string, now = Date.now()): BtopNodeStatus {
    const state = this.nodes.get(node)
    const ageMs = state?.lastFrameAt === null || state?.lastFrameAt === undefined
      ? null
      : Math.max(0, now - state.lastFrameAt)
    const synchronized = state?.synchronized ?? false

    return {
      node,
      online: synchronized && ageMs !== null && ageMs <= this.staleAfterMs,
      synchronized,
      lastFrameAt: state?.lastFrameAt ?? null,
      ageMs,
      session: state?.session ?? null,
      sequence: state?.sequence ?? null,
    }
  }

  listNodes(now = Date.now()): BtopNodeStatus[] {
    return [...this.nodes.keys()]
      .sort()
      .map((node) => this.getStatus(node, now))
  }

  private emit(state: NodeState, frame: BtopStreamFrame) {
    for (const listener of state.listeners) listener(frame)
  }
}

interface BtopStreamLimits {
  maxClients?: number
  heartbeatMs?: number
  drainTimeoutMs?: number
}

export function createBtopStreamHandler(store: BtopFrameStore, limits: BtopStreamLimits = {}) {
  const maxClients = limits.maxClients ?? MAX_SSE_CLIENTS
  const heartbeatMs = limits.heartbeatMs ?? SSE_HEARTBEAT_MS
  const drainTimeoutMs = limits.drainTimeoutMs ?? SSE_DRAIN_TIMEOUT_MS
  let clients = 0

  return (req: Request, res: Response): void => {
    const node = req.params.node
    if (!isNodeName(node)) {
      res.status(400).json({ error: 'invalid btop node' })
      return
    }
    if (!store.hasNode(node)) {
      res.status(404).json({ error: 'unknown btop node' })
      return
    }
    if (clients >= maxClients) {
      res.set('Retry-After', '5').status(503).json({ error: 'btop stream capacity reached' })
      return
    }

    clients += 1
    let closed = false
    let blocked = false
    let unsubscribe = () => {}
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let drainTimeout: ReturnType<typeof setTimeout> | undefined
    const drained = () => {
      blocked = false
      clearTimeout(drainTimeout)
      drainTimeout = undefined
    }
    const cleanup = () => {
      if (closed) return
      closed = true
      clients -= 1
      clearInterval(heartbeat)
      clearTimeout(drainTimeout)
      unsubscribe()
      res.off('drain', drained)
      res.off('close', cleanup)
      res.off('error', terminate)
    }
    const terminate = () => {
      cleanup()
      res.destroy()
    }
    const write = (message: string) => {
      if (closed) return
      // Never drop an intermediate delta and continue the same stream. Close
      // a lagging client so reconnect starts from a complete current snapshot.
      if (blocked || res.destroyed || res.writableEnded) {
        terminate()
        return
      }
      try {
        if (!res.write(message) && !closed) {
          blocked = true
          res.once('drain', drained)
          drainTimeout = setTimeout(terminate, drainTimeoutMs)
          drainTimeout.unref()
        }
      } catch {
        terminate()
      }
    }

    // Install cleanup before headers or the synchronous first-frame callback.
    res.once('close', cleanup)
    res.once('error', terminate)
    try {
      req.socket.setTimeout(0)
      req.socket.setNoDelay(true)
      req.socket.setKeepAlive(true)
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders()
      write(': connected\n\n')
      if (closed) return
      unsubscribe = store.subscribe(node, (frame) => write(`data: ${JSON.stringify(frame)}\n\n`))
      // The first write may have closed before subscribe returned its cleanup.
      if (closed) {
        unsubscribe()
        return
      }
      heartbeat = setInterval(() => {
        if (!blocked) write(': heartbeat\n\n')
      }, heartbeatMs)
      heartbeat.unref()
    } catch {
      terminate()
    }
  }
}

export async function consumeBtopFrames(
  messages: AsyncIterable<Pick<Msg, 'data' | 'subject'>>,
  store: BtopFrameStore,
  reportIgnored: () => void = () => {},
) {
  const codec = JSONCodec<unknown>()
  try {
    for await (const message of messages) {
      try {
        if (message.data.length > MAX_MESSAGE_BYTES) {
          reportIgnored()
          continue
        }
        if (!store.ingest(codec.decode(message.data), message.subject)) reportIgnored()
      } catch {
        reportIgnored()
      }
    }
  } finally {
    store.invalidateAll()
  }
}

async function runNatsBridge(natsUrl: string, natsCredsPath: string | undefined, store: BtopFrameStore) {
  let lastIgnoredLogAt = 0
  const reportIgnored = () => {
    const now = Date.now()
    if (now - lastIgnoredLogAt < RETRY_DELAY_MS) return
    lastIgnoredLogAt = now
    console.warn('[btop] ignored oversized, invalid, unconfigured, duplicate, or unsynchronized frame')
  }

  while (process.exitCode === undefined) {
    let connection: NatsConnection | null = null
    try {
      const authenticator = await loadNatsAuthenticator(natsCredsPath)
      connection = await connect({
        servers: natsUrl,
        name: 'vedanta-systems-btop-bridge',
        // A broken connection ends this session. The outer loop reconnects;
        // subscription termination invalidates every cached node immediately.
        reconnect: false,
        authenticator,
      })
      console.log(`[btop] NATS bridge connected; subscribed to ${SUBJECT_PATTERN}`)
      const subscription = connection.subscribe(SUBJECT_PATTERN)
      await consumeBtopFrames(subscription, store, reportIgnored)
    } catch (error) {
      console.error(`[btop] NATS bridge unavailable; retrying in ${RETRY_DELAY_MS / 1_000}s:`, (error as Error).message)
    } finally {
      store.invalidateAll()
      if (connection) await connection.close().catch(() => undefined)
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
}

export function createBtopRouter(config: BtopRouterConfig): Router {
  const router = Router()
  const store = new BtopFrameStore(config.staleAfterMs, config.nodes)

  if (config.natsUrl) {
    void runNatsBridge(config.natsUrl, config.natsCredsPath, store)
  } else {
    console.warn('[btop] NATS_URL not set — multi-node bridge disabled')
  }

  router.get('/nodes', (_req, res) => {
    res.json({ nodes: store.listNodes() })
  })

  router.get('/:node/health', (req, res) => {
    if (!isNodeName(req.params.node)) {
      res.status(400).json({ error: 'invalid btop node' })
      return
    }
    if (!store.hasNode(req.params.node)) {
      res.status(404).json({ error: 'unknown btop node' })
      return
    }

    const status = store.getStatus(req.params.node)
    res.status(status.online ? 200 : 503).json(status)
  })

  router.get('/:node/stream', createBtopStreamHandler(store))

  return router
}
