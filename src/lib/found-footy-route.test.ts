import assert from 'node:assert/strict'
import test from 'node:test'

import {
  foundFootyDateUrl,
  foundFootyVideoUrl,
  isCalendarDate,
  readFoundFootyRoute,
  reflectFoundFootyVideoUrl,
} from './found-footy-route'

test('shared target owns route intent even when a clean date is also present', () => {
  const route = readFoundFootyRoute(
    '?d=2026-08-20&v=event-id&s=s_5b7b39d48133',
    '2026-08-30',
    'back-entry',
  )
  assert.deepEqual(route.target, {
    eventId: 'event-id',
    shareId: 's_5b7b39d48133',
    navigationKey: 'back-entry',
  })
  assert.equal(route.cleanDate, '2026-08-20')
})

test('clean dates survive history while today uses the canonical route', () => {
  assert.equal(foundFootyDateUrl('2026-08-20', '2026-08-30'), '/workspace/found-footy?d=2026-08-20')
  assert.equal(foundFootyDateUrl('2026-08-30', '2026-08-30'), '/workspace/found-footy')
  assert.equal(
    foundFootyVideoUrl('event/id', 's_5b7b39d48133'),
    '/workspace/found-footy?v=event%2Fid&s=s_5b7b39d48133',
  )
})

test('invalid calendar dates fall back to today', () => {
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(readFoundFootyRoute('?d=2026-13-99', '2026-08-30', 'entry').cleanDate, '2026-08-30')
})

test('local video URL reflection preserves router history state', () => {
  const routerState = { idx: 4, key: 'route-key' }
  let replacement: { state: unknown; unused: string; url?: string | URL | null } | null = null
  const history = {
    state: routerState,
    replaceState(state: unknown, unused: string, url?: string | URL | null) {
      replacement = { state, unused, url }
    },
  }

  reflectFoundFootyVideoUrl(history, 'event/id', 's_5b7b39d48133')

  assert.deepEqual(replacement, {
    state: routerState,
    unused: '',
    url: '/workspace/found-footy?v=event%2Fid&s=s_5b7b39d48133',
  })
})
