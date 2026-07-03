'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseEvents, fold, render, THEMES, splitDoc, stripRefresh, serveShell, serveBody, serveRoute, bracketTree, viewTree, complete, demoEvents, demoLines } = require('../worldcup/references/live-view.js')

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
  assert.match(shell, /fetch\('\/frame'/, 'inlines the in-place update client (absolute path)')
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
  assert.ok(viewTree(fold([{ ev: 'gate', seq: 1, field: 32, disqualified: [] }])), 'gate alone (event #1) knows the field → skeleton paints from the very first event')
  assert.equal(viewTree(fold([{ ev: 'draw', seq: 1, field: 64, groups: [] }])), null, 'unknown field → no lying skeleton')
  // field normalization (review P1): an unsupported size is never stored → no skeleton AND no "N Team" HUD label
  const f64 = fold([{ ev: 'draw', seq: 1, field: 64, groups: [] }])
  assert.ok(!f64.field, 'unsupported field (64) is not stored as st.field')
  assert.doesNotMatch(render(f64, 'arena'), /\d+&#8201;Team/, 'unsupported field → no "N Team" HUD label')
  // gate-only 48 → field stored from event #1 → 48 skeleton + honest "48 Team" label
  const g48 = fold([{ ev: 'gate', seq: 1, field: 48, disqualified: [] }])
  assert.equal(g48.field, 48, 'gate (event #1) stores a supported field')
  assert.match(render(g48, 'arena'), /48&#8201;Team/, 'gate-only 48 → honest "48 Team" HUD label')
  // and the rendered page actually paints the blank slots during the group stage
  const gsHtml = render(groupStage, 'arena')
  assert.match(gsHtml, /class="sl tbd"/, 'blank TBD slots painted in the group stage')
  // state honesty: the HUD must say the GROUP STAGE is live, never claim a KO round is being played
  assert.match(gsHtml, /hudSeg stage"><span>Groups<\/span>/, 'HUD honestly labels the group stage as live')
  assert.doesNotMatch(gsHtml, /hudSeg stage"><span>R16<\/span>/, 'HUD never claims R16 is live during groups')
})

test('serveRoute: real browser Host wire-shape, loopback-only, method gate, /frame fragment', () => {
  const GET = (h, u) => serveRoute('GET', h, u, champSt)
  // the exact shape a browser sends to an ephemeral port — MUST be accepted (the bug a pre-stripped unit test hid)
  assert.equal(GET('127.0.0.1:8137', '/').status, 200, '127.0.0.1:PORT accepted')
  assert.equal(GET('localhost:8137', '/').status, 200, 'localhost:PORT accepted')
  assert.equal(GET('127.0.0.1', '/').status, 200, 'bare 127.0.0.1 accepted')
  // DNS-rebind / prefix-or-suffix bypass attempts refused (exact match, never startsWith)
  assert.equal(GET('evil.example.com', '/').status, 403, 'foreign Host refused')
  assert.equal(GET('localhost.evil.example:8137', '/').status, 403, 'a suffix of localhost is NOT loopback')
  assert.equal(GET('127.0.0.1.evil.example', '/').status, 403, 'a prefix of 127.0.0.1 is NOT loopback')
  // method gate
  assert.equal(serveRoute('POST', '127.0.0.1:8137', '/', champSt).status, 405, 'non-GET/HEAD rejected')
  assert.equal(serveRoute('HEAD', '127.0.0.1:8137', '/', champSt).status, 200, 'HEAD allowed')
  // routing: / → shell, /frame → bare fragment (query ignored)
  assert.match(GET('127.0.0.1:8137', '/').body, /id="wc-root"/, '/ serves the shell')
  assert.doesNotMatch(GET('127.0.0.1:8137', '/frame?x=1').body, /id="wc-root"|<html>/, '/frame is a bare fragment')
})

test('all three themes render every state without throwing (smoke)', () => {
  const states = [fold([]), fold([{ ev: 'draw', seq: 1, field: 32, groups: [] }]), champSt]
  for (const theme of Object.keys(THEMES)) for (const st of states) {
    assert.doesNotThrow(() => render(st, theme), `${theme} renders`)
    assert.match(render(st, theme), /<\/html>/, `${theme} produces a full document`)
  }
})

test('a group named __proto__ cannot pollute Object.prototype (regression: fold maps are null-proto)', () => {
  const st = fold([
    { ev: 'draw', seq: 1, field: 32, groups: [{ group: '__proto__', teams: [{ label: '__proto__', seed: 1 }, { label: 'y', seed: 2 }] }] },
    { ev: 'groups', seq: 2, standings: [{ group: '__proto__', table: [{ label: '__proto__', pts: 6, w: 2, d: 0, l: 0 }], advanced: ['__proto__'] }] }
  ])
  assert.equal(({}).table, undefined, 'Object.prototype.table not polluted')
  assert.equal(({}).advanced, undefined, 'Object.prototype.advanced not polluted')
  assert.equal(({}).teams, undefined, 'Object.prototype.teams not polluted')
  // the hostile group still folds + renders as an ordinary own key (all themes; arena also exercises the
  // seedMap keyed by the hostile team LABEL — a plain-object map leaked "[object Object]" as its seed)
  assert.deepEqual(st.groups['__proto__'].advanced, ['__proto__'], 'group folds as an own key')
  for (const theme of Object.keys(THEMES)) {
    let html
    assert.doesNotThrow(() => { html = render(st, theme) }, `${theme} renders`)
    assert.ok(!html.includes('[object Object]'), `${theme} never stringifies a prototype hit`)
  }
})

test('the embedded --demo stream is a complete, well-ordered tournament with exactly one DQ', () => {
  const evs = demoEvents()
  assert.deepEqual(evs.map(e => e.seq), evs.map((_, i) => i + 1), 'seq is dense + monotonic')
  const gates = evs.filter(e => e.ev === 'gate')
  assert.equal(gates.length, 1)
  assert.equal(gates[0].disqualified.length, 1, 'exactly one gate DQ')
  const groups = evs.filter(e => e.ev === 'groups')
  assert.equal(groups.length, 3, 'two partial snapshots + the final one')
  assert.ok(groups.slice(0, 2).every(g => g.standings.every(s => s.advanced.length === 0)), 'partials advance nobody')
  assert.ok(groups[2].standings.every(s => s.advanced.length === 2), 'final snapshot advances the top two per group')
  assert.equal(evs.filter(e => e.ev === 'match').length, 15, 'all 15 knockout games (R16→FINAL)')
  assert.equal(evs.filter(e => e.ev === 'match' && e.margin === 'pens').length, 1, 'exactly one pens')
  // fold the WIRE form through the real parser — the demo must be indistinguishable from a live journal
  const st = fold(parseEvents(demoLines().join('\n')))
  assert.ok(complete(st), 'folds to a completed tournament')
  assert.equal(st.field, 32)
  assert.equal(st.groupOrder.length, 8)
  assert.equal(st.dq.length, 1, 'one DQ folded')
  for (const theme of Object.keys(THEMES)) {
    const html = render(st, theme)
    assert.ok(html.includes(st.champion.label), `${theme} shows the champion label`)
    assert.ok(html.includes(st.dq[0].label), `${theme} shows the DQ in the gate panel`)
  }
})

test('every theme AND the served shell carry the shared trophy favicon in <head>', () => {
  for (const theme of Object.keys(THEMES)) {
    const { head } = splitDoc(render(champSt, theme))
    assert.match(head, /<link rel="icon" href="data:image\/svg\+xml,/, `${theme} head has the favicon`)
  }
  const shellHead = serveShell(champSt).split('</head>')[0]
  assert.match(shellHead, /<link rel="icon"/, 'served shell head has the favicon')
})

test('fold degrades accepted-but-malformed event fields instead of throwing (regression)', () => {
  // Every event below is ACCEPTED (matches ev + known shape) but carries a wrong-typed field —
  // the kind of thing a hand-edited or corrupted legacy no-nonce journal can produce (the nonced
  // beacon path is schema-validated upstream, but fold() itself must still not trust the shape).
  // fold() normalizes event-supplied list/object fields (arr()/obj()) and wraps each event body in
  // a per-event try/catch backstop, so one bad line degrades to a skipped/blank field instead of
  // throwing and bricking the poll/serve loop.
  const events = [
    { ev: 'draw', groups: 5 },
    { ev: 'groups', standings: [null] },
    { ev: 'groups', standings: 5 },
    { ev: 'bracket', rounds: {} },
    { ev: 'bracket', rounds: [null, { stakes: 'SF', matches: 3 }] },
    { ev: 'round', stakes: 'SF', matches: 3, eliminated: 9 },
    { ev: 'round', stakes: 'QF', matches: [null, { winner: 'A', loser: 'B' }], eliminated: ['B'] },
    { ev: 'match', stakes: 'QF', slot: 0, winner: 'A', loser: 'B' },
    { ev: 'gate', disqualified: 7 },
    { ev: 'champion' },
  ]
  let st
  assert.doesNotThrow(() => { st = fold(events) }, 'fold must not throw on accepted-but-malformed fields')
  assert.doesNotThrow(() => bracketTree(st), 'bracketTree must not throw on the normalized state')
  let html
  assert.doesNotThrow(() => { html = render(st) }, 'render must not throw on the normalized state')
  assert.equal(typeof html, 'string')

  // control: a well-formed stream still folds correctly end-to-end
  assert.equal(fold(demoEvents()).champion.label, 'cold-open')
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
