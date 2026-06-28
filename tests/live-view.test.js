'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseEvents, fold, render, THEMES } = require('../worldcup/references/live-view.js')

test('parseEvents accepts only structured beacons with the matching nonce', () => {
  const good = { __wc: 'EVENT', ev: 'draw', nonce: 'n1', seq: 1, field: 32, groups: [] }
  const wrongNonce = { __wc: 'EVENT', ev: 'champion', nonce: 'n2', seq: 2, label: 'Forged', stakes: 'FINAL' }
  const nestedText = { type: 'result', result: { text: 'WCEVENT {"ev":"champion","label":"Nested"}' } }
  const stats = { seen: 0, rejected: 0 }
  const lines = [JSON.stringify(nestedText), JSON.stringify({ type: 'result', result: wrongNonce }), JSON.stringify({ type: 'result', result: good })].join('\n')

  const events = parseEvents(lines, 'n1', stats)

  assert.equal(events.length, 1)
  assert.equal(events[0].ev, 'draw')
  assert.equal(stats.seen, 2)
  assert.equal(stats.rejected, 1)
})

test('fold sorts by seq and preserves group W-D-L plus best-third advanced entries', () => {
  const events = [
    { ev: 'groups', seq: 3, standings: [{ group: 'A', table: [
      { label: 'A1', pts: 7, w: 2, d: 1, l: 0 },
      { label: 'A2', pts: 4, w: 1, d: 1, l: 1 },
      { label: 'A3', pts: 4, w: 1, d: 1, l: 1 },
      { label: 'A4', pts: 1, w: 0, d: 1, l: 2 }
    ], advanced: ['A1', 'A2', 'A3'] }] },
    { ev: 'draw', seq: 1, field: 48, groups: [{ group: 'A', teams: [
      { label: 'A1', seed: 1 }, { label: 'A2', seed: 24 }, { label: 'A3', seed: 25 }, { label: 'A4', seed: 48 }
    ] }] }
  ]

  const st = fold(events)

  assert.equal(st.field, 48)
  assert.equal(st.groups.A.table[0].d, 1)
  assert.deepEqual(st.groups.A.advanced, ['A1', 'A2', 'A3'])
})

test('arena copy derives best-third rule even when the draw event is missing', () => {
  const st = fold([{ ev: 'groups', seq: 1, standings: [{ group: 'C', table: [
    { label: 'C1', pts: 6 },
    { label: 'C2', pts: 4 },
    { label: 'C3', pts: 3 },
    { label: 'C4', pts: 1 }
  ], advanced: ['C1', 'C2', 'C3'] }] }])

  const html = render(st, 'arena')

  assert.match(html, /top 2 \+ best thirds advance/)
  assert.match(html, /C3/)
})

test('theme registry keeps the public 2026 theme key', () => {
  assert.deepEqual(Object.keys(THEMES).sort(), ['2026', 'arena', 'concrete'])
})
