import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { chromium, webkit } = createRequire('/opt/browser/package.json')('playwright')

const scenarios = [
  ['chromium-desktop', chromium, { viewport: { width: 1280, height: 960 } }],
  ['webkit-mobile', webkit, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]

for (const [name, engine, options] of scenarios) {
  if (process.env.BTOP_BROWSER_ENGINE && !name.startsWith(process.env.BTOP_BROWSER_ENGINE)) continue
  const browser = await engine.launch({ headless: true })
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const errors = []
  const failedRequests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => {
    if (failedRequests.length < 10) failedRequests.push({ url: request.url(), error: request.failure()?.errorText })
  })
  await page.addInitScript(() => {
    // A reachable private BFF must work even when the OS says "offline".
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.__streams = []
    window.__dropFrames = false
    const Native = window.EventSource
    window.EventSource = class extends Native {
      constructor(...args) {
        super(...args)
        this.record = { closed: false, frames: 0, first: null }
        window.__streams.push(this.record)
        this.addEventListener('message', event => {
          if (window.__dropFrames) { event.stopImmediatePropagation(); return }
          const frame = JSON.parse(event.data)
          this.record.first ??= frame.t
          this.record.frames++
        })
      }
      close() { this.record.closed = true; super.close() }
    }
  })
  const live = async (expected, timeout = 12_000) => page.waitForFunction(
    value => Boolean(document.querySelector('#monitor .animate-ping')) === value,
    expected, { timeout },
  )
  const activeStreams = () => page.evaluate(() => window.__streams.filter(stream => !stream.closed).length)
  try {
    await page.goto(process.env.BTOP_PREVIEW_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelectorAll('.btop-cell').length === 132 * 43
      && document.querySelector('#monitor')?.textContent.includes('CPU'), null, { timeout: 45_000 })
    await live(true, 20_000)
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await activeStreams(), 1)
    const colors = await page.evaluate(() => [...new Set([...document.querySelectorAll('.btop-cell')]
      .filter(cell => cell.textContent.trim()).map(cell => cell.style.color))])
    assert.ok(colors.includes('rgb(201, 160, 240)') && colors.includes('rgb(90, 64, 128)'),
      'packaged title and border must use the lavender palette, not the btop default')
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
    assert.ok(dimensions.document <= dimensions.viewport + 1, 'monitor must not overflow the viewport')
    await page.screenshot({ path: `/artifacts/${name}.png`, fullPage: true })
    console.log(`PASS ${name}: real packaged frame despite offline heuristic, fixed grid, responsive layout`)

    // A live HTTP connection or successful health poll must not hide stalled data.
    await page.evaluate(() => { window.__dropFrames = true })
    await live(false, 8_000)
    await page.evaluate(() => { window.__dropFrames = false; window.dispatchEvent(new Event('online')) })
    await live(true)
    console.log(`PASS ${name}: silent data stall becomes offline and recovers`)

    await context.setOffline(true)
    await live(false, 8_000)
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await live(true, 35_000)
    console.log(`PASS ${name}: offline/online recovery without page reload`)

    // Synthetic lifecycle dispatch is not evidence of a physical phone sleep.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    assert.equal(await activeStreams(), 0)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    await live(true)
    assert.equal(await activeStreams(), 1)
    console.log(`PASS ${name}: visibility/page-restore recovery leaves one stream`)

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    assert.equal(await activeStreams(), 0)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await live(true)
    assert.equal(await activeStreams(), 1)
    console.log(`PASS ${name}: page-cache suspension closes and restores the stream`)

    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Hide monitor' }).click()
      assert.equal(await activeStreams(), 0)
      await page.getByRole('button', { name: 'Show monitor' }).click()
      await live(true)
      assert.equal(await activeStreams(), 1)
    }
    const firstFrames = await page.evaluate(() => window.__streams.filter(stream => stream.frames).map(stream => stream.first))
    assert.ok(firstFrames.length >= 4)
    assert.ok(firstFrames.every(type => type === 'f'), 'every connection must start from a full frame')
    assert.deepEqual(errors, [])
    console.log(`PASS ${name}: repeated mount cleanup, full-frame-first, no page errors`)
  } catch (error) {
    await page.screenshot({ path: `/artifacts/${name}-failure.png`, fullPage: true }).catch(() => {})
    const state = await page.evaluate(() => ({
      visibility: document.visibilityState, online: navigator.onLine, streams: window.__streams,
      cells: document.querySelectorAll('.btop-cell').length,
      status: document.querySelector('#monitor [role="status"]')?.getAttribute('aria-label'),
    })).catch(() => null)
    console.error(`FAIL ${name}: ${error.message}; ${JSON.stringify({ errors, failedRequests, state })}`)
    process.exitCode = 1
    break
  } finally {
    await browser.close()
  }
}
if (!process.exitCode) console.log('BTOP_BROWSER_ACCEPTANCE_PASS')
