import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadNatsAuthenticator } from './nats-auth'

test('unset credentials preserve the explicitly unauthenticated deployment', async () => {
  assert.equal(await loadNatsAuthenticator(), undefined)
})

test('configured missing and invalid credentials never fall back to anonymous', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'portal-nats-auth-'))
  t.after(() => rm(directory, { recursive: true }))
  await assert.rejects(loadNatsAuthenticator(join(directory, 'missing.creds')))
  const path = join(directory, 'invalid.creds')
  await writeFile(path, 'invalid test credential', { mode: 0o600 })
  const authenticate = await loadNatsAuthenticator(path)
  assert.ok(authenticate)
  assert.throws(() => authenticate('test-nonce'))
})
