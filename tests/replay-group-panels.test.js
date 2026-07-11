'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  DRAW,
  SCHEMA,
  formatSummary,
  majorityLockDecision,
  parseArgs,
  replayBundle,
  standings,
  tallyWinner,
  writeRecordAtomic,
} = require('../scripts/replay-group-panels.js')

function syntheticBundle() {
  const labels = ['a', 'b', 'c', 'd']
  const entrants = labels.map((label, drawOrder) => ({
    label, poolIndex: drawOrder, seedRank: drawOrder + 1, seedRating: 1600 - drawOrder * 25,
    seededOrder: drawOrder, drawOrder, group: 'A', groupIndex: 0, withinGroup: drawOrder,
    disqualified: false,
  }))
  const winners = ['a', 'a', 'a', 'b', 'b', 'c']
  let ordinal = 0
  const matches = []
  for (let ai = 0; ai < labels.length; ai++) for (let bi = ai + 1; bi < labels.length; bi++) {
    const winner = winners[ordinal]
    matches.push({
      ordinal, group: 'A', groupIndex: 0, a: labels[ai], b: labels[bi], walkover: false,
      votes: ['substance', 'fit', 'craft'].map((lens, seat) => ({ seat, lens, status: 'valid', winner, margin: 'clear', weight: 1 })),
      officialWinner: winner,
    })
    ordinal++
  }
  return {
    schema: SCHEMA,
    policyVersion: 'test',
    panel: { kind: 'default-unit-three', seats: ['substance', 'fit', 'craft'], weights: [1, 1, 1], sections: false },
    entrants,
    matches,
    official: {
      standings: [{ group: 'A', table: [
        { label: 'a', pts: 9, w: 3, d: 0, l: 0 },
        { label: 'b', pts: 6, w: 2, d: 0, l: 1 },
        { label: 'c', pts: 3, w: 1, d: 0, l: 2 },
        { label: 'd', pts: 0, w: 0, d: 0, l: 3 },
      ], advanced: ['a', 'b'] }],
      qualifiers: ['a', 'b'],
    },
  }
}

test('baseline replay reproduces official standings before any counterfactual is allowed', () => {
  const replay = replayBundle(syntheticBundle())
  assert.deepEqual(replay.baseline, { standingsMatch: true, qualifiersMatch: true, calls: 18 })
  assert.equal(replay.counterfactual.supported, true)
})

test('identity failure suppresses counterfactuals and unsupported panels fall back to full replay', () => {
  const source = syntheticBundle()
  const broken = structuredClone(source)
  broken.official.qualifiers[0] = 'not-an-official-qualifier'
  assert.throws(() => replayBundle(broken), /baseline identity failed/)

  const custom = structuredClone(source)
  custom.panel.weights = [2, 1, 1]
  const replay = replayBundle(custom)
  assert.equal(replay.baseline.qualifiersMatch, true)
  assert.equal(replay.counterfactual.supported, false)
  assert.deepEqual(replay.policies, [])
})

test('majority-lock exhaustively locks only when every possible held-out vote preserves the full-panel result', () => {
  const states = ['A', 'B', DRAW, null]
  const vote = winner => winner == null
    ? { status: 'missing', winner: null, weight: 1 }
    : { status: 'valid', winner, weight: 1 }
  for (const first of states) for (const second of states) for (const heldOut of states) {
    const firstVotes = [vote(first), vote(second)]
    const decision = majorityLockDecision(firstVotes, 'A', 'B')
    const actual = tallyWinner([...firstVotes, vote(heldOut)], 'A', 'B')
    if (decision.locked) assert.equal(decision.winner, actual, `${first}/${second}/${heldOut}`)
  }
})

test('standings use seed rating then stable draw order, and a DQ walkover keeps its ordinal', () => {
  const group = [
    { label: 'a', seedRating: 1500, drawOrder: 1 },
    { label: 'b', seedRating: 1500, drawOrder: 0 },
    { label: 'c', seedRating: 1490, drawOrder: 2 },
    { label: 'dq', seedRating: 1600, drawOrder: 3 },
  ]
  const results = [
    { groupIndex: 0, a: 'a', b: 'dq', winner: 'a', ordinal: 2, walkover: true },
    { groupIndex: 0, a: 'b', b: 'c', winner: DRAW, ordinal: 3 },
  ]
  const table = standings(group, 0, results)
  assert.equal(table[0].label, 'a')
  assert.equal(table[1].label, 'b')
  assert.equal(results[0].ordinal, 2)
})

test('evidence writes are atomic and immutable', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldcup-replay-record-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'record.json')
  writeRecordAtomic(file, { schema: SCHEMA, ok: true })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { schema: SCHEMA, ok: true })
  assert.throws(() => writeRecordAtomic(file, { schema: SCHEMA, ok: false }), /refusing to overwrite/)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { schema: SCHEMA, ok: true })
})

test('replay CLI is bounded by default and exposes explicit bulk JSON plus actionable help', () => {
  assert.deepEqual(parseArgs(['run', '--state', 'state.json', '--json']), {
    runDir: path.resolve('run'), statePath: path.resolve('state.json'), recordPath: undefined, json: true,
  })
  assert.equal(parseArgs(['--help']).help, true)
  assert.throws(() => parseArgs(['--wat']), /unknown option: --wat[\s\S]*Examples:/)
  assert.throws(() => parseArgs(['run', '--record']), /--record requires a file argument[\s\S]*Usage:/)
  const bundle = syntheticBundle()
  bundle.run = { id: 'wf_test' }
  bundle.warnings = []
  bundle.analysis = replayBundle(bundle)
  const summary = formatSummary(bundle)
  assert.ok(summary.split('\n').length < 10)
  assert.match(summary, /Full bundle: rerun with --json/)
})
