'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const fixturePath = path.join(root, 'canary/judge-canary.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function validateFixture(fixture) {
  assert(fixture && fixture.version === 1, 'canary fixture must have version: 1')
  assert(Array.isArray(fixture.cases), 'canary fixture must have cases[]')
  assert(fixture.cases.length === 6, `canary fixture must define exactly 6 cases, got ${fixture.cases.length}`)
  const ids = new Set()
  for (const c of fixture.cases) {
    assert(c && typeof c.id === 'string' && c.id, 'each canary case needs id')
    assert(!ids.has(c.id), `duplicate canary id: ${c.id}`)
    ids.add(c.id)
    assert(typeof c.goal === 'string' && c.goal, `${c.id}: missing goal`)
    assert(typeof c.setup === 'string' && c.setup, `${c.id}: missing setup`)
    assert(typeof c.expected === 'string' && c.expected, `${c.id}: missing expected`)
    assert(Array.isArray(c.accept) && c.accept.length > 0, `${c.id}: missing accept[]`)
  }
}

function validateResults(fixture, results) {
  assert(Array.isArray(results), 'record must be an array or { results: [] }')
  // Build the index strictly: every result needs an id, duplicate ids are rejected (a Map would silently keep
  // the last), and ids unknown to the fixture are rejected (a stray/typo'd result must not be ignored).
  const byId = new Map()
  for (const r of results) {
    assert(r && typeof r.id === 'string' && r.id, 'each result needs an id')
    assert(!byId.has(r.id), `duplicate result id: ${r.id}`)
    byId.set(r.id, r)
  }
  const known = new Set(fixture.cases.map(c => c.id))
  for (const id of byId.keys()) assert(known.has(id), `unknown result id: ${id}`)
  for (const c of fixture.cases) {
    const r = byId.get(c.id)
    assert(r, `record missing result for ${c.id}`)
    assert(r.pass === true, `${c.id}: pass must be true`)
    assert(typeof r.evidence === 'string' && r.evidence.trim(), `${c.id}: evidence is required`)
    // outcome is REQUIRED and must be in the accept list — without this, a record with no outcome bypassed
    // the entire accept gate as long as pass+evidence were present (the release-gate hole).
    assert(typeof r.outcome === 'string' && r.outcome, `${c.id}: outcome is required`)
    assert(c.accept.includes(r.outcome), `${c.id}: outcome "${r.outcome}" not in accept list [${c.accept.join(', ')}]`)
  }
}

function validateRecord(fixture, recordFile) {
  const rec = readJson(recordFile)
  validateResults(fixture, Array.isArray(rec) ? rec : rec.results)
}

// Default mode also validates every committed record under canary/records/ — the release proof
// ("a release is not tagged until its record validates", canary/README.md) must be machine-enforced
// by `npm run check`/CI, not by someone remembering the --record invocation. Node iteration, not a
// shell glob: CI's matrix includes windows-latest, where npm scripts run under cmd.exe.
// Records are POINT-IN-TIME proofs: when the fixture evolves (ADR 0002's growth rule fires only
// after a release has shipped), historical records cannot honestly satisfy the new contract and
// must not retroactively brick check/CI. Each record's `fixtureVersion` names the fixture it
// attests; the sweep strictly validates matching records and SKIPS (never fails) the rest —
// `--record <file>` stays strict-always for validating a new record by hand.
function validateRecordsDir(fixture) {
  const dir = path.join(root, 'canary/records')
  let files = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() } catch { /* no records dir yet */ }
  const checked = [], skipped = []
  for (const f of files) {
    const rec = readJson(path.join(dir, f))
    const recVersion = (rec && !Array.isArray(rec) && rec.fixtureVersion != null) ? rec.fixtureVersion : fixture.version
    if (recVersion !== fixture.version) { skipped.push(`${f} (fixture v${recVersion})`); continue }
    validateResults(fixture, Array.isArray(rec) ? rec : rec.results)
    checked.push(f)
  }
  return { checked, skipped }
}

function main(argv) {
  const fixture = readJson(fixturePath)
  validateFixture(fixture)

  const recordIdx = argv.indexOf('--record')
  if (recordIdx !== -1) {
    const recordFile = argv[recordIdx + 1]
    assert(recordFile, '--record requires a JSON file')
    validateRecord(fixture, path.resolve(recordFile))
    console.log(`judge canary record ok: ${fixture.cases.length} cases`)
    return
  }

  console.log(`judge canary contract ok: ${fixture.cases.length} cases`)
  for (const c of fixture.cases) console.log(`- ${c.id}: ${c.expected}`)
  const { checked, skipped } = validateRecordsDir(fixture)
  console.log(checked.length
    ? `committed records ok: ${checked.join(', ')}`
    : 'no committed records under canary/records/ for the current fixture version')
  if (skipped.length) console.log(`historical records skipped (older fixture): ${skipped.join(', ')}`)
  console.log('To validate a new release run before committing it, run: node scripts/judge-canary.js --record <file>')
}

module.exports = { validateFixture, validateResults, validateRecord, validateRecordsDir, main }

if (require.main === module) {
  try { main(process.argv.slice(2)) }
  catch (e) { console.error(`judge canary failed: ${e.message}`); process.exit(1) }
}
