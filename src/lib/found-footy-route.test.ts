import assert from 'node:assert/strict'
import test from 'node:test'

import {
  foundFootyDateUrl,
  foundFootyVideoUrl,
  isCalendarDate,
  isSameFoundFootyVideo,
  readFoundFootyRoute,
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

test('local video identity requires the exact event and share pair', () => {
  const route = readFoundFootyRoute(
    '?v=event-id&s=s_5b7b39d48133',
    '2026-08-30',
    'local-entry',
  )

  assert.equal(isSameFoundFootyVideo(route.target, {
    eventId: 'event-id',
    shareId: 's_5b7b39d48133',
  }), true)
  assert.equal(isSameFoundFootyVideo(route.target, {
    eventId: 'event-id',
    shareId: 's_different000',
  }), false)
  assert.equal(isSameFoundFootyVideo(route.target, null), false)
})
