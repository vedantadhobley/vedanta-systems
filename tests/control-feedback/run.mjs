import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { chromium, webkit } = createRequire('/opt/browser/package.json')('playwright')

// Reuse the existing capped browser runner and dev frontend, not another UI.
assert.ok(process.env.BTOP_BROWSER_URL, 'Set the existing dev page URL through the browser Compose declaration')
// The workspace has the same real navbar without unrelated live btop grids.
const url = new URL('/workspace', process.env.BTOP_BROWSER_URL).href

async function state(locator) {
  return locator.evaluate(async element => {
    // Check the next paint, not whether the browser has dispatched its input
    // state update before acknowledging the automation command.
    await new Promise(requestAnimationFrame)
    return {
      color: getComputedStyle(element).color,
      active: element.matches(':active'),
      transition: getComputedStyle(element).transitionProperty,
      transitions: element.getAnimations({ subtree: true })
        .filter(animation => animation.constructor.name === 'CSSTransition').length,
    }
  })
}

async function noTransition(locator) {
  const value = await state(locator)
  assert.equal(value.transition, 'none')
  assert.equal(value.transitions, 0)
  return value
}

async function token(page, name) {
  return page.evaluate(name => {
    const probe = document.createElement('span')
    probe.style.color = `hsl(var(--${name}))`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, name)
}

for (const [name, engine, options] of [
  ['chromium-desktop', chromium, { viewport: { width: 1280, height: 960 } }],
  ['webkit-desktop', webkit, { viewport: { width: 1280, height: 960 } }],
  ['chromium-touch', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ['webkit-mobile', webkit, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
]) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage(options)
    const errors = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(`${name}: ${error.message}`)
    })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const lavender = await token(page, 'lavender')
    const resting = await token(page, 'corpo-text')
    const light = await token(page, 'corpo-light')
    const hover = await page.evaluate(() => matchMedia('(hover: hover)').matches)

    // Real navbar, including line/fill icons; no click navigation is dispatched.
    for (const selector of ['.site-bottom-nav a.nav-btn', '.site-bottom-nav button.nav-btn']) {
      const control = page.locator(selector).first()
      await noTransition(control)
      // Pointer assertions belong to pointer contexts; touch contexts below
      // use native taps/cancellation, not a mouse impersonating an iPhone.
      if (options.hasTouch) continue
      for (let repeat = 0; repeat < 3; repeat++) {
        await control.hover()
        const hovered = await noTransition(control)
        assert.equal(hovered.color, hover ? light : resting, JSON.stringify({ selector, repeat, hovered }))
        await page.mouse.down()
        const pressed = await noTransition(control)
        assert.equal(pressed.active, true)
        assert.equal(pressed.color, lavender, 'pressed color must be settled immediately')
        assert.equal(await control.locator('.icon-line').evaluate(el => getComputedStyle(el).display), 'none')
        assert.notEqual(await control.locator('.icon-fill').evaluate(el => getComputedStyle(el).display), 'none')
        // Release inside the viewport but away from the navigation action.
        await page.mouse.move(20, 80)
        await page.mouse.up()
        const released = await noTransition(control)
        assert.equal(released.active, false)
        assert.equal(released.color, resting)
      }
    }

    await page.evaluate(async () => {
      const fixtures = await import('/tests/control-feedback/fixtures.tsx')
      fixtures.mount()
    })
    const action = page.locator('#feedback-action')
    await action.waitFor()
    for (const control of await page.locator('#control-feedback-fixtures button, #feedback-link, #feedback-badge').all()) {
      await noTransition(control)
    }
    // Both the track and its thumb must snap, independently of current usage.
    const toggle = page.locator('#feedback-switch')
    const thumb = toggle.locator('span').first()
    await noTransition(thumb)
    const before = await thumb.evaluate(el => getComputedStyle(el).transform)
    await toggle.click()
    assert.equal(await toggle.getAttribute('aria-checked'), 'true')
    await noTransition(toggle)
    await noTransition(thumb)
    assert.notEqual(await thumb.evaluate(el => getComputedStyle(el).transform), before)
    await toggle.focus()
    await page.keyboard.press('Space')
    assert.equal(await toggle.getAttribute('aria-checked'), 'false')
    assert.equal(await thumb.evaluate(el => getComputedStyle(el).transform), before)

    // Keyboard pressed feedback and focus remain intact.
    await action.focus()
    await page.keyboard.down('Space')
    assert.equal((await noTransition(action)).color, lavender)
    await page.keyboard.up('Space')
    assert.equal((await noTransition(action)).active, false)
    assert.equal(await page.locator('#feedback-clicks').textContent(), '1')
    assert.equal(await action.evaluate(el => document.activeElement === el), true)
    assert.notEqual(await action.evaluate(el => getComputedStyle(el).boxShadow), 'none')
    assert.equal(await page.locator('#feedback-disabled').isDisabled(), true)
    assert.notEqual((await noTransition(page.locator('#feedback-disabled'))).color, lavender)

    if (options.hasTouch) {
      await action.tap()
      assert.equal(await page.locator('#feedback-clicks').textContent(), '2')
      // Raw CDP touches prove delivery/cancellation, not a visual long press:
      // this path does not activate CSS :active in the current Chromium build.
      // The mouse checks above cover :active styling; physical iOS is separate.
      if (engine === chromium) {
        const cdp = await page.context().newCDPSession(page)
        const box = await action.boundingBox()
        await action.evaluate(el => {
          for (const type of ['touchstart', 'touchcancel']) {
            el.addEventListener(type, event => {
              el.dataset[type] = String(event.isTrusted)
            }, { once: true })
          }
        })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
          touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
        assert.equal(await action.getAttribute('data-touchstart'), 'true')
        await noTransition(action)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
        assert.equal(await action.getAttribute('data-touchcancel'), 'true')
        assert.equal((await noTransition(action)).active, false)
        assert.equal(await page.locator('#feedback-clicks').textContent(), '2')
        await cdp.detach()
      }
    }

    assert.equal(await page.locator('#feedback-signal').evaluate(el => getComputedStyle(el).animationName), 'pulse',
      'control policy must not disable independent status animations')
    assert.deepEqual(errors, [])
    console.log(`PASS ${name}: immediate navbar/controls, switch, keyboard, disabled state, independent signals`)
  } finally {
    await browser.close()
  }
}
console.log('CONTROL_FEEDBACK_ACCEPTANCE_PASS')
