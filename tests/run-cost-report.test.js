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
  // Sections/axes-mode labels: generation-side cost lands in gen; the slot judge is seed-like.
  assert.equal(roleForLabel('slot:hook:v2'), 'gen')
  assert.equal(roleForLabel('axis-finder'), 'gen')
  assert.equal(roleForLabel('predicted-optimum'), 'gen')
  assert.equal(roleForLabel('slotjudge:hook:a>b'), 'seed')
  assert.equal(roleForLabel('mystery-agent'), 'other')
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
    invocations: 3, cacheReadMode: 3, cacheReadModeCount: 3, cacheWriteMode: 2, cacheWriteModeCount: 3,
  })
  const rendered = formatReport(report)
  assert.match(rendered, /TOTAL\s+8\s+16/)
  assert.match(rendered, /read 3 tokens \(3\/3 calls\); write 2 tokens \(3\/3 calls\)/)
  assert.match(rendered, /WARNING: 1 transcript agent\(s\) had no workflow label/)
  assert.match(rendered, /WARNING: 1 transcript file\(s\) skipped as unreadable/)
})
