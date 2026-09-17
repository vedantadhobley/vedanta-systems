import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { chromium, webkit } = createRequire('/opt/browser/package.json')('playwright')

assert.ok(process.env.BTOP_BROWSER_URL, 'Use the existing dev browser Compose declaration')
const url = new URL('/workspace', process.env.BTOP_BROWSER_URL).href
for (const [name, engine, viewport, touch] of [
  ['chromium-desktop', chromium, { width: 1280, height: 960 }, false],
  ['chromium-narrow', chromium, { width: 320, height: 844 }, true],
  ['webkit-mobile', webkit, { width: 390, height: 844 }, true],
]) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport, isMobile: touch, hasTouch: touch, timezoneId: 'America/New_York' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-09-16T16:00:00Z') })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('.site-bottom-nav').waitFor()
    const render = (overrides = {}, search = false, round = 'Regular Season - 22') => page.evaluate(async args => {
      const module = await import('/tests/fixture-schedule/fixtures.tsx')
      module.renderFixture(...args)
    }, [overrides, search, round])
    const host = page.locator('#fixture-schedule-test')
    const time = host.locator('time')
    async function check(statusTitle, indicator, countdown = false) {
      await time.waitFor()
      const status = host.locator(`[title="${statusTitle}"]`)
      await status.waitFor()
      await page.waitForFunction(([title, value]) =>
        document.querySelector(`#fixture-schedule-test [title="${title}"]`)?.textContent === value,
      [statusTitle, indicator])
      assert.equal(await status.textContent(), indicator)
      assert.equal(await time.getAttribute('datetime'), '2026-09-16T18:00:00Z')
      assert.match(await time.textContent(), /^14:00 EDT$|^18:00 UTC$/)
      const metadata = await time.evaluate(el => el.parentElement.textContent)
      assert.equal(metadata.includes(' · '), countdown, metadata)
      const layout = await time.evaluate(el => {
        const metadata = el.parentElement.parentElement
        const title = metadata.previousElementSibling
        const fixture = metadata.parentElement
        const box = element => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, width: rect.width }
        }
        return { metadata: box(metadata), title: box(title), fixture: box(fixture),
          status: box(title.lastElementChild), schedule: box(el.parentElement),
          names: box(title.firstElementChild) }
      })
      assert.ok(layout.metadata.y >= layout.title.bottom - 1, 'kickoff stays below the match clock/status')
      assert.ok(Math.abs(layout.title.width - layout.metadata.width) < 1, 'schedule cannot narrow the title row')
      assert.ok(Math.abs(layout.status.right - layout.schedule.right) < 1, 'both right-hand fields align')
      assert.ok(layout.names.right <= layout.status.x, 'long names cannot overlap the indicator')
      assert.ok(layout.fixture.right <= viewport.width - 15, 'no horizontal overflow')
      return layout
    }
    await render()
    await host.getByRole('button', { name: /USA - Test League/ }).click()
    const upcoming = await check('Not Started', 'NS', true)
    const playing = { state: 'active', presentation_state: 'playing', display: 'clock',
      status: { short: '1H', long: 'First Half' }, clock: { minute: 12, extra: null }, goals: { home: 1, away: 0 } }
    await render(playing)
    const live = await check('First Half', "12'")
    assert.ok(Math.abs(upcoming.metadata.y - upcoming.title.y - (live.metadata.y - live.title.y)) < 1,
      'kickoff transition keeps the two-row geometry')
    await host.getByRole('button', { name: /Columbus Crew/ }).click()
    await host.getByText('No goals yet', { exact: true }).waitFor()
    await check('First Half', "12'")
    await render({ ...playing, display: 'status', status: { short: 'HT', long: 'Halftime' } })
    await check('Halftime', 'HT')
    await render({ ...playing, clock: { minute: 90, extra: 3 } })
    await check('First Half', "90+3'")
    await host.locator('#fixture-timezone').click()
    await page.waitForFunction(() => document.querySelector('#fixture-schedule-test time')?.textContent === '18:00 UTC')
    await check('First Half', "90+3'")
    await render({ ...playing, presentation_state: 'finished', display: 'status', status: { short: 'FT', long: 'Full Time' } })
    await check('Full Time', 'FT')
    await render({ presentation_state: 'deferred', status: { short: 'PST', long: 'Postponed' } })
    await check('Postponed', 'PST')
    await render(playing, false, '')
    await check('First Half', "12'")
    await render(playing, true)
    await check('First Half', "12'")
    await render({}, true)
    await check('Not Started', 'NS', true)
    await render(playing, true)
    await check('First Half', "12'")
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `/artifacts/fixture-schedule-${name}.png`, fullPage: true })
    console.log(`PASS ${name}: kickoff persists, countdown ends, status/clock alignment, expansion, roundless/search, timezone`)
  } finally { await browser.close() }
}
console.log('FIXTURE_SCHEDULE_ACCEPTANCE_PASS')
