import assert from 'node:assert/strict'
import test from 'node:test'

import { isSpacerOutsideViewport, spacerHeightForTarget } from './use-transient-scroll-space'

test('adds only the height removed by one announced layout transition', () => {
  assert.equal(spacerHeightForTarget(1800, 1200), 600)
  assert.equal(spacerHeightForTarget(1400, 1000), 400)
})

test('new content consumes existing transient space before growing the page', () => {
  assert.equal(spacerHeightForTarget(1700, 1500), 200)
  assert.equal(spacerHeightForTarget(1400, 1500), 0)
})

test('retained space releases only after it is completely below the viewport', () => {
  assert.equal(isSpacerOutsideViewport(-20, 800), false)
  assert.equal(isSpacerOutsideViewport(799, 800), false)
  assert.equal(isSpacerOutsideViewport(800, 800), true)
  assert.equal(isSpacerOutsideViewport(1200, 800), true)
})
