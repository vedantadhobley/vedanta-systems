import { Router, type Request, type Response } from 'express'
import { readFile } from 'node:fs/promises'
import { connect, credsAuthenticator, JSONCodec, type NatsConnection } from 'nats'

const COLS = 132
const ROWS = 43
const TOTAL_CELLS = COLS * ROWS
const SUBJECT_PATTERN = 'btop.*.frame'
const DEFAULT_STALE_AFTER_MS = 5_000
const RETRY_DELAY_MS = 5_000
const SSE_HEARTBEAT_MS = 15_000

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
    for (const entry of value.d) {
      if (!Array.isArray(entry) || entry.length !== 5) return null
      const [index, char, foreground, background, bold] = entry
      if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS) return null
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
    const envelope = parseEnvelope(rawEnvelope, messageSubject)
    if (!envelope) return false

    const { node, session, sequence, frame } = envelope.payload
    const state = this.getOrCreateNode(node)

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

  subscribe(node: string, listener: (frame: BtopStreamFrame) => void): () => void {
    const state = this.getOrCreateNode(node)
    state.listeners.add(listener)
    if (state.synchronized && state.cells) {
      listener({ t: 'f', c: cloneCells(state.cells) })
    }
    return () => state.listeners.delete(listener)
  }

  hasNode(node: string): boolean {
    return this.nodes.has(node)
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

function writeSseFrame(res: Response, frame: BtopStreamFrame) {
  res.write(`data: ${JSON.stringify(frame)}\n\n`)
}

async function runNatsBridge(natsUrl: string, natsCredsPath: string | undefined, store: BtopFrameStore) {
  const codec = JSONCodec<unknown>()

  while (process.exitCode === undefined) {
    let connection: NatsConnection | null = null
    try {
      const authenticator = natsCredsPath
        ? credsAuthenticator(await readFile(natsCredsPath))
        : undefined
      connection = await connect({
        servers: natsUrl,
        name: 'vedanta-systems-btop-bridge',
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2_000,
        authenticator,
      })
      console.log(`[btop] NATS bridge connected; subscribed to ${SUBJECT_PATTERN}`)

      const subscription = connection.subscribe(SUBJECT_PATTERN)
      for await (const message of subscription) {
        try {
          const accepted = store.ingest(codec.decode(message.data), message.subject)
          if (!accepted) {
            console.warn(`[btop] ignored invalid, duplicate, or unsynchronized frame on ${message.subject}`)
          }
        } catch (error) {
          console.error('[btop] NATS frame decode failed:', (error as Error).message)
        }
      }
    } catch (error) {
      console.error(`[btop] NATS bridge unavailable; retrying in ${RETRY_DELAY_MS / 1_000}s:`, (error as Error).message)
    } finally {
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

  router.get('/:node/stream', (req: Request, res: Response) => {
    const node = req.params.node
    if (!isNodeName(node)) {
      res.status(400).json({ error: 'invalid btop node' })
      return
    }
    if (!store.hasNode(node)) {
      res.status(404).json({ error: 'unknown btop node' })
      return
    }

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
    res.write(': connected\n\n')

    const unsubscribe = store.subscribe(node, (frame) => writeSseFrame(res, frame))
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), SSE_HEARTBEAT_MS)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  return router
}
