'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { SCHEMA, replayBundle } = require('../scripts/replay-group-panels.js')

const root = path.join(__dirname, '..')
const recordsDir = path.join(root, 'evidence', 'group-panel-replay', 'records')
const records = fs.readdirSync(recordsDir).sort().map(name => ({
  name,
  value: JSON.parse(fs.readFileSync(path.join(recordsDir, name), 'utf8')),
}))

test('dated records carry canonical replay inputs and reproduce both official fields exactly', () => {
  assert.equal(records.length, 2)
  for (const { name, value } of records) {
    assert.equal(value.schema, SCHEMA, name)
    assert.equal(value.run.status, 'completed', name)
    assert.equal(value.entrants.length, 32, name)
    assert.equal(value.matches.length, 48, name)
    assert.equal(value.official.qualifiers.length, 16, name)
    assert.deepEqual(value.panel.weights, [1, 1, 1], name)
    assert.match(value.run.stateSha256, /^[a-f0-9]{64}$/, name)
    assert.match(value.run.transcriptSetSha256, /^[a-f0-9]{64}$/, name)
    assert.equal(new Set(value.matches.map(match => match.ordinal)).size, 48, name)
    for (const entrant of value.entrants) {
      assert.equal(typeof entrant.seedRating, 'number', `${name}: ${entrant.label} seedRating`)
      assert.equal(typeof entrant.poolIndex, 'number', `${name}: ${entrant.label} poolIndex`)
      assert.equal(typeof entrant.drawOrder, 'number', `${name}: ${entrant.label} drawOrder`)
      assert.equal(typeof entrant.disqualified, 'boolean', `${name}: ${entrant.label} DQ`)
    }
    const replay = replayBundle(value)
    assert.deepEqual(replay.baseline, value.analysis.baseline, name)
    assert.equal(replay.baseline.standingsMatch, true, name)
    assert.equal(replay.baseline.qualifiersMatch, true, name)
  }
})

test('dated headline holds without freezing arbitrary rotation tables as universal oracles', () => {
  const majorityConfigurations = []
  for (const { name, value } of records) {
    for (const policy of value.analysis.policies.filter(policy => ['fixed-seat', 'rotating-seat', 'margin-trigger'].includes(policy.kind))) {
      assert.ok(policy.qualifierChanges > 0, `${name}: ${policy.kind} is not panel-equivalent`)
    }
    majorityConfigurations.push(...value.analysis.policies.filter(policy => policy.kind === 'majority-lock'))
  }
  assert.equal(majorityConfigurations.length, 6)
  for (const policy of majorityConfigurations) {
    assert.equal(policy.outcomeMismatches, 0)
    assert.equal(policy.qualifierChanges, 0)
  }
})

test('dated margin evidence shows confidence labels are not a safe escalation trigger', () => {
  const total = margin => records.reduce((sum, record) => {
    const row = record.value.analysis.marginEvidence[margin]
    sum.votes += row.votes
    sum.disagreements += row.disagreements
    return sum
  }, { votes: 0, disagreements: 0 })
  assert.deepEqual(total('narrow'), { votes: 64, disagreements: 18 })
  assert.deepEqual(total('clear'), { votes: 188, disagreements: 22 })
  assert.deepEqual(total('decisive'), { votes: 18, disagreements: 1 })
  assert.deepEqual(total('missing'), { votes: 0, disagreements: 0 })
})

test('all four candidate-generation surfaces carry the canonical no-length-tools instruction', () => {
  const source = fs.readFileSync(path.join(root, 'worldcup', 'references', 'workflow-template.js'), 'utf8')
  const canonical = 'Work from the inline brief and artifact. Do not call tools merely to measure length or word count, and do not iteratively redraft toward an unstated length target; length is free unless the criteria explicitly impose a hard limit.'
  assert.ok(source.includes(`const GENERATION_DISCIPLINE = '${canonical}'`))
  assert.equal((source.match(/\$\{GENERATION_DISCIPLINE\}/g) || []).length, 4)
  const finder = source.slice(source.indexOf('const finderPrompt'), source.indexOf('const found = await agent'))
  assert.doesNotMatch(finder, /GENERATION_DISCIPLINE/)
})

test('lean-tier doctrine consistently names a fixed lens and its measured quality trade', () => {
  const files = [
    path.join(root, 'worldcup', 'SKILL.md'),
    path.join(root, 'worldcup', 'references', 'judging.md'),
    path.join(root, 'worldcup', 'references', 'workflow-template.js'),
  ]
  const prose = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(prose, /single rotated juror|1 rotated juror/)
  assert.match(prose, /fixed, domain-chosen/)
  assert.match(prose, /1-6 of 16 advancement positions/)
  assert.match(prose, /SCREENERS=1.*majority protection/s)
  assert.match(prose, /champion, Elo .*trust verdict are unknowable/s)
})
