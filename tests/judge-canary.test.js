'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { validateResults } = require('../scripts/judge-canary.js')

const fixture = { version: 1, cases: [
  { id: 'c1', goal: 'g', setup: 's', expected: 'e', accept: ['IMPROVED', 'KEPT'] },
  { id: 'c2', goal: 'g', setup: 's', expected: 'e', accept: ['KEPT'] }
] }
const ok = [
  { id: 'c1', pass: true, evidence: 'log', outcome: 'IMPROVED' },
  { id: 'c2', pass: true, evidence: 'log', outcome: 'KEPT' }
]

test('canary: a valid record passes', () => {
  assert.doesNotThrow(() => validateResults(fixture, ok))
})

test('canary: a result with NO outcome is rejected (the release-gate bypass)', () => {
  const r = [{ id: 'c1', pass: true, evidence: 'log' }, ok[1]]
  assert.throws(() => validateResults(fixture, r), /c1: outcome is required/)
})

test('canary: an outcome outside the accept list is rejected', () => {
  const r = [{ id: 'c1', pass: true, evidence: 'log', outcome: 'REGRESSED' }, ok[1]]
  assert.throws(() => validateResults(fixture, r), /not in accept list/)
})

test('canary: a duplicate result id is rejected', () => {
  assert.throws(() => validateResults(fixture, [ok[0], ok[0], ok[1]]), /duplicate result id: c1/)
})

test('canary: an unknown result id is rejected (not silently ignored)', () => {
  const r = [...ok, { id: 'c9', pass: true, evidence: 'log', outcome: 'KEPT' }]
  assert.throws(() => validateResults(fixture, r), /unknown result id: c9/)
})

test('canary: a missing case result is rejected', () => {
  assert.throws(() => validateResults(fixture, [ok[0]]), /record missing result for c2/)
})
