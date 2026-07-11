#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROLE_ORDER = [
  'gen',
  'screen',
  'seed',
  'group-lens',
  'knockout-lens',
  'tiebreak',
  'beacon',
  'other',
]

function usageZero() {
  return { invocations: 0, requests: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
}

function roleForLabel(label) {
  if (label.startsWith('gen:')) return 'gen'
  if (/^flaw\d*:/.test(label)) return 'screen'
  if (label.startsWith('seed:')) return 'seed'
  // Tiebreak before GROUP:, so the 'tiebreak' row means ALL tiebreak seats — a group-stage
  // tiebreak (reachable only when every group juror errored) must not hide in group-lens.
  if (/^(?:GROUP|R32|R16|QF|SF|FINAL):tiebreak:/.test(label)) return 'tiebreak'
  if (label.startsWith('GROUP:')) return 'group-lens'
  if (/^(?:R32|R16|QF|SF|FINAL):/.test(label)) return 'knockout-lens'
  if (label.startsWith('wc-live:')) return 'beacon'
  // Sections/axes-mode labels: slot generation and the design-pass agents are generation-side
  // cost; the slot judge narrows the field like the seed pre-pass (it uses the seed schema).
  if (label.startsWith('slot:') || label === 'axis-finder' || label === 'predicted-optimum') return 'gen'
  if (label.startsWith('slotjudge:')) return 'seed'
  return 'other'
}

// Tolerant by design: a run killed mid-write (or read while still streaming) leaves a truncated
// trailing line. A post-mortem cost tool must salvage the valid records and WARN, never abort —
// the crashed run is exactly the one whose spend needs accounting.
function parseJsonLines(file) {
  const text = fs.readFileSync(file, 'utf8')
  const rows = []
  const badLines = []
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue
    try {
      // Only object rows are records; a parseable non-object (a bare `null`, number, string —
      // a writer bug, not truncation) would crash `row.type` reads downstream and void the file.
      const value = JSON.parse(line)
      if (value && typeof value === 'object') rows.push(value)
      else badLines.push(index + 1)
    } catch {
      badLines.push(index + 1)
    }
  }
  return { rows, badLines }
}

function discoverStatePath(runDir) {
  const runId = path.basename(runDir)
  const sessionDir = path.resolve(runDir, '..', '..', '..')
  return path.join(sessionDir, 'workflows', `${runId}.json`)
}

function addUsage(target, source) {
  target.requests += 1
  target.input += source.input_tokens || 0
  target.cacheWrite += source.cache_creation_input_tokens || 0
  target.cacheRead += source.cache_read_input_tokens || 0
  target.output += source.output_tokens || 0
}

function analyzeAgentFile(file, progressByAgent) {
  const { rows, badLines } = parseJsonLines(file)
  const agentId = rows.find(row => row.agentId)?.agentId
  if (!agentId) throw new Error(`${file}: no agentId found`)
  const progress = progressByAgent.get(agentId)

  // Claude transcripts can emit several streaming records for one API request. The last
  // record for a requestId carries the final usage, so replace rather than sum duplicates.
  const requests = new Map()
  const requestOrder = []
  for (const row of rows) {
    if (row.type !== 'assistant' || !row.requestId || !row.message?.usage) continue
    if (!requests.has(row.requestId)) requestOrder.push(row.requestId)
    requests.set(row.requestId, row.message.usage)
  }

  const usage = usageZero()
  usage.invocations = 1
  for (const request of requests.values()) addUsage(usage, request)

  const firstUsage = requestOrder.length ? requests.get(requestOrder[0]) : null
  const label = progress?.label || ''
  return {
    agentId,
    label,
    phase: progress?.phaseTitle || '',
    role: roleForLabel(label),
    usage,
    firstUsage,
    badLines: badLines.length,
  }
}

function mode(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] || [0, 0]
}

function analyzeRun(runDir, { statePath = discoverStatePath(runDir) } = {}) {
  if (!fs.statSync(runDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`transcript directory not found: ${runDir}`)
  }
  if (!fs.existsSync(statePath)) {
    throw new Error(`workflow snapshot not found: ${statePath} (pass --state <file> if it moved)`)
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const progressRows = (state.workflowProgress || []).filter(row => row.agentId)
  const progressByAgent = new Map(progressRows.map(row => [row.agentId, row]))

  // Retries: workflowProgress keeps only the LATEST attempt's agentId per logical agent, but the
  // journal writes one 'started' row PER attempt sharing the logical key, and every attempt's
  // transcript stays on disk. Alias each earlier attempt's agentId to the logical agent's
  // progress row, or its (possibly dominant) usage lands in 'other' and escapes cache analysis.
  const journalPath = path.join(runDir, 'journal.jsonl')
  const journalParsed = fs.existsSync(journalPath) ? parseJsonLines(journalPath) : { rows: [], badLines: [] }
  const journal = journalParsed.rows
  const attemptsByKey = new Map()
  for (const row of journal) {
    if (row.type !== 'started' || !row.key || !row.agentId) continue
    if (!attemptsByKey.has(row.key)) attemptsByKey.set(row.key, [])
    attemptsByKey.get(row.key).push(row.agentId)
  }
  // Anchor each group against a SNAPSHOT of the original progress map, so an alias created for
  // one group can never anchor another (order-independent join). If a corrupted journal ever put
  // two in-progress agents in one key group, each keeps its own row (the has() guard) and any
  // orphan member takes the first anchor in journal order — a defensible tiebreak for role-level
  // tables, since same-key siblings share a role by construction.
  const originalProgress = new Set(progressByAgent.keys())
  for (const attemptIds of attemptsByKey.values()) {
    const mapped = attemptIds.find(id => originalProgress.has(id))
    if (!mapped) continue
    const row = progressByAgent.get(mapped)
    for (const id of attemptIds) if (!progressByAgent.has(id)) progressByAgent.set(id, row)
  }

  const agentFiles = fs.readdirSync(runDir)
    .filter(name => /^agent-.*\.jsonl$/.test(name))
    .sort()
    .map(name => path.join(runDir, name))

  // A truncated/empty transcript (a partially crashed run — exactly when a cost post-mortem is
  // wanted) must not abort the whole report; skip it LOUDLY via the WARNING path below. A file
  // with a truncated TRAILING line but valid earlier records is salvaged (usage counted) + warned.
  const agents = []
  const unreadableFiles = []
  const salvagedFiles = []
  for (const file of agentFiles) {
    try {
      const agent = analyzeAgentFile(file, progressByAgent)
      agents.push(agent)
      if (agent.badLines) salvagedFiles.push(path.basename(file))
    } catch (error) { unreadableFiles.push(`${path.basename(file)}: ${error.message}`) }
  }

  const byRole = Object.fromEntries(ROLE_ORDER.map(role => [role, usageZero()]))
  for (const agent of agents) {
    const target = byRole[agent.role]
    for (const key of Object.keys(target)) target[key] += agent.usage[key]
  }

  const journalStarted = journal.filter(row => row.type === 'started').length
  const journalResults = journal.filter(row => row.type === 'result').length
  const unmappedAgents = agents.filter(agent => !agent.label).map(agent => agent.agentId)

  const judgeAgents = agents.filter(agent => ['group-lens', 'knockout-lens', 'tiebreak'].includes(agent.role))
  // A failed/cancelled judge leaves a transcript with no completed request. That is a MISSING
  // sample, not a zero-token one — exclude it from the mode and the denominator (a fabricated
  // zero could become the reported mode), keep it in invocation totals, and report the exclusion.
  const judgesSampled = judgeAgents.filter(agent => agent.firstUsage)
  const firstReads = judgesSampled.map(agent => agent.firstUsage.cache_read_input_tokens || 0)
  const firstWrites = judgesSampled.map(agent => agent.firstUsage.cache_creation_input_tokens || 0)
  const [firstReadMode, firstReadModeCount] = mode(firstReads)
  const [firstWriteMode, firstWriteModeCount] = mode(firstWrites)

  return {
    runId: state.runId || path.basename(runDir),
    workflowName: state.workflowName || '',
    status: state.status || '',
    statePath,
    runDir,
    stateAgentCount: state.agentCount ?? progressRows.length,
    journalStarted,
    journalResults,
    transcriptAgents: agents.length,
    unmappedAgents,
    unreadableFiles,
    salvagedFiles,
    journalBadLines: journalParsed.badLines.length,
    byRole,
    total: Object.values(byRole).reduce((sum, row) => {
      for (const key of Object.keys(sum)) sum[key] += row[key]
      return sum
    }, usageZero()),
    judgeInitialCache: {
      invocations: judgeAgents.length,
      sampled: judgesSampled.length,
      requestless: judgeAgents.length - judgesSampled.length,
      cacheReadMode: firstReadMode,
      cacheReadModeCount: firstReadModeCount,
      cacheWriteMode: firstWriteMode,
      cacheWriteModeCount: firstWriteModeCount,
    },
  }
}

function formatInt(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatReport(report) {
  const lines = [
    `Run cost report: ${report.runId}${report.workflowName ? ` (${report.workflowName})` : ''}`,
    `Agents: ${report.transcriptAgents} transcripts · ${report.journalStarted} started · ${report.journalResults} results · ${report.stateAgentCount} snapshot`,
    '',
  ]
  const headers = ['role', 'agents', 'requests', 'input', 'cache-write', 'cache-read', 'output', 'logical-input', 'read%']
  const data = ROLE_ORDER
    .filter(role => report.byRole[role].invocations)
    .map(role => {
      const row = report.byRole[role]
      const logical = row.input + row.cacheWrite + row.cacheRead
      return [
        role,
        row.invocations,
        row.requests,
        row.input,
        row.cacheWrite,
        row.cacheRead,
        row.output,
        logical,
        logical ? `${(100 * row.cacheRead / logical).toFixed(1)}%` : '0.0%',
      ]
    })
  const total = report.total
  const totalLogical = total.input + total.cacheWrite + total.cacheRead
  data.push([
    'TOTAL', total.invocations, total.requests, total.input, total.cacheWrite,
    total.cacheRead, total.output, totalLogical,
    totalLogical ? `${(100 * total.cacheRead / totalLogical).toFixed(1)}%` : '0.0%',
  ])
  const widths = headers.map((header, i) => Math.max(header.length, ...data.map(row => String(i > 0 && i < 8 ? formatInt(row[i]) : row[i]).length)))
  const lineFor = (row, raw = false) => row.map((value, i) => {
    const shown = !raw && i > 0 && i < 8 ? formatInt(value) : String(value)
    return i === 0 ? shown.padEnd(widths[i]) : shown.padStart(widths[i])
  }).join('  ')
  lines.push(lineFor(headers, true), lineFor(widths.map(width => '-'.repeat(width)), true))
  for (const row of data) lines.push(lineFor(row))

  const cache = report.judgeInitialCache
  // With zero sampled judges there is no observation — never print a fabricated "0 tokens" mode.
  if (cache.sampled === 0) {
    lines.push('', `Judge initial-request cache modes: no completed judge requests to sample${cache.requestless ? ` (${cache.requestless} invocation(s) had no completed request)` : ''}.`)
  } else {
    lines.push(
      '',
      `Judge initial-request cache modes: read ${formatInt(cache.cacheReadMode)} tokens (${cache.cacheReadModeCount}/${cache.sampled} calls); write ${formatInt(cache.cacheWriteMode)} tokens (${cache.cacheWriteModeCount}/${cache.sampled} calls).${cache.requestless ? ` ${cache.requestless} judge invocation(s) had no completed request (excluded from the modes).` : ''}`,
      'Interpretation: a flat read mode across repeated same-lens calls indicates system/tool-prefix caching only; user-prompt prefix reuse should raise cache reads after the first call in a prefix class.',
    )
  }
  if (report.unmappedAgents.length) lines.push(`WARNING: ${report.unmappedAgents.length} transcript agent(s) had no workflow label.`)
  if (report.unreadableFiles.length) lines.push(`WARNING: ${report.unreadableFiles.length} transcript file(s) skipped as unreadable: ${report.unreadableFiles.join('; ')}`)
  if (report.salvagedFiles.length) lines.push(`WARNING: ${report.salvagedFiles.length} transcript file(s) had unparseable line(s) (truncated mid-write?); usage counted from their valid records — a truncated final streaming record can leave that request's usage partial: ${report.salvagedFiles.join('; ')}`)
  if (report.journalBadLines) lines.push(`WARNING: journal.jsonl had ${report.journalBadLines} unparseable line(s) (truncated mid-write?); journal counts use the valid records.`)
  return `${lines.join('\n')}\n`
}

function parseArgs(argv) {
  let runDir = null
  let statePath = null
  let json = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') json = true
    else if (arg === '--state') {
      statePath = argv[++i]
      if (statePath === undefined) throw new Error('--state requires a file argument')
    }
    else if (!runDir) runDir = arg
    else throw new Error(`unexpected argument: ${arg}`)
  }
  if (!runDir) throw new Error('usage: node scripts/run-cost-report.js <transcript-dir> [--state <workflow.json>] [--json]')
  return { runDir: path.resolve(runDir), statePath: statePath && path.resolve(statePath), json }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const report = analyzeRun(args.runDir, args.statePath ? { statePath: args.statePath } : {})
    process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report))
  } catch (error) {
    console.error(error.message || error)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = { analyzeRun, discoverStatePath, formatReport, parseArgs, roleForLabel }
