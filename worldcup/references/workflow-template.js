// WORLD CUP — ultracode Workflow template.
// Copy this into a Workflow({ script }) call and fill the four FILL blocks:
//   (1) meta, (2) CONFIG, (3) CRITERIA_BLOCK + INCUMBENT, (4) the contestant source.
// Everything else (seeding, groups, knockout crossings, the judge pipeline, Elo,
// trust report) is done. See references/judging.md and references/brackets.md for
// the why. Workflow scripts are plain JS: no Date.now / Math.random / new Date.

// ─────────────────────────────────────────────────────────────── (1) META
export const meta = {
  name: 'worldcup',
  description: 'FILL: e.g. "Stage 32 essay variants as a World Cup and crown a winner"',
  phases: [
    { title: 'Generate' },   // drop this phase entry if contestants are GIVEN
    { title: 'Seed' },
    { title: 'Groups' },
    { title: 'Knockout' },
  ],
}

// ─────────────────────────────────────────────────────────────── (2) CONFIG
const FIELD = 32                // 32 or 48
const GROUPS = FIELD === 48 ? 12 : 8
const SOURCE = 'generate'      // 'generate' | 'given'
const USE_INCUMBENT = true     // is there a reference original to beat? (enables the reference challenge)
const SCREENERS = 3            // fabrication-gate judges per entry: 1 = MVP, 3 = maximal (DQ needs majority)
const BANS = {                 // FILL: deterministic preflight bans (cheap, run before any agent)
  emDash: true,                // em dash is an auto-DQ for Provi prose
  vocab: ['delve', 'harness', 'unlock', 'realm', 'seamless', 'ultimately', 'furthermore', 'profound', 'tapestry', 'testament'],
}
const LETTERS = 'ABCDEFGHIJKL'.split('')

// ─── DESIGN — how candidates are created (see references/design-pass.md).
// kind:'flat' = the classic FLAVORS list (one nominal axis). kind:'axes' = a factorial
// grid: candidates are points in a coordinate system, the field is a (possibly fractional)
// cross-product of orthogonal axes. ('sections' is reserved -> PLAN_2.)
const DESIGN = {
  kind: 'flat',                 // 'flat' | 'axes'
  // --- kind:'flat' (FILL: FIELD distinct angle seeds) ---
  flavors: [ /* { name, brief }, ... length === FIELD */ ],
  // --- kind:'axes' ---
  mode: 'forced',               // 'forced' (axes given) | 'dynamic' (axis-finder proposes them)
  axes: [ /* { name, values: { valueLabel: 'prompt fragment', ... } }, ...; product reconciled to FIELD */ ],
}

// ──────────────────────────────────────────── (3) CRITERIA + INCUMBENT (FILL)
// The taste spec + hard disqualifiers, pasted into every juror prompt. For Provi
// prose, distill the /provi-voice hard rules here. Be specific; vagueness = no taste.
const CRITERIA_BLOCK = `FILL: the source packet — rubric, fact ledger, disqualifiers.
Example for Provi prose:
- Voice: follow-the-thought, affirmative not question-led, cross-domain without
  signposting, deflating close, varied sentence length, non-native texture is fine.
- FACT LEDGER (what is actually true; everything concrete must trace here): FILL.
- NOT ALLOWED unless in the ledger: invented line numbers, class/file names, stack
  traces, error messages, dates, names, places, quotes, scenes, or any concrete detail
  presented as lived fact. Manufactured specificity is a flaw, not a strength.
- HARD DISQUALIFIERS: any em dash; banned LLM vocab (delve, harness, unlock,
  navigate-metaphorical, realm, seamless, ultimately, furthermore, profound, ...);
  an announced thesis; a swelling uplift closer; AND fabricated specifics presented
  as lived fact. For a personal essay that is a lie and an automatic disqualification.
- TASTE IS EARNEDNESS: concrete detail counts only if source-supported and necessary;
  rhythm only if it clarifies thought; an ending only if it lands without inflating.`

const INCUMBENT = USE_INCUMBENT ? `FILL: the author's true original essay/artifact.` : ''
const INCUMBENT_CLAUSE = USE_INCUMBENT ? `
There is a REFERENCE ORIGINAL (the incumbent the field is trying to beat):
---
${INCUMBENT}
---
An entry deserves to win only if it is genuinely better than this incumbent AND keeps
what makes it honest. Flashier-but-fabricated, or flashier-but-less-honest, loses.` : ''

// ─────────────────────────────────────────────────────── SCHEMAS
const GEN_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['markdown'],
  properties: { title: { type: 'string' }, oneLineAngle: { type: 'string' }, markdown: { type: 'string' } } }
const FLAW_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['disqualified'],
  properties: { disqualified: { type: 'boolean' }, flaw: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] }, note: { type: 'string' } } }
const LENS_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['winner', 'reason'],
  properties: { winner: { type: 'string', enum: ['X', 'Y'] },
    margin: { type: 'string', enum: ['narrow', 'clear', 'decisive'] }, reason: { type: 'string' } } }
const SEED_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['winner'],
  properties: { winner: { type: 'string', enum: ['X', 'Y'] },
    confidence: { type: 'string', enum: ['toss-up', 'lean', 'strong'] } } }

// ─────────────────────────────────────────────────────── LENSES
const LENSES = {
  voice:     'Does this sound like the author actually wrote it, or like a machine performing the author. Flag voice tells, performed vulnerability, imitation over authorship.',
  substance: 'Strip the style. Is there a real claim earned by real reasoning, or vibes and momentum. Does the argument advance and land.',
  taste:     'You are a discerning editor who has read ten thousand of these. Fresh or formulaic. Earned or performed. Would you publish it.',
  integrity: 'Is the concrete detail honest or manufactured. For nonfiction, does it buy vividness with invented fact. Penalize performed authenticity; reward earned, plausibly-true specifics and honest understatement.',
}
const panelFor = stakes => ({
  R32: ['voice', 'substance', 'taste'], R16: ['voice', 'substance', 'taste'],
  QF: ['voice', 'substance', 'taste', 'integrity'],
  SF: ['voice', 'substance', 'taste', 'integrity'],
  FINAL: ['voice', 'substance', 'taste', 'integrity'],
}[stakes] || ['voice', 'substance', 'taste'])

// ─────────────────────────────────────────────────────── PROMPTS
const flawPrompt = e => `You are screening ONE entry for FATAL FLAWS before it competes. Not judging quality; checking for disqualification.

CRITERIA AND HARD DISQUALIFIERS:
${CRITERIA_BLOCK}

Disqualify (name the rule) only if the entry: presents invented specifics as lived fact (suspiciously perfect, load-bearing, almost certainly fabricated to manufacture authenticity — treat manufactured specificity as a flaw, not a strength), OR breaks a hard disqualifier above. Do not disqualify for being merely weak.

ENTRY:
---
${e.markdown}
---
Return JSON { disqualified, flaw, confidence, note }. Default disqualified=false unless you can name the specific rule broken.`

const lensPrompt = (lens, X, Y) => `Two entries compete head to head. Pick the better. No ties — choose and give a margin. You wear ONE lens and judge on it ruthlessly; ignore other axes.

YOUR LENS: ${lens} — ${LENSES[lens]}

CRITERIA (context; judge through your lens):
${CRITERIA_BLOCK}
${INCUMBENT_CLAUSE}

Do NOT reward length, density, or more concrete detail for its own sake. A short honest entry beats a long performed one. Suspiciously perfect specificity is a warning sign.

ENTRY X:
---
${X.markdown}
---
ENTRY Y:
---
${Y.markdown}
---
Return JSON { winner:"X"|"Y", margin, reason (two sentences, the deciding factor through your lens) }.`

const seedPrompt = (X, Y) => `Quick calibrated comparison for seeding. Which entry is stronger overall against the criteria. Choose; no ties.

CRITERIA:
${CRITERIA_BLOCK}

ENTRY X:
---
${X.markdown}
---
ENTRY Y:
---
${Y.markdown}
---
Return JSON { winner:"X"|"Y", confidence }.`

// ─────────────────────────────────────────────────────── JUDGE PIPELINE
// Deterministic preflight: cheap regex gate, runs before any agent.
function preflight(text) {
  const hard = [], soft = []
  if (BANS.emDash && text.includes('—')) hard.push('em dash')
  for (const w of (BANS.vocab || [])) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) soft.push(`banned:${w}`)
  if (/\b(this essay|in this piece|what i want to explore)\b/i.test(text)) soft.push('announced thesis')
  if (/\b(ultimately|in the end|at the end of the day|what it means to be)\b/i.test(text.slice(-600))) soft.push('uplift closer')
  return { hardDQ: hard.length > 0, hard, soft }
}
// Fabrication gate: preflight, then SCREENERS independent judges; DQ needs majority.
// Computed ONCE per entry and cached. The most important call in the system.
async function screenAll(entries, phase) {
  return parallel(entries.map(e => async () => {
    const pf = preflight(e.markdown)
    if (pf.hardDQ) { e.flaw = { disqualified: true, flaw: pf.hard.join(', '), soft: pf.soft, votes: SCREENERS }; return e }
    const screens = (await parallel(Array.from({ length: SCREENERS }, (_, i) => () =>
      agent(flawPrompt(e), { label: `flaw${i + 1}:${e.label}`, phase, schema: FLAW_SCHEMA })))).filter(Boolean)
    const dq = screens.filter(s => s.disqualified).length
    e.flaw = { disqualified: dq > SCREENERS / 2, flaw: (screens.find(s => s.disqualified) || {}).flaw || '', soft: pf.soft, votes: dq }
    return e
  }))
}

// One head-to-head. orderIdx parity flips X/Y to cancel position bias.
async function playMatch(a, b, orderIdx, stakes, phase, decided) {
  // Stage 0 — fatal-flaw veto (uses cached screens)
  const da = a.flaw?.disqualified, db = b.flaw?.disqualified
  if (da && !db) return record(b, a, 'decisive', `opponent DQ'd: ${a.flaw.flaw}`, decided)
  if (db && !da) return record(a, b, 'decisive', `opponent DQ'd: ${b.flaw.flaw}`, decided)

  // Stage 1 — lens panel (order flipped per lens index to debias)
  const lenses = panelFor(stakes)
  const votes = (await parallel(lenses.map((lens, i) => () => {
    const flip = (orderIdx + i) % 2 === 1
    const [X, Y] = flip ? [b, a] : [a, b]
    return agent(lensPrompt(lens, X, Y), { label: `${stakes}:${lens}:${a.label}>${b.label}`, phase, schema: LENS_SCHEMA })
      .then(v => v && ({ lens, winner: v.winner === 'X' ? (flip ? b : a) : (flip ? a : b), margin: v.margin, reason: v.reason }))
  }))).filter(Boolean)

  // Stage 2 — majority. Stage 3 — break/escalate ties.
  let winner = tally(votes, a, b)
  if (!winner) { // even split: seat one more juror (integrity, then taste)
    const extra = await agent(lensPrompt('integrity', a, b), { label: `${stakes}:tiebreak:${a.label}`, phase, schema: LENS_SCHEMA })
    if (extra) votes.push({ lens: 'integrity', winner: extra.winner === 'X' ? a : b, margin: extra.margin, reason: extra.reason })
    winner = tally(votes, a, b) || (a.rating >= b.rating ? a : b)
  }
  const loser = winner.id === a.id ? b : a
  const reason = (votes.find(v => v.winner.id === winner.id) || {}).reason || 'panel majority'
  const margin = marginOf(votes, winner)
  return record(winner, loser, margin, reason, decided)
}
function tally(votes, a, b) {
  let av = 0, bv = 0
  votes.forEach(v => { if (v.winner.id === a.id) av++; else bv++ })
  if (av === bv) return null
  return av > bv ? a : b
}
function marginOf(votes, w) {
  const for_ = votes.filter(v => v.winner.id === w.id).length
  return for_ === votes.length ? 'decisive' : for_ - (votes.length - for_) >= 2 ? 'clear' : 'narrow'
}
function record(winner, loser, margin, reason, decided) {
  decided.push({ winnerId: winner.id, loserId: loser.id })
  return { winner, loser, margin, reason }
}

// ─────────────────────────────────────────────────────── BRACKET HELPERS (see brackets.md)
function snakeGroups(teams, G) { // teams sorted best-first; keeps strongest apart
  return Array.from({ length: G }, (_, g) => [teams[g], teams[2 * G - 1 - g], teams[2 * G + g], teams[4 * G - 1 - g]])
}
function roundRobin(group) {
  const pairs = []
  for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) pairs.push([group[a], group[b]])
  return pairs
}
function standings(group, gi, results) {
  const pts = new Map(group.map(t => [t.id, 0])), beat = new Map(group.map(t => [t.id, new Set()]))
  results.filter(r => r.gi === gi).forEach(r => { pts.set(r.winner.id, pts.get(r.winner.id) + 3); beat.get(r.winner.id).add(r.loser.id) })
  const ranked = [...group].sort((p, q) =>
    (pts.get(q.id) - pts.get(p.id)) || (beat.get(p.id).has(q.id) ? -1 : beat.get(q.id).has(p.id) ? 1 : q.rating - p.rating))
  return { ranked, pts }
}
function nextRoundPairs(winners) { const p = []; for (let i = 0; i < winners.length; i += 2) p.push([winners[i], winners[i + 1]]); return p }
function seedSlotOrder(n) { let s = [1, 2]; while (s.length < n) { const sum = s.length * 2 + 1, x = []; for (const v of s) { x.push(v); x.push(sum - v) } s = x } return s }
function eloRatings(entries, decided, K = 24, base = 1500) {
  const R = new Map(entries.map(e => [e.id, base]))
  for (let pass = 0; pass < 3; pass++) for (const m of decided) {
    const rw = R.get(m.winnerId), rl = R.get(m.loserId), ew = 1 / (1 + Math.pow(10, (rl - rw) / 400))
    R.set(m.winnerId, rw + K * (1 - ew)); R.set(m.loserId, rl - K * (1 - ew))
  }
  return [...R.entries()].sort((a, b) => b[1] - a[1])
}

// ─────────────────────────────────────────────────────── DESIGN COMBINATORICS
// Deterministic (no RNG). Axes here are { name, values: [label, ...] } (value labels only;
// the DESIGN value->fragment map is applied separately when assembling prompts in U3).
// See references/design-pass.md.
function isPow2(n) { return n >= 1 && (n & (n - 1)) === 0 }

function factorizations(n) { // ordered non-decreasing radix tuples, factors >= 2
  const out = []
  const rec = (rem, min, acc) => {
    if (rem === 1) { if (acc.length) out.push(acc.slice()); return }
    for (let f = min; f <= rem; f++) if (rem % f === 0) { acc.push(f); rec(rem / f, f, acc); acc.pop() }
  }
  rec(n, 2, [])
  return out // 32 -> [[2,2,2,2,2],[2,2,2,4],[2,2,8],[2,4,4],[2,16],[4,8],[32]]
}

function crossProduct(axes) { // -> [{ axisName: value, ... }, ...]
  return axes.reduce((cells, ax) => {
    const next = []
    for (const cell of cells) for (const v of ax.values) next.push({ ...cell, [ax.name]: v })
    return next
  }, [{}])
}

// Binary fractional factorial: k binary axes -> 2^p runs. Base = first p axes (full 2^p);
// each generated axis = product of a fixed subset of base-axis signs (deterministic).
function binaryFraction(axes, p) {
  const base = axes.slice(0, p), gen = axes.slice(p)
  const fromSign = (ax, s) => s < 0 ? ax.values[0] : ax.values[1]
  const baseSubset = j => { const idx = base.map((_, i) => i); return (j === 0 || p <= 3) ? idx : idx.filter((_, i) => i !== ((j - 1) % p)) }
  const generators = gen.map((_, j) => baseSubset(j))
  const cells = []
  for (let m = 0; m < (1 << p); m++) {
    const signs = base.map((_, i) => ((m >> i) & 1) ? 1 : -1)
    const coord = {}
    base.forEach((ax, i) => { coord[ax.name] = fromSign(ax, signs[i]) })
    gen.forEach((ax, j) => { const s = generators[j].reduce((acc, bi) => acc * signs[bi], 1); coord[ax.name] = fromSign(ax, s) })
    cells.push(coord)
  }
  return cells
}

// Are main effects estimable from these cells? (orthogonal, non-degenerate contrast columns.)
function mainEffectsEstimable(cells, axes) {
  const cols = []
  for (const ax of axes) for (let li = 1; li < ax.values.length; li++)
    cols.push(cells.map(c => c[ax.name] === ax.values[li] ? 1 : (c[ax.name] === ax.values[0] ? -1 : 0)))
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++)
    if (Math.abs(cols[i].reduce((a, _, t) => a + cols[i][t] * cols[j][t], 0)) > 1e-9) return false
  return cols.length > 0 && cols.every(col => col.some(v => v !== 0))
}

// Reconcile axes (product M) to exactly N cells. estimable is probe-backed (not theory-claimed).
function reconcile(axes, N) {
  const radices = axes.map(a => a.values.length)
  const M = radices.reduce((a, b) => a * b, 1)
  const full = crossProduct(axes)
  if (M === N) return { cells: full, strategy: 'full', estimable: 'all-2way', meta: { M, N } }
  if (M < N) {
    const r = Math.ceil(N / M), cells = []
    for (let k = 0; cells.length < N; k++) for (const c of full) if (cells.length < N) cells.push({ ...c, __rep: k })
    // A balanced replicate (N a multiple of M) stays orthogonal -> all-2way. A partial
    // replicate (N % M !== 0) concentrates extra runs in early coordinate levels, so its
    // estimability must be probed, not assumed.
    const balanced = N % M === 0
    const estimable = balanced ? 'all-2way' : (mainEffectsEstimable(cells, axes) ? 'main-effects' : 'none')
    return { cells, strategy: balanced ? 'replicate' : 'partial-replicate', estimable, meta: { M, N, replicas: r, balanced } }
  }
  let cells, strategy
  if (radices.every(rd => rd === 2) && isPow2(N) && Math.log2(N) < radices.length) {
    cells = binaryFraction(axes, Math.round(Math.log2(N))); strategy = `fractional 2^(${radices.length}-${Math.round(radices.length - Math.log2(N))})`
  } else {
    cells = []; for (let i = 0; i < N; i++) cells.push(full[Math.round(i * M / N) % M]); strategy = 'subsample'
  }
  return { cells, strategy, estimable: mainEffectsEstimable(cells, axes) ? 'main-effects' : 'none', meta: { M, N } }
}

// ─── axis-finder + prompt derivation (U3)
const AXIS_SCHEMA = { type: 'object', additionalProperties: false, required: ['axes'],
  properties: { axes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'values'],
    properties: { name: { type: 'string' },
      values: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['value', 'fragment'],
        properties: { value: { type: 'string' }, fragment: { type: 'string' } } } } } } } } }

const shortVal = s => { s = String(s); return s.length <= 10 ? s : s.slice(0, 10) }

// deriveAxes: forced (axes given) or dynamic (axis-finder agent) -> coord-stamped specs.
async function deriveAxes(design, BASE, SPEC) {
  let rawAxes
  if (design.mode === 'dynamic') {
    const finderPrompt = `Propose orthogonal DESIGN AXES for generating diverse variants of the artifact below.
Each axis is an independent knob with 2 or 3 discrete VALUES; each value is a short prompt FRAGMENT telling the generator how to realize that setting. Axes must be genuinely independent: changing one must not force another. Aim for about ${Math.max(2, Math.round(Math.log2(FIELD)))} axes so the cross-product is near FIELD=${FIELD}. Keep fragments concrete and mutually exclusive within an axis.
WHAT THE ARTIFACT IS / CRITERIA:
${SPEC}
BASE ARTIFACT:
---
${BASE}
---
Return JSON { axes: [ { name, values: [ { value, fragment } ] } ] }.`
    const found = await agent(finderPrompt, { label: 'axis-finder', phase: 'Generate', schema: AXIS_SCHEMA })
    rawAxes = (found && found.axes && found.axes.length)
      ? found.axes.map(a => ({ name: a.name, valuesObj: Object.fromEntries(a.values.map(v => [v.value, v.fragment])) }))
      : [{ name: 'variant', valuesObj: { a: 'one strong take', b: 'a different strong take' } }]
  } else {
    rawAxes = design.axes.map(a => ({ name: a.name, valuesObj: a.values }))
  }
  const seen = new Set()
  rawAxes = rawAxes.filter(a => Object.keys(a.valuesObj || {}).length >= 2 && !seen.has(a.name) && seen.add(a.name))
  const comboAxes = rawAxes.map(a => ({ name: a.name, values: Object.keys(a.valuesObj) }))
  const frag = {}; rawAxes.forEach(a => { frag[a.name] = a.valuesObj })
  const { cells, strategy, estimable, meta } = reconcile(comboAxes, FIELD)
  design.resolved = { axes: comboAxes, frag, strategy, estimable, meta }
  log(`Design: ${comboAxes.length} axes (${comboAxes.map(a => a.values.length).join('x')}=${meta.M}) -> ${strategy} -> ${FIELD} cells; effects estimable: ${estimable}.`)
  const used = new Set()
  return cells.map((coord, i) => {
    const clean = {}; for (const k of Object.keys(coord)) if (k !== '__rep') clean[k] = coord[k]
    let baseLabel = comboAxes.map(a => shortVal(clean[a.name])).join('-'), label = baseLabel, n = 1
    while (used.has(label)) label = `${baseLabel}#${++n}`
    used.add(label)
    const fragments = comboAxes.map(a => `- ${a.name} = ${clean[a.name]}: ${frag[a.name][clean[a.name]]}`).join('\n')
    const prompt = `Produce a VARIANT of the artifact below at this exact design point:
${fragments}
Realize every setting above faithfully. Constraints / criteria:
${SPEC}
BASE ARTIFACT:
---
${BASE}
---
Return JSON { title, oneLineAngle, markdown (the full artifact) }.`
    return { id: i, label, coords: clean, prompt }
  })
}

// ─────────────────────────────────────────────────────── (4) CONTESTANTS (FILL)
// Candidates come from DESIGN (see references/design-pass.md). kind:'flat' is the
// degenerate single-axis design (the old FLAVORS list); kind:'axes' is a factorial grid.
// Every candidate carries `coords` (its point in the design space) for the report + effects.
const decided = []  // every decided head-to-head, for Elo

const BASE = `FILL: the base artifact being varied (essay, brief, spec, design, prompt...).`
const SPEC = CRITERIA_BLOCK
const flatGenPrompt = (name, brief) => `Produce a distinct VARIANT of the artifact below. ANGLE: ${name}: ${brief}.
Realize the angle fully; keep what the brief says must stay true. Constraints / criteria:
${SPEC}
BASE ARTIFACT:
---
${BASE}
---
Return JSON { title, oneLineAngle, markdown (the full artifact) }.`

// deriveCandidates: DESIGN -> [{ id, label, coords, prompt }], length must === FIELD.
async function deriveCandidates(design) {
  if (design.kind === 'flat') {
    return design.flavors.map((f, i) => ({ id: i, label: f.name, coords: { flavor: f.name }, prompt: flatGenPrompt(f.name, f.brief) }))
  }
  if (design.kind === 'axes') {
    return await deriveAxes(design, BASE, SPEC)   // U3
  }
  throw new Error(`DESIGN.kind '${design.kind}' unsupported (sections -> PLAN_2)`)
}

let pool
if (SOURCE === 'generate') {
  const specs = await deriveCandidates(DESIGN)
  if (specs.length !== FIELD) return { error: `design produced ${specs.length} candidates, need FIELD=${FIELD}` }
  phase('Generate')
  log(`Generating ${specs.length} variants (DESIGN.kind=${DESIGN.kind})..`)
  let got = []
  for (let attempt = 0; got.length < specs.length && attempt < 3; attempt++) {
    const todo = specs.filter(s => !got.some(g => g.id === s.id))
    const r = (await parallel(todo.map(s => () =>
      agent(s.prompt, { label: `gen:${s.label}`, phase: 'Generate', schema: GEN_SCHEMA })
        .then(x => x && ({ id: s.id, label: s.label, coords: s.coords, ...x }))))).filter(Boolean)
    got = got.concat(r)
  }
  if (got.length < FIELD) return { error: `generated ${got.length}/${FIELD}; rerun` }
  pool = got.sort((a, b) => a.id - b.id)
} else {
  // GIVEN: args is the array of items. Normalize to { id, label, coords, markdown }.
  pool = (args || []).slice(0, FIELD).map((it, i) => ({
    id: i, label: it.label || `entry-${i + 1}`, coords: { entry: it.label || `entry-${i + 1}` }, markdown: it.markdown || it.text || String(it) }))
  if (pool.length !== FIELD) return { error: `expected ${FIELD} items, got ${pool.length}` }
}

// ─────────────────────────────────────────────────────── SEED (calibrated pairwise)
phase('Seed')
log('Fatal-flaw screening every entry (cached for the whole tournament)..')
await screenAll(pool, 'Seed')
log('Calibrated pairwise seeding pre-pass..')
// Swiss-like two rounds of pairwise comparisons, then Elo for a rating with real spread.
const seedDecided = []
const seedPairs = []
for (let i = 0; i < pool.length; i += 2) if (pool[i + 1]) seedPairs.push([pool[i], pool[i + 1]])           // round 1: adjacent
for (let i = 0; i < pool.length; i++) seedPairs.push([pool[i], pool[(i + Math.floor(pool.length / 2)) % pool.length]]) // round 2: spread
await parallel(seedPairs.map(([X, Y], idx) => () => {
  const flip = idx % 2 === 1, [A, B] = flip ? [Y, X] : [X, Y]
  return agent(seedPrompt(A, B), { label: `seed:${X.label}>${Y.label}`, phase: 'Seed', schema: SEED_SCHEMA })
    .then(v => { if (v) seedDecided.push({ winnerId: v.winner === 'X' ? A.id : B.id, loserId: v.winner === 'X' ? B.id : A.id }) })
}))
const seedRating = new Map(eloRatings(pool, seedDecided))
pool.forEach(t => { t.rating = seedRating.get(t.id) })
const seeded = [...pool].sort((a, b) => b.rating - a.rating)

// ─────────────────────────────────────────────────────── GROUPS
phase('Groups')
const groups = snakeGroups(seeded, GROUPS)
groups.forEach((g, gi) => g.forEach(t => { t.group = LETTERS[gi] }))
log(`${GROUPS} groups drawn. Group stage: ${GROUPS * 6} matches..`)
const groupSpecs = []
groups.forEach((g, gi) => roundRobin(g).forEach(([x, y]) => groupSpecs.push({ gi, x, y })))
const groupResults = await parallel(groupSpecs.map((m, idx) => () =>
  playMatch(m.x, m.y, idx, 'R32', 'Groups', decided).then(r => ({ ...r, gi: m.gi }))))
// NOTE: group matches use a single rotated juror for cost; override panelFor('R32') -> single
// if you want strict 1-vote groups. Default template runs the 3-lens panel; for FIELD=48
// or tight budgets, switch group matches to a single 'taste' juror.

const adv = groups.map((g, gi) => { const s = standings(g, gi, groupResults); return { ...s, gi } })
let qualifiers
if (FIELD === 32) {
  qualifiers = null // 32 uses fixed crossings below, not a seeded R32
} else {
  const winners = adv.map(a => a.ranked[0]), runners = adv.map(a => a.ranked[1])
  const thirds = adv.map(a => a.ranked[2])
  const ptsById = new Map(); adv.forEach(a => a.ranked.forEach(t => ptsById.set(t.id, a.pts.get(t.id))))
  const bestThirds = [...thirds].sort((p, q) => (ptsById.get(q.id) - ptsById.get(p.id)) || (q.rating - p.rating)).slice(0, 8)
  const tier = arr => [...arr].sort((p, q) => (ptsById.get(q.id) - ptsById.get(p.id)) || (q.rating - p.rating))
  qualifiers = [...tier(winners), ...tier(runners), ...tier(bestThirds)] // 32 ranked
}
log('Group stage done.')

// ─────────────────────────────────────────────────────── KNOCKOUT
phase('Knockout')
async function playRound(pairs, stakes) {
  return parallel(pairs.map((p, idx) => () => playMatch(p[0], p[1], idx, stakes, 'Knockout', decided)))
}
let roundPairs, firstStakes
if (FIELD === 32) {
  const W = i => adv[i].ranked[0], R = i => adv[i].ranked[1]
  roundPairs = [[W(0), R(1)], [W(2), R(3)], [W(4), R(5)], [W(6), R(7)],
                [W(1), R(0)], [W(3), R(2)], [W(5), R(4)], [W(7), R(6)]] // authentic R16 crossings
  firstStakes = 'R16'
} else {
  const order = seedSlotOrder(32), slots = order.map(s => qualifiers[s - 1])
  roundPairs = []
  for (let i = 0; i < slots.length; i += 2) roundPairs.push([slots[i], slots[i + 1]])
  for (let i = 0; i < roundPairs.length - 1; i++) // same-group repair
    if (roundPairs[i][0].group === roundPairs[i][1].group) { const t = roundPairs[i][1]; roundPairs[i][1] = roundPairs[i + 1][1]; roundPairs[i + 1][1] = t }
  firstStakes = 'R32'
}

const order = ['R32', 'R16', 'QF', 'SF', 'FINAL']
let stakes = firstStakes, pairs = roundPairs, lastRound, history = {}
while (pairs.length >= 1) {
  log(`${stakes}: ${pairs.length} match(es)..`)
  const res = await playRound(pairs, stakes)
  history[stakes] = res
  lastRound = res
  if (pairs.length === 1) break
  pairs = nextRoundPairs(res.map(r => r.winner))
  stakes = order[order.indexOf(stakes) + 1]
}
const champion = lastRound[0].winner

// ─────────────────────────────────────────────────────── REFERENCE CHALLENGE
// The champion must beat the author's true original head-to-head, or the output is
// "keep the original". A tournament confirming the field never improved is a real result.
let referenceChallenge = null
if (USE_INCUMBENT && INCUMBENT) {
  const original = { id: -1, label: 'ORIGINAL(incumbent)', markdown: INCUMBENT, rating: 1500, group: '-', flaw: { disqualified: false } }
  const rc = await playMatch(champion, original, 0, 'FINAL', 'Knockout', []) // throwaway decided: keep the original out of global Elo
  referenceChallenge = { championBeatOriginal: rc.winner.id === champion.id, margin: rc.margin, reason: rc.reason }
  log(`Reference challenge: champion ${rc.winner.id === champion.id ? 'BEAT' : 'did NOT beat'} the original (${rc.margin}).`)
}

// ─────────────────────────────────────────────────────── TRUST REPORT
const globalRating = eloRatings(pool, decided)
const ratingLeaderId = globalRating[0][0]
const championIsLeader = champion.id === ratingLeaderId
const beaten = decided.filter(m => m.winnerId === champion.id).map(m => m.loserId)
const ratingOf = new Map(globalRating)
const avgBeatenRating = beaten.length ? Math.round(beaten.reduce((s, id) => s + ratingOf.get(id), 0) / beaten.length) : 0

log(`Champion: ${champion.label}. Rating leader: ${pool.find(t => t.id === ratingLeaderId).label}.`)

const trustVerdict = championIsLeader
  ? 'robust: bracket champion is also the rating leader'
  : 'bracket variance: champion is not the rating leader, consider a top-4 round-robin runoff'
const recommendation = (USE_INCUMBENT && referenceChallenge && !referenceChallenge.championBeatOriginal)
  ? 'KEEP THE ORIGINAL: the field did not clearly beat the incumbent'
  : championIsLeader ? 'ADOPT THE CHAMPION: bracket winner is also the rating leader'
  : 'ADOPT ONLY AFTER A TOP-4 RUNOFF: bracket variance, champion is not the rating leader'

// ─────────────────────────────────────────────────────── EFFECTS (factorial analysis)
const PLAYOFF = false  // CONFIG: generate the predicted optimum and play it vs champion + incumbent
// Deterministic post-hoc effects from coords + Elo. Null for kind:'flat' (one nominal axis).
function computeEffects(pool, globalRating, resolved) {
  if (!resolved || !resolved.axes || !resolved.axes.length) return null
  const ratingById = new Map(globalRating)
  const ratingOf = t => ratingById.get(t.id) || 0
  const axes = resolved.axes
  const mainEffects = axes.map(ax => {
    const byValue = ax.values.map(v => {
      const members = pool.filter(t => t.coords && t.coords[ax.name] === v)
      const mean = members.length ? members.reduce((s, t) => s + ratingOf(t), 0) / members.length : null
      return { value: v, mean: mean == null ? null : Math.round(mean), n: members.length }
    })
    const means = byValue.filter(b => b.mean != null).map(b => b.mean)
    const spread = means.length ? Math.max(...means) - Math.min(...means) : 0
    const best = byValue.filter(b => b.mean != null).sort((a, b) => b.mean - a.mean)[0]
    return { axis: ax.name, byValue, spread, best: best ? best.value : null }
  }).sort((a, b) => b.spread - a.spread)
  const interactions = []
  for (let i = 0; i < axes.length; i++) for (let j = i + 1; j < axes.length; j++) {
    const A = axes[i], B = axes[j]
    if (A.values.length !== 2 || B.values.length !== 2) continue
    const cm = (av, bv) => { const m = pool.filter(t => t.coords && t.coords[A.name] === av && t.coords[B.name] === bv); return m.length ? m.reduce((s, t) => s + ratingOf(t), 0) / m.length : null }
    const m00 = cm(A.values[0], B.values[0]), m01 = cm(A.values[0], B.values[1]), m10 = cm(A.values[1], B.values[0]), m11 = cm(A.values[1], B.values[1])
    if ([m00, m01, m10, m11].some(x => x == null)) continue
    interactions.push({ axes: [A.name, B.name], strength: Math.round(Math.abs((m11 - m10) - (m01 - m00)) / 2) })
  }
  interactions.sort((a, b) => b.strength - a.strength)
  const optimum = {}; mainEffects.forEach(me => { if (me.best) optimum[me.axis] = me.best })
  const inField = pool.find(t => axes.every(ax => t.coords[ax.name] === optimum[ax.name]))
  return { estimable: resolved.estimable, strategy: resolved.strategy, mainEffects, interactions: interactions.slice(0, 6),
    predictedOptimum: { coords: optimum, inField: !!inField, label: inField ? inField.label : axes.map(ax => shortVal(optimum[ax.name])).join('-') } }
}
const effects = computeEffects(pool, globalRating, DESIGN.resolved)
if (effects) log(`Effects: top axis "${effects.mainEffects[0].axis}" (spread ${effects.mainEffects[0].spread}); predicted optimum ${effects.predictedOptimum.label}${effects.predictedOptimum.inField ? ' (in field)' : ' (synthesized)'}.`)

let playoff = null
if (PLAYOFF && effects && !effects.predictedOptimum.inField && DESIGN.resolved && DESIGN.resolved.frag && INCUMBENT) {
  const opt = effects.predictedOptimum.coords
  const fragments = DESIGN.resolved.axes.map(a => `- ${a.name} = ${opt[a.name]}: ${DESIGN.resolved.frag[a.name][opt[a.name]]}`).join('\n')
  const optPrompt = `Produce a VARIANT of the artifact below at this exact design point:\n${fragments}\nRealize every setting. Constraints / criteria:\n${SPEC}\nBASE ARTIFACT:\n---\n${BASE}\n---\nReturn JSON { title, oneLineAngle, markdown }.`
  const og = await agent(optPrompt, { label: 'predicted-optimum', phase: 'Knockout', schema: GEN_SCHEMA })
  if (og) {
    const optEntry = { id: -2, label: 'PREDICTED-OPTIMUM', coords: opt, markdown: og.markdown, rating: 1500, group: '-', flaw: { disqualified: false } }
    const incumbentEntry = { id: -1, label: 'ORIGINAL', markdown: INCUMBENT, rating: 1500, group: '-', flaw: { disqualified: false } }
    const m1 = await playMatch(optEntry, champion, 0, 'FINAL', 'Knockout', [])
    const m2 = await playMatch(optEntry, incumbentEntry, 1, 'FINAL', 'Knockout', [])
    playoff = { beatChampion: m1.winner.id === optEntry.id, beatOriginal: m2.winner.id === optEntry.id, markdown: og.markdown }
    log(`Playoff: predicted optimum ${playoff.beatChampion ? 'beat' : 'lost to'} champion; ${playoff.beatOriginal ? 'beat' : 'lost to'} original.`)
  }
}

function pathOf(champ) {
  const steps = []
  groupResults.filter(r => r.winner.id === champ.id).forEach(r => steps.push({ round: 'Group', beat: r.loser.label, margin: r.margin, reason: r.reason }))
  for (const k of order) (history[k] || []).filter(r => r.winner.id === champ.id).forEach(r => steps.push({ round: k, beat: r.loser.label, margin: r.margin, reason: r.reason }))
  return steps
}

// ─────────────────────────────────────────────────────── HTML REPORT (the deliverable)
// Self-contained World Cup-flavored HTML of the final state graph: bracket tree, group
// tables, champion path, global rating, trust verdict, DQs. Returned as `reportHtml`;
// the main loop writes it to disk and opens it. No external deps, inline CSS.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function renderReport() {
  const ratingOf2 = new Map(globalRating)
  const champLabel = esc(champion.label)
  const playedRounds = order.filter(k => history[k] && history[k].length)
  const koCols = playedRounds.map(k => {
    const ms = history[k].map(m => `<div class="match"><div class="team win">${esc(m.winner.label)}</div><div class="team lose">${esc(m.loser.label)}</div><div class="mrg">${esc(m.margin || '')}</div></div>`).join('')
    return `<div class="kocol"><div class="rndname">${esc(k)}</div>${ms}</div>`
  }).join('')
  const groupCards = groups.map((g, gi) => {
    const a = adv[gi]
    const rows = a.ranked.map((t, i) => `<tr class="${i < 2 ? 'adv' : ''}"><td>${esc(t.label)}</td><td class="pts">${a.pts.get(t.id)}</td></tr>`).join('')
    return `<div class="grp"><h4>Group ${LETTERS[gi]}</h4><table>${rows}</table></div>`
  }).join('')
  const pathRows = pathOf(champion).map(s => `<li><b>${esc(s.round)}</b> beat ${esc(s.beat)} <span class="mrg">(${esc(s.margin || '')})</span><div class="why">${esc(s.reason || '')}</div></li>`).join('')
  const ratingRows = globalRating.slice(0, 16).map(([id, r], i) => { const t = pool.find(x => x.id === id); return `<tr><td>${i + 1}</td><td>${esc(t ? t.label : id)}</td><td>${Math.round(r)}</td></tr>` }).join('')
  const dq = pool.filter(t => t.flaw && t.flaw.disqualified)
  const dqHtml = dq.length ? `<div class="card"><h3>Disqualified (${dq.length})</h3><ul>${dq.map(t => `<li>${esc(t.label)}: ${esc(t.flaw.flaw)}</li>`).join('')}</ul></div>` : ''
  const refTxt = referenceChallenge ? (referenceChallenge.championBeatOriginal ? `champion beat the original (${esc(referenceChallenge.margin)})` : 'champion did NOT beat the original') : 'no incumbent'
  return `<!doctype html><html><head><meta charset="utf-8"><title>World Cup: ${champLabel}</title><style>
:root{--pitch:#0b6e3b;--pitch2:#0a5e33;--gold:#f4c430;--ink:#10241a;--paper:#f7f4ec}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:var(--paper);color:var(--ink)}
header{background:linear-gradient(135deg,var(--pitch),var(--pitch2));color:#fff;padding:30px 28px;border-bottom:5px solid var(--gold)}
header h1{margin:0;font-size:22px;letter-spacing:1px}.champ{font-size:30px;font-weight:800;color:var(--gold);margin:8px 0}
.rec{display:inline-block;background:var(--gold);color:var(--ink);font-weight:700;padding:5px 12px;border-radius:20px;margin-top:6px}
.wrap{max-width:1180px;margin:0 auto;padding:22px}
.card{background:#fff;border:1px solid #dcd6c8;border-radius:10px;padding:16px 18px;margin:18px 0;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h3{margin:.2em 0 .6em;color:var(--pitch)}
.groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.grp{background:#fff;border:1px solid #dcd6c8;border-radius:8px;padding:8px 10px}.grp h4{margin:0 0 6px;color:var(--pitch)}
.grp table{width:100%;border-collapse:collapse;font-size:13px}.grp td{padding:2px 4px;border-bottom:1px dotted #e3ddcf}
.grp td.pts{text-align:right;font-weight:700}.grp tr.adv td{background:rgba(244,196,48,.20)}
.bracket{display:flex;gap:18px;overflow-x:auto;padding-bottom:8px}
.kocol{min-width:148px;display:flex;flex-direction:column;justify-content:space-around;gap:10px}
.rndname{font-weight:700;color:var(--pitch);text-align:center;margin-bottom:4px;text-transform:uppercase;font-size:11px;letter-spacing:1px}
.match{border:1px solid #dcd6c8;border-radius:6px;overflow:hidden;font-size:12px;background:#fff}
.team{padding:4px 8px}.team.win{font-weight:800;background:rgba(11,110,59,.10)}.team.lose{color:#9a958a;border-top:1px solid #eee}
.mrg{font-size:10px;color:#b0a890;padding:0 8px 3px}
table.rank{width:100%;border-collapse:collapse}table.rank td{padding:4px 8px;border-bottom:1px solid #eee}
ul.path{list-style:none;padding:0}ul.path li{padding:6px 0;border-bottom:1px solid #eee}.why{color:#667;font-size:12px}.trust{font-weight:700}
</style></head><body>
<header><h1>&#127942; WORLD CUP &mdash; FINAL STATE</h1><div class="champ">${champLabel}</div>
<div>seed #${seeded.findIndex(t => t.id === champion.id) + 1} &middot; rating ${Math.round(ratingOf2.get(champion.id) || 0)} &middot; reference: ${refTxt}</div>
<div class="rec">${esc(recommendation)}</div></header>
<div class="wrap">
<div class="card"><h3>Trust</h3><div class="trust">${esc(trustVerdict)}</div><div>rating leader: ${esc(pool.find(t => t.id === ratingLeaderId).label)} &middot; avg rating of opponents the champion beat: ${avgBeatenRating}</div></div>
<div class="card"><h3>Knockout</h3><div class="bracket">${koCols}<div class="kocol"><div class="rndname">Champion</div><div class="match"><div class="team win">${champLabel} &#127942;</div></div></div></div></div>
<div class="card"><h3>Group stage</h3><div class="groups">${groupCards}</div></div>
<div class="card"><h3>Champion's path</h3><ul class="path">${pathRows}</ul></div>
<div class="card"><h3>Global rating (Bradley-Terry / Elo)</h3><table class="rank"><tr><td>#</td><td>entry</td><td>rating</td></tr>${ratingRows}</table></div>
${dqHtml}
</div></body></html>`
}

// Centered mirror bracket (FIFA-style), clickable entries with info sheets. Generic over
// field size: works for 32 (R16 start) and 48 (R32 start) by splitting each round in half.
function renderReportV2() {
  const ratingById = new Map(globalRating)
  const mlog = {}
  const addLog = (round, w, l, margin, reason) => {
    ;(mlog[w] = mlog[w] || []).push({ round, opp: l, won: true, margin, reason })
    ;(mlog[l] = mlog[l] || []).push({ round, opp: w, won: false, margin, reason })
  }
  groupResults.forEach(m => addLog('Group', m.winner.label, m.loser.label, m.margin, m.reason))
  for (const k of order) (history[k] || []).forEach(m => addLog(k, m.winner.label, m.loser.label, m.margin, m.reason))
  if (referenceChallenge) addLog('Reference', referenceChallenge.championBeatOriginal ? champion.label : 'ORIGINAL', referenceChallenge.championBeatOriginal ? 'ORIGINAL' : champion.label, referenceChallenge.margin, referenceChallenge.reason)
  const DATA = {}
  pool.forEach(t => { DATA[t.label] = { title: t.title || '', angle: t.oneLineAngle || '', coords: t.coords || {}, seed: seeded.findIndex(x => x.id === t.id) + 1, rating: Math.round(ratingById.get(t.id) || 0), dq: !!(t.flaw && t.flaw.disqualified), flaw: t.flaw ? (t.flaw.flaw || '') : '', matches: mlog[t.label] || [], text: t.markdown || '' } })
  const dataJson = JSON.stringify(DATA).replace(/</g, '\\u003c').replace(/|/g, '')
  const entry = label => `<span class="entry" data-k="${esc(label)}">${esc(label)}</span>`
  const card = m => m ? `<div class="match"><div class="slot win">${entry(m.winner.label)}<span class="mg">${esc(m.margin || '')}</span></div><div class="slot lose">${entry(m.loser.label)}</div></div>` : `<div class="match empty"></div>`
  const playedRounds = order.filter(k => history[k] && history[k].length)
  const finalKey = playedRounds[playedRounds.length - 1]
  const preRounds = playedRounds.slice(0, -1)
  const colOf = matches => { let s = ''; for (let i = 0; i < matches.length; i += 2) s += (i + 1 < matches.length) ? `<div class="pair">${card(matches[i])}${card(matches[i + 1])}</div>` : `<div class="pair single">${card(matches[i])}</div>`; return `<div class="round">${s}</div>` }
  const leftCols = preRounds.map(k => colOf(history[k].slice(0, Math.ceil(history[k].length / 2)))).join('')
  const rightCols = preRounds.slice().reverse().map(k => colOf(history[k].slice(Math.ceil(history[k].length / 2)))).join('')
  const finalM = history[finalKey] && history[finalKey][0]
  const finalLine = finalM ? `${esc(finalM.winner.label)} def. ${esc(finalM.loser.label)} (${esc(finalM.margin)})` : ''
  const groupCards = groups.map((g, gi) => { const a = adv[gi]; const rows = a.ranked.map((t, i) => `<tr class="${i < 2 ? 'adv' : ''}"><td>${entry(t.label)}</td><td class="pts">${a.pts.get(t.id)}</td></tr>`).join(''); return `<div class="grp"><h4>Group ${LETTERS[gi]}</h4><table>${rows}</table></div>` }).join('')
  const ratingRows = globalRating.map(([id, r], i) => { const t = pool.find(x => x.id === id); return `<tr><td>${i + 1}</td><td>${entry(t ? t.label : String(id))}</td><td>${Math.round(r)}</td></tr>` }).join('')
  const dq = pool.filter(t => t.flaw && t.flaw.disqualified)
  const dqHtml = dq.length ? `<div class="panel"><h3>Disqualified at the gate (${dq.length})</h3><ul>${dq.map(t => `<li>${entry(t.label)}: ${esc(t.flaw.flaw)}</li>`).join('')}</ul></div>` : `<div class="panel"><h3>Fabrication gate</h3><div class="muted">0 disqualified.</div></div>`
  const refTxt = referenceChallenge ? (referenceChallenge.championBeatOriginal ? `champion beat the original (${esc(referenceChallenge.margin)})` : 'champion did NOT beat the original') : 'no incumbent'
  // ─── coordinate view (axes only): parallel coordinates + axis effects + a 2-axis explorer
  const cv_axes = (DESIGN.kind === 'axes' && DESIGN.resolved && DESIGN.resolved.axes && effects) ? DESIGN.resolved.axes : null
  let coordPanel = '', coordScript = ''
  if (cv_axes) {
    const W = 760, H = 240, padX = 64, padY = 34
    const axX = i => padX + (cv_axes.length <= 1 ? 0 : i * (W - 2 * padX) / (cv_axes.length - 1))
    const valY = (ax, v) => { const n = ax.values.length, idx = Math.max(0, ax.values.indexOf(v)); return n <= 1 ? H / 2 : padY + idx * (H - 2 * padY) / (n - 1) }
    const ratingByIdC = new Map(globalRating)
    const axisSvg = cv_axes.map((ax, i) => {
      const x = axX(i)
      const ticks = ax.values.map(v => `<text x="${x}" y="${valY(ax, v) + 4}" text-anchor="middle" font-size="10" fill="#cdb9c8">${esc(v)}</text>`).join('')
      return `<line x1="${x}" y1="${padY}" x2="${x}" y2="${H - padY}" stroke="rgba(245,197,66,.3)"/><text x="${x}" y="18" text-anchor="middle" font-size="11" fill="#f5c542" font-weight="700">${esc(ax.name)}</text>${ticks}`
    }).join('')
    const poly = (coords, cls) => `<polyline points="${cv_axes.map((ax, i) => `${axX(i)},${valY(ax, coords[ax.name])}`).join(' ')}" fill="none" class="${cls}"/>`
    const lines = pool.filter(t => t.id !== champion.id).map(t => poly(t.coords, 'pc')).join('')
    const optLine = effects.predictedOptimum.inField ? '' : poly(effects.predictedOptimum.coords, 'pc opt')
    const pcSvg = `<svg viewBox="0 0 ${W} ${H}" class="pc-svg" preserveAspectRatio="xMidYMid meet">${axisSvg}${lines}${optLine}${poly(champion.coords, 'pc champ')}</svg>`
    const effRows = effects.mainEffects.map(me => {
      const vals = me.byValue.filter(b => b.mean != null), mx = Math.max(...vals.map(v => v.mean)), mn = Math.min(...vals.map(v => v.mean)), rng = Math.max(1, mx - mn)
      const bars = me.byValue.map(b => b.mean == null ? '' : `<div class="ebar"><span class="ev ${b.value === me.best ? 'best' : ''}">${esc(b.value)}</span><span class="etrack"><span class="efill" style="width:${Math.round(15 + 85 * (b.mean - mn) / rng)}%"></span></span><span class="enum">${b.mean}</span></div>`).join('')
      return `<div class="erow"><div class="eax">${esc(me.axis)} <span class="muted">spread ${me.spread}</span></div>${bars}</div>`
    }).join('')
    const interTxt = effects.interactions.length ? effects.interactions.slice(0, 4).map(x => `${esc(x.axes.join('&times;'))} ${x.strength}`).join(' &middot; ') : 'none notable'
    const estLabel = effects.estimable === 'none' ? '<span class="warn">empirical, not fitted</span>' : `fitted (${esc(effects.estimable)})`
    const opt = effects.predictedOptimum, optTxt = `${esc(opt.label)} ${opt.inField ? '(in field)' : '(synthesized)'}`
    const axSel = id => `<select id="${id}" onchange="grid()">${cv_axes.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join('')}</select>`
    coordPanel = `<div class="panel coord"><h3>Coordinate space &middot; ${esc(effects.strategy)} &middot; effects ${estLabel}</h3>
<div class="pc-wrap">${pcSvg}</div><div class="pc-key"><span class="champ">champion</span>${optLine ? '<span class="opt">predicted optimum</span>' : ''}</div>
<div class="eff">${effRows}<div class="erow"><div class="eax">predicted optimum</div><div class="muted">${optTxt} &middot; top interactions: ${interTxt}</div></div></div>
<div class="explorer"><div class="exsel">explore two axes &mdash; X ${axSel('gx')} Y ${axSel('gy')}</div><div id="grid"></div></div></div>`
    const J = o => JSON.stringify(o).replace(/</g, '\\u003c')
    coordScript = `
var AXES=${J(cv_axes.map(a => ({ name: a.name, values: a.values })))};
var PTS=${J(pool.map(t => ({ label: t.label, coords: t.coords, rating: Math.round(ratingByIdC.get(t.id) || 0), champ: t.id === champion.id })))};
function grid(){var gx=+document.getElementById('gx').value,gy=+document.getElementById('gy').value;if(gx===gy){gy=(gy+1)%AXES.length;document.getElementById('gy').value=gy;}var ax=AXES[gx],ay=AXES[gy],cells={};PTS.forEach(function(p){var k=p.coords[ax.name]+'|'+p.coords[ay.name];(cells[k]=cells[k]||[]).push(p);});var h='<table class="gridtab"><tr><td></td>'+ay.values.map(function(v){return '<th>'+he(v)+'</th>';}).join('')+'</tr>';ax.values.forEach(function(xv){h+='<tr><th>'+he(xv)+'</th>';ay.values.forEach(function(yv){var arr=cells[xv+'|'+yv]||[];var avg=arr.length?Math.round(arr.reduce(function(s,p){return s+p.rating;},0)/arr.length):0;var sh=arr.length?Math.max(0,Math.min(1,(avg-1450)/200)):0;h+='<td style="background:rgba(245,197,66,'+(0.04+0.5*sh).toFixed(2)+')">'+arr.map(function(p){return '<span class="entry'+(p.champ?' gold':'')+'" data-k="'+he(p.label)+'">'+he(p.label)+'</span>';}).join(' ')+(arr.length?'<div class="cavg">'+avg+'</div>':'')+'</td>';});h+='</tr>';});h+='</table>';document.getElementById('grid').innerHTML=h;}
if(document.getElementById('gy')){document.getElementById('gy').value=Math.min(1,AXES.length-1);grid();}`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>World Cup: ${esc(champion.label)}</title><style>
:root{--bg1:#2b0a26;--bg2:#4a1140;--bg3:#5e1650;--gold:#f5c542;--line:rgba(245,197,66,.45);--card:rgba(255,255,255,.06);--cardbd:rgba(255,255,255,.14);--txt:#f3e9f0}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--txt);background:radial-gradient(120% 80% at 50% 0%,var(--bg3),var(--bg2) 45%,var(--bg1));min-height:100vh}
header{text-align:center;padding:26px 20px 6px}
header .fifa{font-size:11px;letter-spacing:3px;color:var(--gold);font-weight:700;text-transform:uppercase}
header h1{margin:6px 0 2px;font-size:20px;letter-spacing:1px;font-weight:800}
header .sub{color:#d9c4d4;font-size:12px}
.recpill{display:inline-block;margin-top:10px;background:linear-gradient(180deg,#ff7a3c,#e8551f);color:#fff;font-weight:700;padding:7px 16px;border-radius:22px;font-size:12px;box-shadow:0 4px 14px rgba(232,85,31,.4)}
.hint{text-align:center;color:#b79fb1;font-size:11px;margin-top:4px}
.wrap{max-width:1280px;margin:0 auto;padding:10px 18px 40px}
.bracket{display:flex;justify-content:center;align-items:stretch;gap:10px;padding:22px 0;overflow-x:auto}
.half{display:flex}
.round{display:flex;flex-direction:column;justify-content:space-around;padding:0 16px;min-width:138px}
.pair{position:relative;display:flex;flex-direction:column;justify-content:space-around;gap:26px;flex:1}
.match{position:relative;background:var(--card);border:1px solid var(--cardbd);border-radius:8px;overflow:hidden}
.match.empty{background:transparent;border-style:dashed;min-height:46px}
.slot{padding:5px 9px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;gap:6px}
.slot.win{font-weight:800;color:var(--gold)}.slot.lose{color:#c9b6c4;border-top:1px solid rgba(255,255,255,.08)}
.mg{font-size:9px;color:#b9a7b4;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.entry{cursor:pointer;border-bottom:1px dotted transparent}.entry:hover{border-bottom-color:currentColor}
.half.left .pair:not(.single)::after{content:"";position:absolute;right:-16px;top:25%;bottom:25%;width:2px;background:var(--line)}
.half.left .match::after{content:"";position:absolute;right:-16px;top:50%;width:16px;height:2px;background:var(--line)}
.half.right .pair:not(.single)::after{content:"";position:absolute;left:-16px;top:25%;bottom:25%;width:2px;background:var(--line)}
.half.right .match::after{content:"";position:absolute;left:-16px;top:50%;width:16px;height:2px;background:var(--line)}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 8px;min-width:180px}
.winnerlbl{font-size:13px;letter-spacing:4px;color:var(--gold);font-weight:800;text-transform:uppercase;margin-bottom:6px}
.trophy{font-size:74px;line-height:1;filter:drop-shadow(0 6px 18px rgba(245,197,66,.55))}
.champcard{margin-top:8px;background:linear-gradient(180deg,rgba(245,197,66,.22),rgba(245,197,66,.08));border:1.5px solid var(--gold);border-radius:10px;padding:8px 18px;font-weight:800;font-size:16px}
.champcard .entry{color:var(--gold)}
.finalline{margin-top:8px;font-size:11px;color:#d9c4d4}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:24px}
.panel{background:var(--card);border:1px solid var(--cardbd);border-radius:12px;padding:14px 16px}
.panel h3{margin:.1em 0 .7em;color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:1px}
.muted{color:#c9b6c4}.trust{font-weight:700}
.groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.grp{background:rgba(0,0,0,.18);border:1px solid var(--cardbd);border-radius:8px;padding:7px 9px}
.grp h4{margin:0 0 5px;color:var(--gold);font-size:12px}
.grp table{width:100%;border-collapse:collapse;font-size:12px}.grp td{padding:2px 3px;border-bottom:1px dotted rgba(255,255,255,.1)}
.grp td.pts{text-align:right;font-weight:700}.grp tr.adv td{background:rgba(245,197,66,.14)}
table.rank{width:100%;border-collapse:collapse;font-size:12.5px}table.rank td{padding:3px 7px;border-bottom:1px solid rgba(255,255,255,.08)}
ul{margin:.2em 0;padding-left:1.1em}
.modal{position:fixed;inset:0;background:rgba(10,2,9,.74);display:none;align-items:center;justify-content:center;padding:24px;z-index:50}
.modal.show{display:flex}
.sheet{background:linear-gradient(180deg,#3a0e33,#2b0a26);border:1px solid var(--cardbd);border-radius:14px;max-width:760px;width:100%;max-height:86vh;overflow:auto;padding:22px 26px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.sheet h2{margin:0 0 2px;color:var(--gold)}.sheet .meta{color:#cdb9c8;font-size:12.5px;margin-bottom:8px}
.sheet h3{color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:16px 0 6px}
.dqtag{background:#b3261e;color:#fff;font-size:10px;padding:2px 7px;border-radius:10px}
.mlog{list-style:none;padding:0}.mlog li{padding:5px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.mlog .w{color:var(--gold);font-weight:700}.mlog .l{color:#e58ab0}.why{color:#c2adbd;font-size:12px}
.essay p{margin:.55em 0;color:#ece0e9}.x{float:right;cursor:pointer;color:#cdb9c8;font-size:22px;line-height:1}
.coord{margin-top:16px}
.pc-wrap{overflow-x:auto}.pc-svg{width:100%;max-width:780px;height:auto;display:block;margin:0 auto}
.pc{stroke:rgba(255,255,255,.16);stroke-width:1}.pc.champ{stroke:var(--gold);stroke-width:2.5}.pc.opt{stroke:#7fd1ff;stroke-width:2;stroke-dasharray:5 4}
.pc-key{text-align:center;font-size:11px;color:#cdb9c8;margin-top:2px}.pc-key .champ{color:var(--gold);margin-right:14px}.pc-key .opt{color:#7fd1ff}
.eff{margin-top:12px}.erow{margin:7px 0;font-size:12px}.eax{color:#f5c542;font-weight:700;margin-bottom:3px}
.ebar{display:flex;align-items:center;gap:8px;margin:2px 0}.ev{width:96px;color:#d9c4d4}.ev.best{color:var(--gold);font-weight:700}
.etrack{flex:1;height:8px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}.efill{display:block;height:100%;background:var(--gold)}.enum{width:44px;text-align:right;color:#cdb9c8}
.warn{color:#ffb38a}
.explorer{margin-top:14px}.exsel{font-size:12px;color:#cdb9c8;margin-bottom:6px}.exsel select{background:#2b0a26;color:#f3e9f0;border:1px solid var(--cardbd);border-radius:6px;padding:2px 6px;margin:0 4px}
.gridtab{border-collapse:collapse;font-size:11px}.gridtab th{color:#f5c542;padding:3px 6px;text-align:left}.gridtab td{border:1px solid rgba(255,255,255,.1);padding:4px 6px;vertical-align:top;min-width:84px}
.cavg{font-size:9px;color:#b9a7b4;margin-top:2px}.entry.gold{color:var(--gold);font-weight:700}
</style></head><body>
<header><div class="fifa">&#127942; World Cup</div><h1>${esc((typeof meta !== 'undefined' && meta.name ? meta.name : 'WORLD CUP').toUpperCase())}</h1>
<div class="sub">champion <b style="color:var(--gold)">${esc(champion.label)}</b> &middot; ${esc(trustVerdict)} &middot; ${refTxt}</div>
<div class="recpill">${esc(recommendation)}</div><div class="hint">click any entry for its info and full text</div></header>
<div class="wrap"><div class="bracket"><div class="half left">${leftCols}</div>
<div class="center"><div class="winnerlbl">Winner</div><div class="trophy">&#127942;</div><div class="champcard">${entry(champion.label)}</div><div class="finalline">${finalLine}</div></div>
<div class="half right">${rightCols}</div></div>
<div class="panels">
<div class="panel"><h3>Trust</h3><div class="trust">${esc(trustVerdict)}</div><div class="muted">rating leader: ${esc(pool.find(t => t.id === ratingLeaderId).label)} &middot; avg rating of beaten opponents: ${avgBeatenRating}</div></div>
<div class="panel"><h3>Group stage</h3><div class="groups">${groupCards}</div></div>
${dqHtml}
<div class="panel"><h3>Global rating (Elo)</h3><table class="rank"><tr><td>#</td><td>entry</td><td>rating</td></tr>${ratingRows}</table></div>
</div>${coordPanel}</div>
<div class="modal" id="modal" onclick="if(event.target===this)hide()"><div class="sheet"><span class="x" onclick="hide()">&times;</span><div id="mbody"></div></div></div>
<script>
var DATA=${dataJson};
function he(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function show(k){var d=DATA[k];if(!d)return;var h='<h2>'+he(k)+(d.dq?' <span class="dqtag">DISQUALIFIED</span>':'')+'</h2>';
h+='<div class="meta">seed #'+d.seed+' &middot; rating '+d.rating+(d.angle?(' &middot; '+he(d.angle)):'')+'</div>';
if(d.coords&&Object.keys(d.coords).filter(function(k){return k!=='__rep';}).length)h+='<div class="meta">at '+Object.keys(d.coords).filter(function(k){return k!=='__rep';}).map(function(k){return he(k)+'='+he(d.coords[k]);}).join(', ')+'</div>';
if(d.dq)h+='<div class="meta" style="color:#f3a">gate: '+he(d.flaw)+'</div>';
if(d.matches&&d.matches.length){h+='<h3>matches</h3><ul class="mlog">';d.matches.forEach(function(x){h+='<li><span class="'+(x.won?'w':'l')+'">'+(x.won?'beat':'lost to')+' '+he(x.opp)+'</span> <span class="why">&middot; '+he(x.round)+' &middot; '+he(x.margin||'')+'</span><div class="why">'+he(x.reason||'')+'</div></li>';});h+='</ul>';}
h+='<h3>full text</h3><div class="essay">'+String(d.text||'').split(/\\n\\n+/).map(function(p){return '<p>'+he(p)+'</p>';}).join('')+'</div>';
document.getElementById('mbody').innerHTML=h;document.getElementById('modal').classList.add('show');}
function hide(){document.getElementById('modal').classList.remove('show');}
document.addEventListener('keydown',function(e){if(e.key==='Escape')hide();});
document.addEventListener('click',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('entry')&&t.getAttribute('data-k'))show(t.getAttribute('data-k'));});
${coordScript}
</script></body></html>`
}

return {
  champion: { label: champion.label, title: champion.title, angle: champion.oneLineAngle, markdown: champion.markdown,
    seedRank: seeded.findIndex(t => t.id === champion.id) + 1, rating: Math.round(ratingOf.get(champion.id)) },
  final: lastRound[0] && { winner: lastRound[0].winner.label, loser: lastRound[0].loser.label, margin: lastRound[0].margin, reason: lastRound[0].reason },
  championPath: pathOf(champion),
  globalRanking: globalRating.map(([id, r], i) => ({ rank: i + 1, label: pool.find(t => t.id === id).label, rating: Math.round(r) })),
  trust: {
    championIsRatingLeader: championIsLeader,
    ratingLeader: pool.find(t => t.id === ratingLeaderId).label,
    avgRatingOfOpponentsBeaten: avgBeatenRating,
    finalMargin: lastRound[0] && lastRound[0].margin,
    verdict: trustVerdict,
  },
  referenceChallenge,
  recommendation,
  effects,
  playoff,
  disqualified: pool.filter(t => t.flaw?.disqualified).map(t => ({ label: t.label, flaw: t.flaw.flaw })),
  graph: {
    groups: groups.map((g, gi) => ({ group: LETTERS[gi], standings: adv[gi].ranked.map(t => ({ label: t.label, pts: adv[gi].pts.get(t.id) })), advanced: [adv[gi].ranked[0].label, adv[gi].ranked[1].label] })),
    knockout: order.filter(k => history[k] && history[k].length).map(k => ({ round: k, matches: history[k].map(m => ({ winner: m.winner.label, loser: m.loser.label, margin: m.margin })) })),
  },
  reportHtml: renderReportV2(),
}
