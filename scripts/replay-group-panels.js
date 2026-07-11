#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  discoverStatePath,
  loadWorkflowArtifacts,
  readTranscript,
  structuredOutputs,
} = require('./workflow-transcript-reader.js')

const SCHEMA = 'worldcup-group-panel-replay/v1'
const POLICY_VERSION = '2026-07-11'
const DRAW = 'DRAW'
const DEFAULT_SEATS = ['substance', 'fit', 'craft']

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function eventsFromState(state) {
  return (state.logs || [])
    .filter(line => typeof line === 'string' && line.startsWith('WCEVENT '))
    .map(line => JSON.parse(line.slice('WCEVENT '.length)))
}

function tallyWinner(votes, a, b) {
  let av = 0
  let bv = 0
  let total = 0
  for (const vote of votes.filter(vote => vote && vote.status === 'valid')) {
    const weight = vote.weight ?? 1
    total += weight
    if (vote.winner === a) av += weight
    else if (vote.winner === b) bv += weight
  }
  if (total === 0) return null
  if (av > total / 2) return a
  if (bv > total / 2) return b
  return DRAW
}

function standings(group, groupIndex, results) {
  const points = new Map(group.map(team => [team.label, 0]))
  const beat = new Map(group.map(team => [team.label, new Set()]))
  const wins = new Map(group.map(team => [team.label, 0]))
  const draws = new Map(group.map(team => [team.label, 0]))
  const losses = new Map(group.map(team => [team.label, 0]))
  for (const result of results.filter(result => result.groupIndex === groupIndex)) {
    if (result.winner === DRAW || result.winner == null) {
      points.set(result.a, points.get(result.a) + 1)
      points.set(result.b, points.get(result.b) + 1)
      draws.set(result.a, draws.get(result.a) + 1)
      draws.set(result.b, draws.get(result.b) + 1)
      continue
    }
    const loser = result.winner === result.a ? result.b : result.a
    points.set(result.winner, points.get(result.winner) + 3)
    wins.set(result.winner, wins.get(result.winner) + 1)
    losses.set(loser, losses.get(loser) + 1)
    beat.get(result.winner).add(loser)
  }
  const ranked = [...group].sort((a, b) =>
    (points.get(b.label) - points.get(a.label)) ||
    (b.seedRating - a.seedRating) ||
    (a.drawOrder - b.drawOrder))
  for (let i = 0; i + 1 < ranked.length; i++) {
    const hi = ranked[i]
    const lo = ranked[i + 1]
    if (points.get(hi.label) !== points.get(lo.label)) continue
    const threeWay = (i > 0 && points.get(ranked[i - 1].label) === points.get(hi.label)) ||
      (i + 2 < ranked.length && points.get(ranked[i + 2].label) === points.get(lo.label))
    if (!threeWay && beat.get(lo.label).has(hi.label)) {
      ranked[i] = lo
      ranked[i + 1] = hi
    }
  }
  return ranked.map(team => ({
    label: team.label,
    pts: points.get(team.label),
    w: wins.get(team.label),
    d: draws.get(team.label),
    l: losses.get(team.label),
  }))
}

function eloRatings(labels, decisions, K = 24, base = 1500) {
  const ratings = new Map(labels.map(label => [label, base]))
  for (let pass = 0; pass < 3; pass++) {
    for (const decision of decisions) {
      const rw = ratings.get(decision.winner)
      const rl = ratings.get(decision.loser)
      const expected = 1 / (1 + Math.pow(10, (rl - rw) / 400))
      ratings.set(decision.winner, rw + K * (1 - expected))
      ratings.set(decision.loser, rl - K * (1 - expected))
    }
  }
  return ratings
}

function transcriptOutputsByLabel(artifacts) {
  const result = new Map()
  const warnings = []
  for (const file of artifacts.agentFiles) {
    try {
      const transcript = readTranscript(file)
      const progress = artifacts.progressByAgent.get(transcript.agentId)
      if (!progress?.label) continue
      const outputs = structuredOutputs(transcript.rows)
      if (!outputs.length) continue
      const candidate = {
        agentId: transcript.agentId,
        current: progress.agentId === transcript.agentId,
        output: outputs.at(-1),
      }
      const prior = result.get(progress.label)
      if (!prior || (!prior.current && candidate.current)) result.set(progress.label, candidate)
      if (transcript.badLines.length) warnings.push(`${path.basename(file)}: ignored ${transcript.badLines.length} invalid line(s)`)
    } catch (error) {
      warnings.push(`${path.basename(file)}: ${error.message}`)
    }
  }
  return { result, warnings }
}

function winnerFromXY(output, a, b, flip, canDraw = false) {
  if (!output || !['X', 'Y', ...(canDraw ? [DRAW] : [])].includes(output.winner)) return null
  if (output.winner === DRAW) return DRAW
  if (output.winner === 'X') return flip ? b : a
  return flip ? a : b
}

function buildVoteBundle(runDir, { statePath = discoverStatePath(runDir) } = {}) {
  const artifacts = loadWorkflowArtifacts(runDir, { statePath })
  const { state } = artifacts
  const events = eventsFromState(state)
  const draw = events.find(event => event.ev === 'draw')
  const gate = events.find(event => event.ev === 'gate')
  const finalGroups = events.filter(event => event.ev === 'groups').at(-1)
  if (!draw || !gate || !finalGroups) throw new Error('run lacks final gate/draw/groups events')
  const { result: outputs, warnings } = transcriptOutputsByLabel(artifacts)

  const entrantCount = draw.groups.reduce((sum, group) => sum + group.teams.length, 0)
  const seedRows = (state.workflowProgress || []).filter(row => typeof row.label === 'string' && row.label.startsWith('seed:'))
  if (seedRows.length < entrantCount / 2) throw new Error(`seed phase incomplete: ${seedRows.length} labels for ${entrantCount} entrants`)
  const poolLabels = seedRows.slice(0, entrantCount / 2).flatMap(row => row.label.slice(5).split('>'))
  if (poolLabels.length !== entrantCount || new Set(poolLabels).size !== entrantCount) {
    throw new Error('cannot reconstruct stable pool order from first seed round')
  }
  const seedDecisions = seedRows.map((row, index) => {
    const [a, b] = row.label.slice(5).split('>')
    const output = outputs.get(row.label)?.output
    const winner = winnerFromXY(output, a, b, index % 2 === 1)
    if (!winner) throw new Error(`missing/invalid seed vote: ${row.label}`)
    return { winner, loser: winner === a ? b : a }
  })
  const ratings = eloRatings(poolLabels, seedDecisions)
  const seeded = [...poolLabels].sort((a, b) => (ratings.get(b) - ratings.get(a)) || (poolLabels.indexOf(a) - poolLabels.indexOf(b)))
  const dq = new Set((gate.disqualified || []).map(entry => entry.label))

  const entrants = []
  draw.groups.forEach((group, groupIndex) => group.teams.forEach((team, withinGroup) => {
    const seedRank = seeded.indexOf(team.label) + 1
    if (seedRank !== team.seed) throw new Error(`seed reconstruction mismatch for ${team.label}: ${seedRank} != ${team.seed}`)
    entrants.push({
      label: team.label,
      poolIndex: poolLabels.indexOf(team.label),
      seedRank,
      seedRating: ratings.get(team.label),
      seededOrder: seedRank - 1,
      drawOrder: entrants.length,
      group: group.group,
      groupIndex,
      withinGroup,
      disqualified: dq.has(team.label),
    })
  }))

  const matches = []
  draw.groups.forEach((group, groupIndex) => {
    for (let ai = 0; ai < group.teams.length; ai++) {
      for (let bi = ai + 1; bi < group.teams.length; bi++) {
        const a = group.teams[ai].label
        const b = group.teams[bi].label
        const ordinal = matches.length
        const aDQ = dq.has(a)
        const bDQ = dq.has(b)
        const walkover = aDQ !== bDQ
        const votes = []
        if (!walkover) {
          DEFAULT_SEATS.forEach((lens, seat) => {
            const label = `GROUP:${lens}:${a}>${b}`
            const output = outputs.get(label)?.output
            const winner = winnerFromXY(output, a, b, (ordinal + seat) % 2 === 1, true)
            votes.push({
              seat,
              lens,
              status: winner ? 'valid' : 'missing',
              winner,
              margin: output?.margin || null,
              weight: 1,
            })
          })
        }
        const officialWinner = walkover ? (aDQ ? b : a) : tallyWinner(votes, a, b)
        matches.push({ ordinal, group: group.group, groupIndex, a, b, walkover, votes, officialWinner })
      }
    }
  })

  const officialStandings = finalGroups.standings.map(group => ({
    group: group.group,
    table: group.table,
    advanced: group.advanced,
  }))
  return {
    schema: SCHEMA,
    policyVersion: POLICY_VERSION,
    panel: { kind: 'default-unit-three', seats: DEFAULT_SEATS, weights: [1, 1, 1], sections: false },
    run: {
      id: state.runId || path.basename(runDir),
      workflowName: state.workflowName || '',
      timestamp: state.timestamp || state.startTime || null,
      stateSha256: sha256(JSON.stringify(state)),
    },
    entrants,
    matches,
    official: {
      standings: officialStandings,
      qualifiers: officialStandings.flatMap(group => group.advanced),
    },
    warnings: [...warnings, ...(artifacts.journalParsed.badLines.length ? [`journal: ignored ${artifacts.journalParsed.badLines.length} invalid line(s)`] : [])],
  }
}

function replayStandings(bundle, results) {
  const groups = bundle.official.standings.map((official, groupIndex) =>
    bundle.entrants.filter(entrant => entrant.groupIndex === groupIndex))
  const tables = groups.map((group, groupIndex) => ({
    group: bundle.official.standings[groupIndex].group,
    table: standings(group, groupIndex, results),
  }))
  return { tables, qualifiers: tables.flatMap(group => group.table.slice(0, 2).map(row => row.label)) }
}

function resultForVotes(match, votes) {
  return {
    groupIndex: match.groupIndex,
    a: match.a,
    b: match.b,
    winner: match.walkover ? match.officialWinner : tallyWinner(votes, match.a, match.b),
  }
}

function compareQualifiers(actual, official) {
  let positionalChanges = 0
  for (let i = 0; i < Math.max(actual.length, official.length); i++) if (actual[i] !== official[i]) positionalChanges++
  const actualSet = new Set(actual)
  return {
    positionalChanges,
    qualifierChanges: official.filter(label => !actualSet.has(label)).length,
  }
}

function majorityLockDecision(firstVotes, a, b) {
  const possibilities = [
    { status: 'valid', winner: a, weight: 1 },
    { status: 'valid', winner: b, weight: 1 },
    { status: 'valid', winner: DRAW, weight: 1 },
    { status: 'missing', winner: null, weight: 1 },
  ]
  const outcomes = new Set(possibilities.map(vote => tallyWinner([...firstVotes, vote], a, b)))
  return outcomes.size === 1 ? { locked: true, winner: [...outcomes][0] } : { locked: false, winner: null }
}

function replayPolicy(bundle, policy) {
  let calls = 0
  let outcomeMismatches = 0
  let incomplete = false
  const results = bundle.matches.map(match => {
    if (match.walkover) return resultForVotes(match, [])
    let votes
    if (policy.kind === 'baseline') {
      votes = match.votes
      calls += match.votes.filter(vote => vote.status === 'valid').length
    } else if (policy.kind === 'fixed-seat') {
      votes = [match.votes[policy.seat]]
      calls += votes[0]?.status === 'valid' ? 1 : 0
      if (!votes[0] || votes[0].status !== 'valid') incomplete = true
    } else if (policy.kind === 'rotating-seat') {
      const vote = match.votes[(match.ordinal + policy.offset) % match.votes.length]
      votes = [vote]
      calls += vote?.status === 'valid' ? 1 : 0
      if (!vote || vote.status !== 'valid') incomplete = true
    } else if (policy.kind === 'margin-trigger') {
      const primary = match.votes[(match.ordinal + policy.offset) % match.votes.length]
      calls += primary?.status === 'valid' ? 1 : 0
      const escalate = !primary || primary.status !== 'valid' || !primary.margin || primary.margin === 'narrow' || primary.winner === DRAW
      votes = escalate ? match.votes : [primary]
      if (escalate) calls += match.votes.filter(vote => vote !== primary && vote.status === 'valid').length
    } else if (policy.kind === 'majority-lock') {
      const heldOut = match.votes[policy.heldOutSeat]
      const first = match.votes.filter((_, seat) => seat !== policy.heldOutSeat)
      calls += first.filter(vote => vote.status === 'valid').length
      const decision = majorityLockDecision(first, match.a, match.b)
      if (decision.locked) {
        votes = first
      } else {
        votes = [...first, heldOut]
        if (heldOut?.status === 'valid') calls++
        else incomplete = true
      }
    } else {
      throw new Error(`unknown replay policy: ${policy.kind}`)
    }
    const result = resultForVotes(match, votes)
    if (result.winner !== match.officialWinner) outcomeMismatches++
    return result
  })
  const replay = replayStandings(bundle, results)
  return {
    ...policy,
    calls,
    callsSaved: bundle.matches.reduce((sum, match) => sum + match.votes.filter(vote => vote.status === 'valid').length, 0) - calls,
    outcomeMismatches,
    incomplete,
    ...compareQualifiers(replay.qualifiers, bundle.official.qualifiers),
    qualifiers: replay.qualifiers,
  }
}

function replayBundle(bundle) {
  if (bundle.schema !== SCHEMA) throw new Error(`unsupported replay schema: ${bundle.schema}`)
  const baseline = replayPolicy(bundle, { kind: 'baseline' })
  const officialTables = bundle.official.standings.map(group => group.table)
  const baselineTables = replayStandings(bundle, bundle.matches.map(match => resultForVotes(match, match.votes))).tables.map(group => group.table)
  const standingsMatch = JSON.stringify(baselineTables) === JSON.stringify(officialTables)
  const qualifiersMatch = JSON.stringify(baseline.qualifiers) === JSON.stringify(bundle.official.qualifiers)
  if (!standingsMatch || !qualifiersMatch) {
    throw new Error(`baseline identity failed: standings=${standingsMatch} qualifiers=${qualifiersMatch}`)
  }
  const supportedPanel = bundle.panel?.kind === 'default-unit-three' &&
    bundle.panel.sections === false &&
    JSON.stringify(bundle.panel.weights) === JSON.stringify([1, 1, 1]) &&
    bundle.matches.every(match => match.walkover || match.votes.length === 3)
  if (!supportedPanel) {
    return {
      schema: SCHEMA,
      policyVersion: POLICY_VERSION,
      baseline: { standingsMatch, qualifiersMatch, calls: baseline.calls },
      counterfactual: { supported: false, reason: 'non-default panel shape, sections mode, or custom weights require the full panel' },
      policies: [],
    }
  }
  const policies = []
  for (let seat = 0; seat < 3; seat++) policies.push(replayPolicy(bundle, { kind: 'fixed-seat', seat }))
  for (let offset = 0; offset < 3; offset++) policies.push(replayPolicy(bundle, { kind: 'rotating-seat', offset }))
  for (let offset = 0; offset < 3; offset++) policies.push(replayPolicy(bundle, { kind: 'margin-trigger', offset }))
  for (let heldOutSeat = 0; heldOutSeat < 3; heldOutSeat++) policies.push(replayPolicy(bundle, { kind: 'majority-lock', heldOutSeat }))
  return {
    schema: SCHEMA,
    policyVersion: POLICY_VERSION,
    baseline: { standingsMatch, qualifiersMatch, calls: baseline.calls },
    counterfactual: { supported: true },
    policies,
  }
}

function parseArgs(argv) {
  let runDir
  let statePath
  let recordPath
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state') statePath = argv[++i]
    else if (argv[i] === '--record') recordPath = argv[++i]
    else if (!runDir) runDir = argv[i]
    else throw new Error(`unexpected argument: ${argv[i]}`)
  }
  if (!runDir) throw new Error('usage: node scripts/replay-group-panels.js <transcript-dir> [--state <workflow.json>] [--record <file>]')
  if (argv.includes('--state') && !statePath) throw new Error('--state requires a file argument')
  if (argv.includes('--record') && !recordPath) throw new Error('--record requires a file argument')
  return { runDir: path.resolve(runDir), statePath: statePath && path.resolve(statePath), recordPath: recordPath && path.resolve(recordPath) }
}

function writeRecordAtomic(file, record) {
  if (fs.existsSync(file)) throw new Error(`refusing to overwrite evidence record: ${file}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
    fs.renameSync(temporary, file)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    const bundle = buildVoteBundle(args.runDir, args.statePath ? { statePath: args.statePath } : {})
    const analysis = replayBundle(bundle)
    const record = { ...bundle, analysis }
    if (args.recordPath) writeRecordAtomic(args.recordPath, record)
    process.stdout.write(`${JSON.stringify(args.recordPath ? { record: args.recordPath, analysis } : record, null, 2)}\n`)
  } catch (error) {
    console.error(error.message || error)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  DRAW,
  SCHEMA,
  buildVoteBundle,
  majorityLockDecision,
  replayBundle,
  replayPolicy,
  standings,
  tallyWinner,
  writeRecordAtomic,
}
