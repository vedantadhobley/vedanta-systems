import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const control = process.env.BTOP_CONTROL_CHECKOUT
assert.ok(control && path.isAbsolute(control), 'select the owning Control checkout explicitly')
assert.ok(process.env.BTOP_EXPORTER_IMAGE && process.env.BTOP_RELAY_IMAGE, 'select candidate images')
const controlArgs = ['compose', '--env-file', '/dev/null', '-p', 'control-telemetry-recovery-test',
  '-f', path.join(control, 'luv/telemetry/docker-compose.yml'),
  '-f', path.join(control, 'luv/telemetry/docker-compose.recovery-test.yml')]
const bffArgs = ['compose', '--env-file', '/dev/null', '-f', path.join(repo, 'docker-compose.btop-recovery-test.yml')]
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 45_000, maxBuffer: 512 * 1024 })
const compose = args => docker([...controlArgs, ...args])
const bff = args => docker([...bffArgs, ...args])
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async (check, message, timeout = 25_000) => {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const value = await check()
    if (value) return value
    await sleep(500)
  }
  throw new Error(message)
}
const id = service => {
  const value = compose(['ps', '--all', '-q', service]).trim()
  assert.match(value, /^[a-f0-9]{64}$/, 'one exact test container required')
  return value
}
const inspect = service => JSON.parse(docker(['inspect', id(service)]))[0]
const state = () => {
  try {
    return JSON.parse(bff(['exec', '-T', 'bff', 'node', '-e',
      "fetch('http://127.0.0.1:3000/api/btop/luv/health').then(r=>r.json()).then(s=>console.log(JSON.stringify(s))).catch(()=>process.exit(1))"]))
  } catch { return null }
}
const online = async previousSession => waitFor(() => {
  const value = state()
  return value?.online && value.session !== previousSession ? value : null
}, 'fresh full-frame recovery did not complete')
const offline = async () => waitFor(() => state()?.online === false, 'stale node still reports live', 8_000)
const paused = new Set()

// Refuse to take over another invocation. Cleanup is limited to these projects.
assert.equal(compose(['ps', '-aq']).trim(), '', 'recovery Control project already exists')
assert.equal(bff(['ps', '-aq']).trim(), '', 'recovery BFF project already exists')
try {
  compose(['up', '-d', '--no-deps', 'relay'])
  bff(['up', '-d', '--no-deps', 'bff'])
  await sleep(3500)
  compose(['up', '-d', '--no-deps', 'exporter', 'nats'])
  let current = await online()
  console.log('PASS startup: BFF/relay started before broker/exporter')

  // Recreate the exporter container and its socket while relay/BFF stay running.
  const oldSession = current.session
  compose(['up', '-d', '--no-deps', '--force-recreate', 'exporter'])
  current = await online(oldSession)
  console.log('PASS exporter recreation: new relay session and fresh frame without restarting consumers')

  const before = inspect('exporter').RestartCount
  docker(['exec', id('exporter'), 'tmux', '-L', 'btop-exporter', 'kill-pane', '-t', 'display'])
  await offline()
  await waitFor(() => inspect('exporter').RestartCount > before, 'dead btop did not restart the exporter')
  current = await online(current.session)
  console.log('PASS collector death: stale indication, automatic container restart, fresh session')

  // Freeze only the test btop and its terminal so tmux cannot auto-resume it.
  const exporterId = id('exporter')
  docker(['exec', exporterId, 'python3', '-c',
    "import os,signal; from pathlib import Path; names={'btop','tmux: server'}; [os.kill(int(p.name),signal.SIGSTOP) for p in Path('/proc').iterdir() if p.name.isdigit() and (p/'comm').exists() and (p/'comm').read_text().strip() in names]"])
  const frozenCount = inspect('exporter').RestartCount
  await offline()
  await waitFor(() => inspect('exporter').RestartCount > frozenCount, 'frozen capture did not restart exporter')
  current = await online(current.session)
  console.log('PASS frozen capture: main process exits and Docker restarts it')

  const broker = id('nats')
  docker(['pause', broker]); paused.add(broker)
  await offline()
  await sleep(16_000) // Exceed both BFF ping detection and relay publish timeout.
  docker(['unpause', broker]); paused.delete(broker)
  current = await online(current.session)
  console.log('PASS silent broker path: offline, bounded detection, automatic reconnect')

  const initialBrokerSession = current.session
  compose(['up', '-d', '--no-deps', '--force-recreate', 'nats'])
  current = await online(initialBrokerSession)
  console.log('PASS broker recreation: relay and BFF reconnect without manual repair')

  const beforeBffRestart = Date.now()
  bff(['restart', '-t', '2', 'bff'])
  current = await online()
  const recoveryMs = Date.now() - beforeBffRestart
  assert.ok(recoveryMs < 12_000, 'BFF restart must not wait for the old 30-second snapshot interval')
  console.log('PASS BFF restart: fresh snapshot in ' + recoveryMs + 'ms')
  console.log('BTOP_RECOVERY_ACCEPTANCE_PASS')
} catch (error) {
  console.error(compose(['logs', '--tail', '15', 'exporter', 'relay', 'nats']))
  console.error(bff(['logs', '--tail', '15', 'bff']))
  throw error
} finally {
  for (const container of paused) {
    try { docker(['unpause', container]) } catch { /* continue cleanup */ }
  }
  try { bff(['down', '--timeout', '5']) }
  finally { compose(['down', '--volumes', '--timeout', '5']) }
}
