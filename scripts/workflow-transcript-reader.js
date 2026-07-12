#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Diagnostic readers must salvage a run killed mid-write. Parseable object rows are retained;
// partial JSON and non-record JSON are counted so callers can warn without inventing data.
function parseJsonLines(file) {
  const text = fs.readFileSync(file, 'utf8')
  const rows = []
  const badLines = []
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue
    try {
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

function loadWorkflowArtifacts(runDir, { statePath = discoverStatePath(runDir) } = {}) {
  if (!fs.statSync(runDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`transcript directory not found: ${runDir}`)
  }
  if (!fs.existsSync(statePath)) {
    throw new Error(`workflow snapshot not found: ${statePath} (pass --state <file> if it moved)`)
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const progressRows = (state.workflowProgress || []).filter(row => row.agentId)
  const progressByAgent = new Map(progressRows.map(row => [row.agentId, row]))
  const journalPath = path.join(runDir, 'journal.jsonl')
  const journalParsed = fs.existsSync(journalPath) ? parseJsonLines(journalPath) : { rows: [], badLines: [] }

  // workflowProgress retains the latest attempt only. Journal attempts share a logical key, so
  // alias earlier attempt ids to the latest labeled row without allowing aliases to anchor aliases.
  const attemptsByKey = new Map()
  for (const row of journalParsed.rows) {
    if (row.type !== 'started' || !row.key || !row.agentId) continue
    if (!attemptsByKey.has(row.key)) attemptsByKey.set(row.key, [])
    attemptsByKey.get(row.key).push(row.agentId)
  }
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

  return { state, statePath, runDir, progressRows, progressByAgent, journalParsed, agentFiles }
}

function readTranscript(file) {
  const parsed = parseJsonLines(file)
  const agentId = parsed.rows.find(row => row.agentId)?.agentId
  if (!agentId) throw new Error(`${file}: no agentId found`)
  return { ...parsed, agentId }
}

function structuredOutputs(rows) {
  const outputs = []
  for (const row of rows) {
    const content = row.message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type === 'tool_use' && part.name === 'StructuredOutput') outputs.push(part.input)
    }
  }
  return outputs
}

module.exports = {
  discoverStatePath,
  loadWorkflowArtifacts,
  parseJsonLines,
  readTranscript,
  structuredOutputs,
}
