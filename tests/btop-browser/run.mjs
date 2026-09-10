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
  let legacyLuvRequests = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/btop-luv/')) legacyLuvRequests++
  })
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
        // The portal also has unrelated project streams and the legacy joi tile.
        // Observe/suppress only luv's new stream; leave everything else intact.
        if (new URL(this.url).pathname !== '/api/btop/luv/stream') return
        this.record = { closed: false, frames: 0, first: null }
        window.__streams.push(this.record)
        this.addEventListener('message', event => {
          if (window.__dropFrames) { event.stopImmediatePropagation(); return }
          const frame = JSON.parse(event.data)
          this.record.first ??= frame.t
          this.record.frames++
        })
      }
      close() { if (this.record) this.record.closed = true; super.close() }
    }
  })
  const live = async (expected, timeout = 12_000) => page.waitForFunction(
    value => document.querySelector('[data-btop-node="luv"] [role="status"]')?.getAttribute('aria-label')
      === `luv: ${value ? 'live' : 'offline'}`,
    expected, { timeout },
  )
  const activeStreams = () => page.evaluate(() => window.__streams.filter(stream => !stream.closed).length)
  try {
    await page.goto(process.env.BTOP_BROWSER_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelectorAll('[data-btop-node="luv"] .btop-cell').length === 132 * 43
      && document.querySelector('[data-btop-node="luv"]')?.textContent.includes('CPU'), null, { timeout: 45_000 })
    await live(true, 20_000)
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await activeStreams(), 1)
    const colors = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-btop-node="luv"] .btop-cell')]
      .filter(cell => cell.textContent.trim()).map(cell => cell.style.color))])
    assert.ok(colors.includes('rgb(201, 160, 240)') && colors.includes('rgb(90, 64, 128)'),
      'packaged title and border must use the lavender palette, not the btop default')
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
    assert.ok(dimensions.document <= dimensions.viewport + 1, 'monitor must not overflow the viewport')
    assert.equal(await page.locator('[data-btop-node="joi"]').count(), 1, 'keep the existing joi tile')
    assert.equal(await page.locator('.site-header').count(), 1)
    assert.equal(await page.locator('.site-bottom-nav').count(), 1)
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
      await page.getByRole('navigation', { name: 'breadcrumb' }).getByText('workspace', { exact: true }).click()
      await page.waitForURL('**/workspace')
      await page.waitForFunction(() => window.__streams.every(stream => stream.closed))
      assert.equal(await activeStreams(), 0)
      if (i === 1) {
        await page.goBack()
      } else {
        await page.getByRole('button', { name: /^vedanta-systems\// }).click()
      }
      await page.waitForURL('**/workspace/vedanta-systems')
      await live(true)
      assert.equal(await activeStreams(), 1)
    }
    const firstFrames = await page.evaluate(() => window.__streams.filter(stream => stream.frames).map(stream => stream.first))
    assert.ok(firstFrames.length >= 4)
    assert.ok(firstFrames.every(type => type === 'f'), 'every connection must start from a full frame')
    assert.equal(legacyLuvRequests, 0, 'luv must not use or fall back to the legacy HTTP collector')
    assert.deepEqual(errors, [])
    console.log(`PASS ${name}: route navigation/back cleanup, full-frame-first, no legacy luv requests or page errors`)
  } catch (error) {
    await page.screenshot({ path: `/artifacts/${name}-failure.png`, fullPage: true }).catch(() => {})
    const state = await page.evaluate(() => ({
      visibility: document.visibilityState, online: navigator.onLine, streams: window.__streams,
      cells: document.querySelectorAll('[data-btop-node="luv"] .btop-cell').length,
      status: document.querySelector('[data-btop-node="luv"] [role="status"]')?.getAttribute('aria-label'),
    })).catch(() => null)
    console.error(`FAIL ${name}: ${error.message}; ${JSON.stringify({ errors, failedRequests, state })}`)
    process.exitCode = 1
    break
  } finally {
    await browser.close()
  }
}
if (!process.exitCode) console.log('BTOP_BROWSER_ACCEPTANCE_PASS')
