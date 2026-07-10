'use strict'

// Fake-judge harness for worldcup/references/workflow-template.js.
//
// The template is a plain-JS ultracode Workflow script whose ONLY outside seams are the
// globals agent/parallel/log/phase/args. This module loads the template source, applies the
// same `export const meta` -> `const meta` swap the syntax checker uses, fills the one hole a
// run needs (DESIGN.flavors, injected as an extra function parameter so the file itself stays
// untouched), and executes the whole tournament against a DETERMINISTIC stub host:
//   - agent()   dispatches on opts.label / schema shape / prompt content and returns canned,
//               schema-valid verdicts for every judge and generator role
//   - parallel() is pluggable, so tests can control agent COMPLETION order and prove the
//               report is (or is not) invariant to it
// No RNG, no clock: the template bans Math.random/Date.now, and every stub here is a pure
// function of its inputs, so a whole run is reproducible byte-for-byte.
//
// Used by tests/workflow-run.test.js and scripts/render-sample-report.js. Zero dependencies.

const fs = require('node:fs')
const path = require('node:path')

const TEMPLATE_PATH = path.join(__dirname, '..', 'worldcup', 'references', 'workflow-template.js')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// ─────────────────────────────────────────────────────── loader
// Compile the template body into a callable async function. Fails loudly if either anchor is
// missing (e.g. a mid-edit template) instead of silently running something else.
function loadTemplate(templatePath = TEMPLATE_PATH) {
  const raw = fs.readFileSync(templatePath, 'utf8')
  const src = raw.replace(/^export const meta/m, 'const meta')
  if (src === raw) throw new Error(`${templatePath}: 'export const meta' anchor not found (template mid-edit?)`)
  // Open the flat-design hole: `flavors: [ ... ]` becomes `flavors: __testFlavors || [ ... ]`,
  // so the caller supplies FIELD flavors through a parameter without editing the file.
  const anchor = 'flavors: ['
  if (!src.includes(anchor)) throw new Error(`${templatePath}: DESIGN 'flavors: [' anchor not found (template mid-edit?)`)
  let patched = src.replace(anchor, 'flavors: __testFlavors || [')
  // Second hole, same idea: field a real BASE as a contestant so a sample/test can showcase the
  // original-as-contestant pattern (the retired reference challenge's replacement). Injecting a
  // base swaps the FILL placeholder for the supplied text AND flips INCLUDE_BASE on; with no base
  // the template default stands (no base fielded), so the expressions are left intact.
  const baseAnchor = 'const BASE = `FILL'
  if (!patched.includes(baseAnchor)) throw new Error(`${templatePath}: BASE anchor not found (template mid-edit?)`)
  patched = patched.replace(baseAnchor, 'const BASE = __testBase != null ? __testBase : `FILL')
  const incBaseAnchor = 'const INCLUDE_BASE = false'
  if (!patched.includes(incBaseAnchor)) throw new Error(`${templatePath}: INCLUDE_BASE anchor not found (template mid-edit?)`)
  patched = patched.replace(incBaseAnchor, 'const INCLUDE_BASE = __testBase != null')
  return new AsyncFunction('agent', 'parallel', 'log', 'phase', 'args', '__testFlavors', '__testBase', patched)
}

// ─────────────────────────────────────────────────────── deterministic judge core
// FNV-1a, the workhorse: hash -> pick. Position-independent (the pair is canonicalized by
// label sort), so a match's outcome does not depend on which side the engine calls X.
function fnv1a(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
function pickWinner(salt, a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return fnv1a(`${salt}|${lo}|${hi}`) % 2 === 0 ? lo : hi
}

// Every generated entry opens with a `Team: <label>` line, which is how judge stubs recover the
// identity of each contestant from inside the untrusted-fenced prompt bodies.
function teamMarkdown(label, n) {
  return [
    `Team: ${label}`,
    `Entry ${n} of the field. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ("${label}").`,
    `Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat (${label}, variant ${n} of the run).`,
  ].join('\n\n')
}
function extractTeams(text) {
  const out = []
  // The marker may be wrapped in a line comment so code-shaped artifacts stay natural:
  // `Team: x` (prose), `// Team: x` (JS), `-- Team: x` (SQL), `# Team: x` (py/shell).
  const re = /^(?:\/\/ |-- |# )?Team: (.*)$/gm
  let m
  while ((m = re.exec(text))) out.push(m[1])
  return out
}
// Identity of ENTRY X / ENTRY Y in a pairwise prompt. An entry without a Team: marker hashes its
// whole segment, which is still deterministic (all sample/test bodies carry a marker, including a
// fielded base — see runTournament's `base`).
function entryIdentities(prompt) {
  const iY = prompt.indexOf('ENTRY Y')
  const segX = iY === -1 ? prompt : prompt.slice(0, iY)
  const segY = iY === -1 ? '' : prompt.slice(iY)
  const idOf = (seg, tag) => { const t = extractTeams(seg); return t.length ? t[t.length - 1] : `${tag}#${fnv1a(seg)}` }
  return [idOf(segX, 'unmarked-X'), idOf(segY, 'unmarked-Y')]
}

// ─────────────────────────────────────────────────────── the fake agent
// Roles, in dispatch order (label prefix first: beacon schemas also carry `winner`/`disqualified`
// properties, so shape checks alone would misroute them):
//   wc-live:*                     live-view beacon      -> echo the event JSON back (discarded)
//   schema has `markdown`         candidate generator   -> numbered lorem entry, label baked in
//   schema has `disqualified`     fabrication screener  -> pass, except the one scripted DQ
//   schema has `winner`+`reason`  panel lens juror      -> hash(lens, labelA, labelB) picks
//   schema has `winner`           pairwise seeding juror-> hash('seed', labelA, labelB) picks
// Anything else throws (and is recorded in `unknown`), so a template change that adds a judge
// role fails the test loudly instead of silently degrading into null votes.
function makeFakeAgent({ labels = [], dqLabel = null, unknown = [], artifactFor = null } = {}) {
  const indexOfLabel = new Map(labels.map((l, i) => [l, i + 1]))
  return function agent(prompt, opts = {}) {
    try {
      const text = String(prompt)
      const label = String(opts.label || '')
      const props = (opts.schema && opts.schema.properties) || {}
      if (label.startsWith('wc-live:')) {
        // Beacon: the template discards the result; echo the event object it asked us to emit.
        return Promise.resolve(JSON.parse(text.slice(text.indexOf('\n') + 1)))
      }
      if (props.markdown) { // generator (GEN_SCHEMA)
        const team = label.startsWith('gen:') ? label.slice('gen:'.length) : label
        const n = indexOfLabel.get(team) || 0
        // artifactFor lets a caller supply real artifact text per team (e.g. the committed code
        // sample); it must embed the Team: marker itself (comment-wrapped forms are recognized).
        const markdown = artifactFor ? artifactFor(team, n) : teamMarkdown(team, n)
        return Promise.resolve({ title: `The "${team}" cut`, oneLineAngle: `"${team}" — one take on the same brief`, markdown })
      }
      if (props.disqualified) { // fabrication-gate screener (FLAW_SCHEMA)
        const team = extractTeams(text)[0]
        if (team != null && team === dqLabel) {
          return Promise.resolve({ disqualified: true, category: 'FABRICATION', flaw: 'scripted DQ: presents invented specifics as real', confidence: 'high', note: '' })
        }
        return Promise.resolve({ disqualified: false, category: 'NONE', flaw: '', confidence: 'high', note: '' })
      }
      if (props.winner) {
        const [x, y] = entryIdentities(text)
        if (props.reason) { // lens juror (LENS_SCHEMA / LENS_DRAW_SCHEMA) — salt by lens so panels can split
          const lens = (text.match(/YOUR LENS: (\S+) /) || [])[1] || 'lens'
          const w = pickWinner(`lens|${lens}`, x, y)
          return Promise.resolve({ winner: w === x ? 'X' : 'Y', margin: 'clear', reason: `deterministic ${lens} verdict for the harness` })
        }
        // pairwise seeding juror (SEED_SCHEMA)
        const w = pickWinner('seed', x, y)
        return Promise.resolve({ winner: w === x ? 'X' : 'Y', confidence: 'lean' })
      }
      throw new Error(`unrecognized agent role (label="${label}")`)
    } catch (e) {
      unknown.push(`${opts && opts.label ? opts.label : '?'}: ${e.message}`)
      return Promise.reject(e)
    }
  }
}

// ─────────────────────────────────────────────────────── parallel implementations
// All three honor the seam contract: barrier, results in input positions, erroring thunks -> null.
// The sequential pair differ ONLY in which thunk COMPLETES first — the lever the determinism
// test pulls.
const parallelAll = thunks => Promise.all(thunks.map(t => t().catch(() => null)))
async function parallelForward(thunks) {
  const out = []
  for (const t of thunks) { try { out.push(await t()) } catch { out.push(null) } }
  return out
}
async function parallelReverse(thunks) {
  const out = new Array(thunks.length)
  for (let i = thunks.length - 1; i >= 0; i--) { try { out[i] = await thunks[i]() } catch { out[i] = null } }
  return out
}

// ─────────────────────────────────────────────────────── one full tournament
// labels: FIELD (=32) team names -> flat DESIGN flavors. dqLabel: the one team the scripted
// fabrication gate kills. parallel: one of the implementations above (default parallelAll).
// base: real BASE text to field as one contestant (must carry its own Team: marker, e.g.
// 'Team: the original' / '// Team: the original'); passing it flips INCLUDE_BASE on so the base
// occupies the first cell (displacing that flavor). null keeps the template default (no base fielded).
async function runTournament({ labels, dqLabel = null, parallel = parallelAll, templatePath = TEMPLATE_PATH, artifactFor = null, base = null } = {}) {
  if (!Array.isArray(labels) || !labels.length) throw new Error('runTournament: labels[] is required')
  const run = loadTemplate(templatePath)
  const flavors = labels.map(name => ({ name, brief: `the "${name}" take on the artifact` }))
  const unknown = []
  const logs = []
  const agent = makeFakeAgent({ labels, dqLabel, unknown, artifactFor })
  const log = m => { logs.push(String(m)) }
  const phase = () => {}
  const result = await run(agent, parallel, log, phase, undefined, flavors, base)
  return { result, unknown, logs }
}

module.exports = {
  TEMPLATE_PATH,
  loadTemplate,
  makeFakeAgent,
  runTournament,
  parallelAll,
  parallelForward,
  parallelReverse,
  teamMarkdown,
  extractTeams,
  pickWinner,
  fnv1a,
}
