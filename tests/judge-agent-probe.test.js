'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const PROBE = path.join(__dirname, '..', 'worldcup', 'references', 'workflow-judge-agent-probe.js')
const RECORD = path.join(__dirname, 'fixtures', 'judge-probe', '2026-07-12-claude-code-2.1.207-fable-5.json')
const DOGFOOD = path.join(__dirname, 'fixtures', 'judge-probe', '2026-07-11-run2-field-dogfood.json')
const DOGFOOD_RUN3 = path.join(__dirname, 'fixtures', 'judge-probe', '2026-07-11-run3-field-dogfood.json')

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

  assert.equal(result.calls, 18)
  assert.equal(result.completed, 18)
  assert.equal(result.missingTypeHardFailed, true)
  assert.equal(calls.length, 19)
  for (const chars of Object.values(result.promptChars)) assert.ok(chars >= 10000 && chars <= 15000, `probe prompt length ${chars} is outside 10–15k chars`)

  for (let i = 1; i < 17; i += 2) {
    const control = calls[i]
    const typed = calls[i + 1]
    assert.equal(control.prompt, typed.prompt, 'paired prompt bytes drifted between arms')
    assert.equal(control.opts.agentType, undefined)
    assert.equal(typed.opts.agentType, 'worldcup-judge')
    assert.deepEqual(control.opts.schema, typed.opts.schema)
    assert.match(control.prompt, /Do not inspect README\.md/)
    assert.match(control.prompt, /private benchmark files prove/)
  }
  const denialControl = calls[17]
  const denialTyped = calls[18]
  assert.equal(denialControl.prompt, denialTyped.prompt)
  assert.match(denialControl.prompt, /^MECHANICAL_DENIAL_PROBE/)
  assert.equal(denialControl.opts.agentType, undefined)
  assert.equal(denialTyped.opts.agentType, 'worldcup-judge')
  assert.deepEqual(denialControl.opts.schema, denialTyped.opts.schema)
})

test('judge definition uses the documented denylist and makes the forced-call probe override prompt refusal', () => {
  const definition = fs.readFileSync(path.join(__dirname, '..', 'worldcup', 'references', 'agents', 'worldcup-judge.md'), 'utf8')
  assert.doesNotMatch(definition, /^tools:\s*\[\]/m)
  assert.match(definition, /^disallowedTools: /m)
  for (const tool of ['Artifact', 'AskUserQuestion', 'Read', 'Bash', 'Write', 'WebFetch', 'mcp__*']) assert.ok(definition.includes(tool), tool)
  assert.match(definition, /ListMcpResourcesTool.*ReadMcpResourceDirTool.*ReadMcpResourceTool/)
  assert.match(definition, /Do not voluntarily refuse that probe/)
})

test('recorded host probe satisfies the graduation contract', () => {
  const record = JSON.parse(fs.readFileSync(RECORD, 'utf8'))
  assert.equal(record.schemaVersion, 2)
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
    capability: 'PASS', schema: 'PASS', denial: 'PASS', cost: 'INCONCLUSIVE',
    notes: record.verdict.notes,
  })
  assert.ok(record.denial.control.ordinaryToolCalls >= 1)
  assert.equal(record.denial.typed.ordinaryToolCalls, 0)
  assert.equal(record.denial.control.observation, 'tool-succeeded')
  assert.equal(record.denial.typed.observation, 'tool-unavailable')
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
  assert.equal(record.verdict.capability, 'INCONCLUSIVE')
  assert.equal(record.verdict.cost, 'INCONCLUSIVE')
  assert.equal(record.verdict.quality, 'INCONCLUSIVE')
})

test('completed run-3 dogfood closes capability, cost, and quality', () => {
  const record = JSON.parse(fs.readFileSync(DOGFOOD_RUN3, 'utf8'))
  assert.equal(record.schemaVersion, 2)
  assert.equal(record.observed.status, 'completed')
  // Capability: every judge surface typed, zero ordinary tool calls, one schema call per judge.
  assert.equal(record.observed.observedAgentTypes['worldcup-judge'], 332)
  assert.equal(record.observed.observedAgentTypes['workflow-subagent'], 31)
  assert.equal(record.observed.typedOrdinaryToolCalls, 0)
  assert.equal(record.observed.typedStructuredOutputCalls, record.observed.observedAgentTypes['worldcup-judge'])
  // Cost: judge surfaces at exactly one request per invocation, strictly below the Run-2 baseline.
  // The exact totals are pinned so a quiet edit to any headline number fails loudly here.
  assert.equal(record.observed.invocations, 363)
  assert.equal(record.observed.requests, 419)
  assert.equal(record.observed.logicalInput, 5809297)
  assert.equal(record.observed.output, 2193990)
  assert.equal(record.judgeSurfaces.invocations, 331)
  assert.equal(record.judgeSurfaces.requests, record.judgeSurfaces.invocations)
  assert.equal(record.judgeSurfaces.logicalInput, 3194007)
  assert.equal(record.judgeSurfaces.output, 1876173)
  assert.ok(record.judgeSurfaces.logicalInput < record.run2JudgeBaseline.logicalInput)
  assert.ok(record.judgeSurfaces.output < record.run2JudgeBaseline.output)
  assert.ok(record.judgeSurfaces.inputEquivalentAt5xOutput < record.run2JudgeBaseline.inputEquivalentAt5xOutput)
  // The paired in-run tail measurement: typed agents carry no default-agent uncached tail.
  // 332 typed agents = the 331 scoring judge surfaces plus the pre-generation sentinel.
  const tail = record.judgeSurfaces.firstRequestUncachedInput
  assert.equal(tail.typedAgentsMeasured, 332)
  assert.equal(tail.typedMedian, 2)
  assert.equal(tail.typedMin, 2)
  assert.equal(tail.typedMax, 2)
  assert.equal(tail.defaultTypeGenSameRun, 10513)
  // Quality: gate, canary, and trust indicators recorded; verdicts closed.
  for (const key of ['gate', 'gateCanary', 'trust', 'originalPlacement', 'champion']) {
    assert.ok(record.qualityIndicators[key], `qualityIndicators.${key} missing`)
  }
  assert.match(record.qualityIndicators.gate, /FABRICATION/)
  assert.match(record.qualityIndicators.trust, /rating leader/)
  assert.deepEqual(
    { capability: record.verdict.capability, cost: record.verdict.cost, quality: record.verdict.quality },
    { capability: 'PASS', cost: 'PASS', quality: 'PASS' }
  )
  assert.ok(record.verdict.notes.includes('not a head-to-head judging-quality benchmark'))
})
