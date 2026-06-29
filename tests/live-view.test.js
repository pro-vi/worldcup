'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseEvents, fold, render, THEMES, splitDoc, stripRefresh, serveShell, serveBody, serveRoute, bracketTree, viewTree, complete } = require('../worldcup/references/live-view.js')

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

const champSt = fold([
  { ev: 'draw', seq: 1, field: 32, groups: [{ group: 'A', teams: [{ label: 'A1', seed: 1 }, { label: 'A2', seed: 16 }] }] },
  { ev: 'champion', seq: 2, label: 'A1', stakes: 'FINAL' }
])

test('splitDoc separates head (through </head>) from inner body, no nesting leakage', () => {
  const { head, body } = splitDoc(render(champSt, 'arena'))
  assert.ok(head.endsWith('</head>'), 'head ends at </head>')
  assert.ok(head.includes('<style>'), 'head carries the inline CSS')
  assert.ok(!body.includes('<head>') && !body.includes('</body>') && !body.includes('<html>'), 'body is a bare fragment')
  assert.match(body, /A1/, 'body carries the bracket content')
})

test('stripRefresh removes the auto-reload meta tag (served pages must not navigate)', () => {
  const live = render(fold([{ ev: 'draw', seq: 1, field: 32, groups: [] }]), 'arena')
  assert.match(live, /http-equiv="refresh"/, 'a live file render carries meta-refresh')
  assert.doesNotMatch(stripRefresh(live), /http-equiv="refresh"/, 'stripRefresh drops it')
})

test('serveShell mounts the bracket in #wc-root, inlines the poll client, and never auto-reloads', () => {
  const shell = serveShell(champSt)
  assert.match(shell, /id="wc-root"/, 'has the morph/swap container')
  assert.match(shell, /fetch\('frame'/, 'inlines the in-place update client')
  assert.doesNotMatch(shell, /http-equiv="refresh"/, 'served shell does not meta-refresh')
})

test('group stage shows a BLANK bracket skeleton (not hidden), sized from the field; logic unaffected', () => {
  const groupStage = fold([
    { ev: 'gate', seq: 1, field: 32, disqualified: [] },
    { ev: 'draw', seq: 2, field: 32, groups: [{ group: 'A', teams: [{ label: 'A1', seed: 1 }, { label: 'A2', seed: 16 }] }] },
    { ev: 'groups', seq: 3, standings: [{ group: 'A', table: [{ label: 'A1', pts: 6 }], advanced: [] }] }
  ])
  // logic-facing tree is still empty — completion/exit must not be fooled by the skeleton
  assert.equal(bracketTree(groupStage), null, 'no REAL bracket yet')
  assert.equal(complete(groupStage), false, 'group stage is not complete')
  // view-facing tree is a full blank skeleton of the right shape
  const vt = viewTree(groupStage)
  assert.deepEqual(vt.map(r => r.stakes), ['R16', 'QF', 'SF', 'FINAL'], '32-field → 4 rounds')
  assert.ok(vt.every(r => r.matches.every(m => m.status === 'pending' && m.a == null)), 'every slot blank/TBD')
  assert.equal(viewTree(fold([{ ev: 'draw', seq: 1, field: 48, groups: [] }])).length, 5, '48-field → 5 rounds (adds R32)')
  assert.equal(viewTree(fold([])), null, 'no field at all → hidden (legacy fallback)')
  // and the rendered page actually paints the blank slots during the group stage
  const gsHtml = render(groupStage, 'arena')
  assert.match(gsHtml, /class="sl tbd"/, 'blank TBD slots painted in the group stage')
  // state honesty: the HUD must say the GROUP STAGE is live, never claim a KO round is being played
  assert.match(gsHtml, /hudSeg stage"><span>Groups<\/span>/, 'HUD honestly labels the group stage as live')
  assert.doesNotMatch(gsHtml, /hudSeg stage"><span>R16<\/span>/, 'HUD never claims R16 is live during groups')
})

test('serveRoute: loopback-only (DNS-rebind guard), /frame is bare markup, else the shell', () => {
  assert.equal(serveRoute('evil.example.com', '/', champSt).status, 403, 'foreign Host refused')
  assert.equal(serveRoute('127.0.0.1', '/', champSt).status, 200, '127.0.0.1 allowed')
  assert.equal(serveRoute('localhost', '/', champSt).status, 200, 'localhost allowed')
  assert.match(serveRoute('127.0.0.1', '/', champSt).body, /id="wc-root"/, 'root path serves the shell')
  const frame = serveRoute('127.0.0.1', '/frame?x=1', champSt).body
  assert.doesNotMatch(frame, /id="wc-root"|<html>/, '/frame is a bare fragment (query string ignored)')
})

test('all three themes render every state without throwing (smoke)', () => {
  const states = [fold([]), fold([{ ev: 'draw', seq: 1, field: 32, groups: [] }]), champSt]
  for (const theme of Object.keys(THEMES)) for (const st of states) {
    assert.doesNotThrow(() => render(st, theme), `${theme} renders`)
    assert.match(render(st, theme), /<\/html>/, `${theme} produces a full document`)
  }
})

test('a frame carries its own bracket-sizing CSS so columns never collapse to the top (regression)', () => {
  // server starts BEFORE a bracket exists — the shell's head has no column-height rule yet
  const emptyShell = serveShell(fold([]))
  assert.doesNotThrow(() => serveShell(fold([])), 'empty-state shell renders')
  // once the bracket is painted, the FRAME (not the head) must deliver the height rule that spreads matches
  const painted = fold([
    { ev: 'draw', seq: 1, field: 32, groups: [] },
    { ev: 'bracket', seq: 2, rounds: [
      { stakes: 'R16', matches: Array.from({ length: 8 }, (_, i) => ({ slot: i, a: 'a' + i, b: 'b' + i })) },
      { stakes: 'QF', matches: Array.from({ length: 4 }, (_, i) => ({ slot: i, a: null, b: null })) },
      { stakes: 'SF', matches: Array.from({ length: 2 }, (_, i) => ({ slot: i, a: null, b: null })) },
      { stakes: 'FINAL', matches: [{ slot: 0, a: null, b: null }] }
    ] }
  ])
  const frame = serveBody(painted)
  assert.match(frame, /<style/, 'frame carries its own <style> block')
  assert.match(frame, /\.kocol \.matches\{height:/, 'frame carries the column-height rule (the bug: it was stuck in a stale head)')
})
