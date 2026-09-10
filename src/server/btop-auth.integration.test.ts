import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { connect } from 'nats'
import { loadNatsAuthenticator } from './nats-auth'
import { BtopFrameStore, consumeBtopFrames, createBtopStreamHandler } from './routes/btop'

test('real private exporter through authenticated NATS and BFF SSE recovers full frames', {
  skip: !process.env.BTOP_AUTH_TEST_URL,
  timeout: 75_000,
}, async t => {
  const store = new BtopFrameStore(5_000, ['luv'])
  const attach = async () => {
    const nc = await connect({ servers: process.env.BTOP_AUTH_TEST_URL!, reconnect: false,
      authenticator: await loadNatsAuthenticator(process.env.NATS_TEST_CONSUMER_CREDS) })
    const sub = nc.subscribe('btop.*.frame')
    const consuming = consumeBtopFrames(sub, store)
    t.after(async () => { await nc.close(); await consuming })
    await nc.flush()
    return { nc, consuming }
  }
  const initial = await attach()
  const app = express()
  app.get('/:node/stream', createBtopStreamHandler(store))
  const server = createServer(app).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/luv/stream`
  const openStream = async () => {
    const abort = new AbortController()
    t.after(() => abort.abort())
    const response = await fetch(endpoint, { signal: abort.signal })
    assert.equal(response.status, 200)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    return async () => {
      while (!abort.signal.aborted) {
        const boundary = buffer.indexOf('\n\n')
        if (boundary !== -1) {
          const message = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          if (message.startsWith('data: ')) return JSON.parse(message.slice(6))
          continue
        }
        const chunk = await reader.read()
        if (chunk.done) throw new Error('SSE ended before frame')
        buffer += decoder.decode(chunk.value, { stream: true })
      }
      throw new Error('SSE aborted before frame')
    }
  }
  const next = await openStream()
  const full = await next()
  assert.equal(full.t, 'f')
  assert.equal(full.c.length, 132 * 43)
  assert.ok(full.c.some((cell: unknown[]) => cell[0] !== ' '))
  assert.equal(store.getStatus('luv').online, true)
  const nextFrame = await next()
  assert.ok(nextFrame.t === 'd' || nextFrame.t === 'f')

  await initial.nc.close()
  await initial.consuming
  assert.equal(store.getStatus('luv').online, false)
  await attach()
  // Use a new browser connection: first delivery after BFF resync must be full.
  const recovered = await openStream()
  const recoveryFrame = await recovered()
  assert.equal(recoveryFrame.t, 'f')
  assert.equal(recoveryFrame.c.length, 132 * 43)
  assert.equal(store.getStatus('luv').online, true)
})
