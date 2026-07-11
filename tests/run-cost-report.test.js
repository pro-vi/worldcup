'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { analyzeRun, formatReport, parseArgs, roleForLabel } = require('../scripts/run-cost-report.js')

function writeJsonLines(file, rows) {
  fs.writeFileSync(file, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`)
}

test('roleForLabel classifies every workflow cost role', () => {
  assert.equal(roleForLabel('gen:short'), 'gen')
  assert.equal(roleForLabel('flaw3:short'), 'screen')
  assert.equal(roleForLabel('seed:a>b'), 'seed')
  assert.equal(roleForLabel('GROUP:fit:a>b'), 'group-lens')
  assert.equal(roleForLabel('QF:integrity:a>b'), 'knockout-lens')
  assert.equal(roleForLabel('FINAL:tiebreak:a'), 'tiebreak')
  // The tiebreak row means ALL tiebreak seats: a group-stage tiebreak must not hide in group-lens.
  assert.equal(roleForLabel('GROUP:tiebreak:a'), 'tiebreak')
  assert.equal(roleForLabel('wc-live:match'), 'beacon')
  assert.equal(roleForLabel('probe:control:group:1'), 'judge-probe-control')
  assert.equal(roleForLabel('probe:typed:group:1'), 'judge-probe-typed')
  assert.equal(roleForLabel('judge-sentinel'), 'judge-sentinel')
  // Sections/axes-mode labels: generation-side cost lands in gen; the slot judge is seed-like.
  assert.equal(roleForLabel('slot:hook:v2'), 'gen')
  assert.equal(roleForLabel('axis-finder'), 'gen')
  assert.equal(roleForLabel('predicted-optimum'), 'gen')
  assert.equal(roleForLabel('slotjudge:hook:a>b'), 'seed')
  assert.equal(roleForLabel('mystery-agent'), 'other')
})

test('analyzeRun reports observed probe agent types and excludes StructuredOutput from ordinary tools', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldcup-cost-probe-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runDir = path.join(root, 'subagents', 'workflows', 'wf_probe')
  const stateDir = path.join(root, 'workflows')
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(stateDir, { recursive: true })
  const fixtures = [
    ['a1', 'probe:control:group:1', 'workflow-subagent'],
    ['a2', 'probe:typed:group:1', 'worldcup-judge'],
  ]
  fs.writeFileSync(path.join(stateDir, 'wf_probe.json'), JSON.stringify({
    runId: 'wf_probe', agentCount: 2,
    workflowProgress: fixtures.map(([agentId, label]) => ({ agentId, label, phaseTitle: 'Probe' })),
  }))
  writeJsonLines(path.join(runDir, 'journal.jsonl'), fixtures.map(([agentId], i) => ({ type: 'started', key: `k${i}`, agentId })))
  for (const [agentId, , agentType] of fixtures) {
    writeJsonLines(path.join(runDir, `agent-${agentId}.jsonl`), [
      { type: 'assistant', agentId, requestId: `${agentId}-r1`, message: {
        content: [{ type: 'tool_use', id: `${agentId}-structured`, name: 'StructuredOutput', input: { winner: 'X' } }],
        usage: { input_tokens: 9222, cache_creation_input_tokens: 7000, cache_read_input_tokens: 9781, output_tokens: 20 },
      } },
    ])
    fs.writeFileSync(path.join(runDir, `agent-${agentId}.meta.json`), JSON.stringify({ agentType }))
  }

  const report = analyzeRun(runDir)
  assert.deepEqual(report.judgeProbe.control.agentTypes, { 'workflow-subagent': 1 })
  assert.deepEqual(report.judgeProbe.typed.agentTypes, { 'worldcup-judge': 1 })
  assert.equal(report.judgeProbe.typed.ordinaryToolCalls, 0)
  assert.equal(report.judgeProbe.typed.structuredOutputCalls, 1)
  assert.equal(report.judgeProbe.typed.firstUncachedInputMedian, 9222)
  assert.equal(report.judgeProbe.typed.promptHashes.length, 0, 'fixture has no user prompt string')
  assert.equal(report.judgeProbe.typed.inputEquivalentAt5xOutput, 26103)
  assert.match(formatReport(report), /Judge agent probe:/)
})

test('parseArgs rejects --state without a value instead of silently falling back', () => {
  assert.throws(() => parseArgs(['some-dir', '--state']), /--state requires a file argument/)
})

test('analyzeRun joins labels by agentId and counts each API request once', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldcup-cost-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runDir = path.join(root, 'subagents', 'workflows', 'wf_test')
  const stateDir = path.join(root, 'workflows')
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(stateDir, { recursive: true })

  const fixtures = [
    ['a1', 'gen:one'],
    ['a2', 'flaw1:one'],
    ['a3', 'seed:one>two'],
    ['a4', 'GROUP:fit:one>two'],
    ['a5', 'QF:integrity:one>two'],
    ['a6', 'FINAL:tiebreak:one'],
    ['a7', 'wc-live:match'],
  ]
  fs.writeFileSync(path.join(stateDir, 'wf_test.json'), JSON.stringify({
    runId: 'wf_test', agentCount: fixtures.length,
    workflowProgress: fixtures.map(([agentId, label]) => ({ type: 'workflow_agent', agentId, label, phaseTitle: 'Test' })),
  }))
  writeJsonLines(path.join(runDir, 'journal.jsonl'), fixtures.flatMap(([agentId], index) => [
    { type: 'started', key: `k${index}`, agentId },
    { type: 'result', key: `k${index}`, agentId },
  ]))

  // a8 has a transcript but no workflowProgress entry: it must land in 'other' and trip the warning.
  for (const [agentId] of [...fixtures, ['a8']]) {
    writeJsonLines(path.join(runDir, `agent-${agentId}.jsonl`), [
      { type: 'user', agentId, message: { role: 'user', content: 'prompt' } },
      // Streaming duplicate for r1: the second record replaces the first; it must not double-count.
      { type: 'assistant', agentId, requestId: `${agentId}-r1`, message: { usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 1 } } },
      { type: 'assistant', agentId, requestId: `${agentId}-r1`, message: { usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 } } },
      { type: 'assistant', agentId, requestId: `${agentId}-r2`, message: { usage: { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 6, output_tokens: 7 } } },
    ])
  }
  // A truncated/empty transcript must be skipped loudly, never abort the report.
  fs.writeFileSync(path.join(runDir, 'agent-zz-truncated.jsonl'), '')

  const report = analyzeRun(runDir)
  assert.equal(report.transcriptAgents, 8)
  assert.equal(report.journalStarted, 7)
  assert.equal(report.journalResults, 7)
  assert.deepEqual(report.unmappedAgents, ['a8'])
  assert.equal(report.unreadableFiles.length, 1)
  assert.match(report.unreadableFiles[0], /agent-zz-truncated\.jsonl/)
  assert.equal(report.total.invocations, 8)
  assert.equal(report.total.requests, 16)
  assert.equal(report.total.input, 48)
  assert.equal(report.total.cacheWrite, 16)
  assert.equal(report.total.cacheRead, 72)
  assert.equal(report.total.output, 88)
  assert.equal(report.byRole.screen.invocations, 1)
  assert.equal(report.byRole['group-lens'].requests, 2)
  assert.equal(report.byRole.tiebreak.output, 11)
  assert.equal(report.byRole.other.invocations, 1)
  // The cache-mode analysis drove a real decision (the lensPrompt reorder was rejected on it),
  // so pin it: firstUsage must be the FIRST request's FINAL (post-replacement) usage. r1's final
  // usage reads 3 / writes 2 across all three judge agents; picking r2 (read 6, write 0) or a
  // pre-replacement record would fail this.
  assert.deepEqual(report.judgeInitialCache, {
    invocations: 3, sampled: 3, requestless: 0,
    cacheReadMode: 3, cacheReadModeCount: 3, cacheWriteMode: 2, cacheWriteModeCount: 3,
  })
  const rendered = formatReport(report)
  assert.match(rendered, /TOTAL\s+8\s+16/)
  assert.match(rendered, /read 3 tokens \(3\/3 calls\); write 2 tokens \(3\/3 calls\)/)
  assert.match(rendered, /WARNING: 1 transcript agent\(s\) had no workflow label/)
  assert.match(rendered, /WARNING: 1 transcript file\(s\) skipped as unreadable/)
})

// Post-mortem paths: a partial/failed/retried run must yield honest numbers, not an abort or a
// misleading zero. One fixture carries all three review findings at once.
test('analyzeRun survives retries, truncated journals, and requestless judges', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldcup-cost-pm-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runDir = path.join(root, 'subagents', 'workflows', 'wf_pm')
  const stateDir = path.join(root, 'workflows')
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(stateDir, { recursive: true })

  // workflowProgress holds only the LATEST attempt per logical agent: a2 is attempt 2 of the
  // logical agent whose attempt 1 was a1 (journal key k1). a4 is a cancelled judge (no requests).
  fs.writeFileSync(path.join(stateDir, 'wf_pm.json'), JSON.stringify({
    runId: 'wf_pm', agentCount: 3,
    workflowProgress: [
      { type: 'workflow_agent', agentId: 'a2', label: 'GROUP:fit:x>y', phaseTitle: 'Groups', attempt: 2 },
      { type: 'workflow_agent', agentId: 'a3', label: 'QF:integrity:x>y', phaseTitle: 'Knockout', attempt: 1 },
      { type: 'workflow_agent', agentId: 'a4', label: 'QF:craft:x>y', phaseTitle: 'Knockout', attempt: 1 },
    ],
  }))
  // Journal: one 'started' row PER attempt (k1 twice), plus a line truncated mid-write.
  fs.writeFileSync(path.join(runDir, 'journal.jsonl'), [
    JSON.stringify({ type: 'started', key: 'v2:k1', agentId: 'a1' }),
    JSON.stringify({ type: 'started', key: 'v2:k1', agentId: 'a2' }),
    JSON.stringify({ type: 'result', key: 'v2:k1', agentId: 'a2' }),
    JSON.stringify({ type: 'started', key: 'v2:k2', agentId: 'a3' }),
    JSON.stringify({ type: 'started', key: 'v2:k3', agentId: 'a4' }),
    '{"type":"resu',
  ].join('\n'))
  const usageRow = (agentId, rid, read, out) => ({ type: 'assistant', agentId, requestId: rid,
    message: { usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: read, output_tokens: out } } })
  // a1: retried attempt with dominant usage AND a truncated trailing line (salvaged, not skipped).
  fs.writeFileSync(path.join(runDir, 'agent-a1.jsonl'),
    `${JSON.stringify(usageRow('a1', 'r1', 9657, 5000))}\n{"type":"assist`)
  writeJsonLines(path.join(runDir, 'agent-a2.jsonl'), [usageRow('a2', 'r2', 9657, 1)])
  writeJsonLines(path.join(runDir, 'agent-a3.jsonl'), [usageRow('a3', 'r3', 5, 1)])
  writeJsonLines(path.join(runDir, 'agent-a4.jsonl'), [{ type: 'user', agentId: 'a4', message: { role: 'user', content: 'p' } }])

  const report = analyzeRun(runDir)
  // F1: attempt 1 inherits the logical agent's label via the journal key — not 'other'.
  assert.deepEqual(report.unmappedAgents, [])
  assert.equal(report.byRole.other.invocations, 0)
  assert.equal(report.byRole['group-lens'].invocations, 2)
  assert.equal(report.byRole['group-lens'].output, 5001)
  // F2: the truncated journal line is tolerated and surfaced, never an abort.
  assert.equal(report.journalBadLines, 1)
  assert.equal(report.journalStarted, 4)
  // Salvage: a1's valid usage row is counted despite its truncated trailing line.
  assert.deepEqual(report.salvagedFiles, ['agent-a1.jsonl'])
  // F3: the requestless judge is excluded from cache samples and denominator, kept in invocations.
  assert.deepEqual(report.judgeInitialCache, {
    invocations: 4, sampled: 3, requestless: 1,
    cacheReadMode: 9657, cacheReadModeCount: 2, cacheWriteMode: 0, cacheWriteModeCount: 3,
  })
  const rendered = formatReport(report)
  assert.match(rendered, /read 9,657 tokens \(2\/3 calls\)/)
  assert.match(rendered, /1 judge invocation\(s\) had no completed request \(excluded from the modes\)/)
  assert.match(rendered, /WARNING: 1 transcript file\(s\) had unparseable line\(s\)/)
  assert.match(rendered, /WARNING: journal\.jsonl had 1 unparseable line\(s\)/)
})

// A parseable non-object row (bare `null` — a writer bug, not truncation) must count as a bad
// line, not crash the report or void the file; and with ZERO sampled judges the report must say
// there is nothing to sample rather than print a fabricated 0-token mode.
test('non-object rows are bad lines; zero sampled judges never fabricate a mode', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldcup-cost-nul-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runDir = path.join(root, 'subagents', 'workflows', 'wf_nul')
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(path.join(root, 'workflows'), { recursive: true })
  fs.writeFileSync(path.join(root, 'workflows', 'wf_nul.json'), JSON.stringify({
    runId: 'wf_nul', agentCount: 1,
    workflowProgress: [{ type: 'workflow_agent', agentId: 'a1', label: 'GROUP:fit:x>y', phaseTitle: 'Groups', attempt: 1 }],
  }))
  fs.writeFileSync(path.join(runDir, 'journal.jsonl'),
    `null\n${JSON.stringify({ type: 'started', key: 'v2:k1', agentId: 'a1' })}\n`)
  fs.writeFileSync(path.join(runDir, 'agent-a1.jsonl'),
    `null\n${JSON.stringify({ type: 'user', agentId: 'a1', message: { role: 'user', content: 'p' } })}\n`)

  const report = analyzeRun(runDir)
  assert.equal(report.journalBadLines, 1)
  assert.equal(report.journalStarted, 1)
  // The null row is a bad line inside a still-usable file: salvaged, not unreadable.
  assert.deepEqual(report.unreadableFiles, [])
  assert.deepEqual(report.salvagedFiles, ['agent-a1.jsonl'])
  // The only judge has no completed request: nothing to sample.
  assert.equal(report.judgeInitialCache.sampled, 0)
  assert.equal(report.judgeInitialCache.requestless, 1)
  const rendered = formatReport(report)
  assert.match(rendered, /no completed judge requests to sample \(1 invocation\(s\) had no completed request\)/)
  assert.doesNotMatch(rendered, /read 0 tokens/)
})
