'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const PROBE = path.join(__dirname, '..', 'worldcup', 'references', 'workflow-judge-agent-probe.js')
const RECORD = path.join(__dirname, 'fixtures', 'judge-probe', '2026-07-11-fable-5.json')
const DOGFOOD = path.join(__dirname, 'fixtures', 'judge-probe', '2026-07-11-run2-field-dogfood.json')

test('judge-agent probe pairs byte-identical realistic prompts across typed and control arms', async () => {
  const raw = fs.readFileSync(PROBE, 'utf8')
  const src = raw.replace(/^export const meta/m, 'const meta')
  const run = new AsyncFunction('agent', 'parallel', 'phase', src)
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    if (opts.agentType === 'worldcup-judge-does-not-exist') throw new Error('unknown agent type')
    const props = opts.schema.properties
    if (props.disqualified) return { disqualified: false, category: 'NONE', flaw: '', confidence: 'high', note: '' }
    if (props.reason) return { winner: props.winner.enum.includes('DRAW') ? 'DRAW' : 'X', margin: 'narrow', reason: 'Inline evidence decides the comparison.' }
    return { winner: 'X', confidence: 'lean' }
  }
  const result = await run(agent, thunks => Promise.all(thunks.map(thunk => thunk())), () => {})

  assert.equal(result.calls, 16)
  assert.equal(result.completed, 16)
  assert.equal(result.missingTypeHardFailed, true)
  assert.equal(calls.length, 17)
  for (const chars of Object.values(result.promptChars)) assert.ok(chars >= 10000 && chars <= 15000, `probe prompt length ${chars} is outside 10–15k chars`)

  for (let i = 1; i < calls.length; i += 2) {
    const control = calls[i]
    const typed = calls[i + 1]
    assert.equal(control.prompt, typed.prompt, 'paired prompt bytes drifted between arms')
    assert.equal(control.opts.agentType, undefined)
    assert.equal(typed.opts.agentType, 'worldcup-judge')
    assert.deepEqual(control.opts.schema, typed.opts.schema)
    assert.match(control.prompt, /Do not inspect README\.md/)
    assert.match(control.prompt, /private benchmark files prove/)
  }
})

test('recorded host probe satisfies the graduation contract', () => {
  const record = JSON.parse(fs.readFileSync(RECORD, 'utf8'))
  assert.equal(record.schemaVersion, 1)
  assert.equal(record.probe.missingTypeHardFailed, true)
  for (const chars of Object.values(record.probe.promptChars)) assert.ok(chars >= 10000 && chars <= 15000)
  assert.equal(record.probe.promptSha256.length, 4)
  assert.ok(record.probe.promptSha256.every(hash => /^[0-9a-f]{64}$/.test(hash)))
  assert.deepEqual(record.typed.observedAgentTypes, { 'worldcup-judge': 8 })
  assert.equal(record.typed.completed, record.typed.invocations)
  assert.equal(record.typed.ordinaryToolCalls, 0)
  assert.equal(record.typed.structuredOutputCalls, record.typed.invocations)
  assert.ok(record.typed.requestsMedian <= record.control.requestsMedian * 1.2)
  assert.ok(record.typed.inputEquivalentAt5xOutput < record.control.inputEquivalentAt5xOutput)
  assert.deepEqual(record.verdict, {
    capability: 'PASS', schema: 'PASS', cost: 'PASS',
    notes: record.verdict.notes,
  })
})

test('dogfood record separates execution evidence from rate-limited quality evidence', () => {
  const record = JSON.parse(fs.readFileSync(DOGFOOD, 'utf8'))
  assert.equal(record.schemaVersion, 1)
  assert.equal(record.observed.status, 'completed')
  assert.deepEqual(record.observed.observedAgentTypes, { 'worldcup-judge': record.observed.invocations })
  assert.equal(record.observed.ordinaryToolCalls, 0)
  assert.ok(record.observed.structuredOutputCalls < record.observed.invocations, 'fixture must retain the session-limit caveat')
  assert.ok(record.observed.requests < record.run2JudgeBaseline.requests)
  assert.ok(record.observed.logicalInput < record.run2JudgeBaseline.logicalInput)
  assert.ok(record.observed.inputEquivalentAt5xOutput < record.run2JudgeBaseline.inputEquivalentAt5xOutput)
  assert.equal(record.verdict.capability, 'PASS')
  assert.equal(record.verdict.cost, 'PASS_WITH_CAVEAT')
  assert.equal(record.verdict.quality, 'INCONCLUSIVE')
})
