'use strict'

// End-to-end fake-judge run of worldcup/references/workflow-template.js.
// The template executes for real (generation -> gate -> seeding -> groups -> knockout ->
// reference challenge -> report); only the host seams (agent/parallel/log/phase/args) are
// stubbed, deterministically, by scripts/workflow-harness.js.

const test = require('node:test')
const assert = require('node:assert/strict')
const { runTournament, parallelForward, parallelReverse } = require('../scripts/workflow-harness.js')

const HOSTILE = '</script><script>alert(1)</script>'
const DQ_LABEL = 'variant-05'
const LABELS = [
  ...Array.from({ length: 31 }, (_, i) => `variant-${String(i + 1).padStart(2, '0')}`),
  HOSTILE, // one hostile team label to prove report escaping
]
// mirrors the template's esc(): what a label must look like once seated in the report HTML
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// One shared baseline run (the fast Promise.all host); memoized because node:test runs blocks serially.
let baseline
const baseRun = async () => (baseline ??= await runTournament({ labels: LABELS, dqLabel: DQ_LABEL }))

test('run completes end-to-end and returns the tournament object', async () => {
  const { result, unknown } = await baseRun()
  assert.equal(typeof result, 'object')
  assert.ok(result !== null)
  assert.ok(!result.error, `template returned an error: ${result && result.error}`)
  assert.equal(typeof result.champion, 'object')
  assert.ok(LABELS.includes(result.champion.label), `champion "${result.champion.label}" is not a fielded team`)
  assert.equal(typeof result.trust, 'object')
  assert.equal(typeof result.trust.verdict, 'string')
  // the stub judge covered every role the template called — no silent null votes
  assert.deepEqual(unknown, [])
})

test('reportHtml is a non-empty string containing the champion label', async () => {
  const { result } = await baseRun()
  assert.equal(typeof result.reportHtml, 'string')
  assert.ok(result.reportHtml.length > 0)
  assert.ok(result.reportHtml.includes(esc(result.champion.label)),
    `reportHtml does not contain the (escaped) champion label "${result.champion.label}"`)
})

test('graph has 8 groups of 4 and globalRanking has all 32 entries', async () => {
  const { result } = await baseRun()
  assert.equal(result.graph.groups.length, 8)
  for (const g of result.graph.groups) {
    assert.equal(g.standings.length, 4, `group ${g.group} does not have 4 teams`)
    assert.equal(g.advanced.length, 2, `group ${g.group} should advance exactly its top 2 (FIELD=32)`)
    assert.equal(g.matches.length, 6, `group ${g.group} should play a 6-match round-robin`)
  }
  assert.equal(result.globalRanking.length, 32)
  assert.equal(new Set(result.globalRanking.map(r => r.label)).size, 32, 'globalRanking labels are not unique')
})

test('the scripted fabrication DQ lands and the DQ\'d team cannot be champion', async () => {
  const { result } = await baseRun()
  const dq = result.disqualified.find(d => d.label === DQ_LABEL)
  assert.ok(dq, `scripted DQ "${DQ_LABEL}" missing from result.disqualified`)
  assert.equal(dq.category, 'FABRICATION')
  assert.equal(result.disqualified.length, 1, 'only the scripted DQ should be disqualified')
  assert.notEqual(result.champion.label, DQ_LABEL)
})

test('a hostile team label cannot break out of the report markup (<script> escaping)', async () => {
  const { result } = await baseRun()
  const html = result.reportHtml
  // the hostile team is really in the report — escaped
  assert.ok(html.includes(esc(HOSTILE)), 'hostile label (escaped) should appear in the report')
  // ... and never raw
  assert.ok(!html.includes(HOSTILE), 'raw hostile label leaked into the report')
  assert.ok(!html.includes('<script>alert(1)'), 'hostile script tag leaked into the report')
  // the only <script>...</script> in the document is the report's own single inline script
  assert.equal(html.split('<script').length - 1, 1, 'unexpected extra <script open tag')
  assert.equal(html.split('</script').length - 1, 1, 'unexpected extra </script close tag')
})

test('report is invariant to agent completion order (determinism)', async () => {
  // Same field, same deterministic judges — the ONLY difference is which parallel() thunk
  // completes first (strict input order vs strict reverse order, results in input positions
  // both times). A correct engine must produce byte-identical reports; completion-order pushes
  // into shared arrays (seeding pre-pass, group results, knockout Elo log) break this.
  const fwd = await runTournament({ labels: LABELS, dqLabel: DQ_LABEL, parallel: parallelForward })
  const rev = await runTournament({ labels: LABELS, dqLabel: DQ_LABEL, parallel: parallelReverse })
  assert.ok(!fwd.result.error && !rev.result.error, 'a determinism run returned an error')
  const a = fwd.result.reportHtml, b = rev.result.reportHtml
  if (a !== b) {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    assert.fail(`reportHtml differs between completion orders (first divergence at char ${i}: ` +
      `forward "...${a.slice(Math.max(0, i - 40), i + 40)}..." vs reverse "...${b.slice(Math.max(0, i - 40), i + 40)}...") — ` +
      'completion-order state is leaking into the tournament')
  }
  assert.equal(a, b)
})

test('reserved-word entrant labels (Object.prototype property names) do not crash report generation', async () => {
  // mlog/DATA in the report builder are keyed by entrant label. Before those maps switched to
  // Object.create(null), a label equal to an Object.prototype property name (e.g. '__proto__',
  // 'toString', 'constructor') hit an INHERITED value instead of an own array, so addLog's
  // `mlog[w].push(...)` crashed with "mlog[w].push is not a function" at the very end of a run.
  const RESERVED = ['__proto__', 'toString', 'constructor']
  const reservedLabels = [
    ...Array.from({ length: 29 }, (_, i) => `variant-${String(i + 1).padStart(2, '0')}`),
    ...RESERVED,
  ]
  assert.equal(new Set(reservedLabels).size, 32, 'reserved-label field must be 32 unique labels')

  const { result } = await runTournament({ labels: reservedLabels })
  assert.ok(!result.error, `template returned an error: ${result && result.error}`)
  assert.equal(typeof result.reportHtml, 'string')
  assert.ok(result.reportHtml.length > 0)
  assert.ok(reservedLabels.includes(result.champion.label), `champion "${result.champion.label}" is not a fielded team`)
  // all three reserved labels played group matches, so they must be present (escaped) in the report
  for (const label of RESERVED) {
    assert.ok(result.reportHtml.includes(esc(label)), `reserved label "${label}" (escaped) missing from reportHtml`)
  }
  // The client must consume DATA via JSON.parse: in an evaluated object literal a non-computed
  // "__proto__" member is the Annex B.3.1 prototype SETTER, so a '__proto__' entrant would
  // silently reparent DATA client-side instead of becoming an entry — a hazard server-side byte
  // assertions alone cannot catch. Pin the embed shape.
  assert.ok(result.reportHtml.includes('var DATA=JSON.parse('), 'report must embed DATA via JSON.parse, not a bare object literal')
})

test('extractTeams recognizes comment-wrapped Team: markers (code-shaped artifacts)', () => {
  const { extractTeams } = require('../scripts/workflow-harness.js')
  assert.deepEqual(extractTeams('Team: prose-entry\n\nBody text.'), ['prose-entry'])
  assert.deepEqual(extractTeams('// Team: js-entry\nconst x = 1'), ['js-entry'])
  assert.deepEqual(extractTeams('-- Team: sql-entry\nSELECT 1'), ['sql-entry'])
  assert.deepEqual(extractTeams('# Team: py-entry\nx = 1'), ['py-entry'])
  // judge identity depends on this: a code artifact whose marker went unrecognized would
  // silently fall back to segment-hash identity and no test would catch it downstream
  assert.deepEqual(extractTeams('leading prose\n// Team: a\nmore\n// Team: b'), ['a', 'b'])
})

test('the report celebrates a clean champion with confetti, and the trophy is the replay control', async () => {
  const { result } = await baseRun()
  const html = result.reportHtml
  // baseline champion passed the gate → the party flag is ON (a gate-DQ champion would get PARTY=false:
  // no confetti for a verdict that says DO NOT TRUST)
  assert.match(html, /var PARTY=true/, 'clean champion turns the party on')
  assert.match(html, /function party\(/, 'confetti engine is embedded')
  assert.match(html, /onclick="party\(\)"/, 'the trophy replays the burst on click')
  assert.match(html, /role="button" tabindex="0"/, 'the trophy replay is keyboard-reachable')
  assert.match(html, /prefers-reduced-motion/, 'auto-fire honors reduced motion')
  // retina: the canvas CSS box must be pinned by CSS — inset alone leaves a replaced element at its
  // attribute size and the dpr-scaled backing store then draws the burst off-screen at 2x coordinates
  assert.match(html, /\.fx\{[^}]*width:100%;height:100%/, 'confetti canvas CSS box is viewport-pinned')
  // the engine must live INSIDE the report's single script block (a second <script> tag would trip
  // the escaping invariant pinned above)
  assert.equal(html.split('<script').length - 1, 1, 'confetti added no extra script tag')
})
