import assert from 'node:assert/strict'
import test from 'node:test'

import { nextSpacerHeight, requiredSpacerHeight } from './use-transient-scroll-space'

test('adds only the height removed by one announced layout transition', () => {
  assert.equal(nextSpacerHeight(0, 1800, 1200), 600)
  assert.equal(nextSpacerHeight(200, 1200, 1000), 400)
})

test('new content consumes existing transient space before growing the page', () => {
  assert.equal(nextSpacerHeight(500, 1200, 1500), 200)
  assert.equal(nextSpacerHeight(200, 1200, 1500), 0)
})

test('the first later scroll keeps only space still visible in the viewport', () => {
  assert.equal(requiredSpacerHeight(500, 1200, 800, 1500), 500)
  assert.equal(requiredSpacerHeight(500, 1000, 800, 1500), 300)
  assert.equal(requiredSpacerHeight(500, 600, 800, 1500), 0)
  assert.equal(requiredSpacerHeight(300, 1400, 800, 1500), 300)
})
