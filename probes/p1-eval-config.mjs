// PLAN_3 U19 (P1) probe — asserts the EVALUATOR_CONFIG is the config the judge surfaces ACTUALLY
// use, and that the DEFAULT config equals today's constants (byte-identity foundation).
//
// It loads the REAL worldcup/references/workflow-template.js, slices the prelude (everything up to
// the first line that runs the tournament, `let pool`), de-exports `meta`, and wraps it in a
// sandbox with a mocked `agent` that CAPTURES every call. Then it exercises the judge surfaces and
// checks: (a) default prompts interpolate the real constants; (b) a marked config flows through
// flawPrompt/lensPrompt/seedPrompt, screenAll, playMatch (schema identity, agent options, panel
// policy, tiebreak lens, lens weights, dq family); (c) the no-arg path reads the module EVALUATOR
// (so the certified config, once assigned, is provably the one the run uses).
//
//   run:  node probes/p1-eval-config.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(here, '..', 'worldcup', 'references', 'workflow-template.js')

let src = readFileSync(TEMPLATE, 'utf8').replace(/^export const meta/m, 'const meta')
const cut = src.indexOf('\nlet pool')
if (cut < 0) throw new Error('probe: could not find the `let pool` orchestration marker to slice the prelude')
const prelude = src.slice(0, cut)

const mockHeader = `
const __cap = captured;
const log = () => {}, phase = () => {};
let args = [];
const agent = async (prompt, opts) => { __cap.push({ prompt, opts }); return { winner: 'X', margin: 'clear', reason: 'r', disqualified: false, category: 'NONE', confidence: 'low', note: '', markdown: '' }; };
const parallel = async (thunks) => Promise.all(thunks.map(f => f()));
`
const footer = `
;return { EVALUATOR, flawPrompt, lensPrompt, seedPrompt, tally, marginOf, playMatch, screenAll,
  preflight, validateEvaluatorConfig, makeFlawSchema, lensW, BANS,
  CRITERIA_BLOCK, INCUMBENT_CLAUSE, HARD_DQ_CATEGORIES, DQ_FAMILY, LENSES, FLAW_SCHEMA, LENS_SCHEMA, SEED_SCHEMA, SCREENERS };
`
const captured = []
// eslint-disable-next-line no-new-func
const make = new Function('captured', mockHeader + prelude + footer)
const M = make(captured)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const reset = () => { captured.length = 0 }
const E = { id: 1, label: 'A', rating: 1500, markdown: 'alpha body' }
const F = { id: 2, label: 'B', rating: 1500, markdown: 'bravo body' }

// ── (a) default config equals today's constants (byte-identity foundation) ─────────────────
console.log('default config == constants:')
ok('criteriaBlock is CRITERIA_BLOCK',   M.EVALUATOR.criteriaBlock === M.CRITERIA_BLOCK)
ok('incumbentClause is INCUMBENT_CLAUSE', M.EVALUATOR.incumbentClause === M.INCUMBENT_CLAUSE)
ok('hardDqCategories is HARD_DQ_CATEGORIES', M.EVALUATOR.hardDqCategories === M.HARD_DQ_CATEGORIES)
ok('dqFamily is DQ_FAMILY',               M.EVALUATOR.dqFamily === M.DQ_FAMILY)
ok('lenses is LENSES',                   M.EVALUATOR.lenses === M.LENSES)
ok('schemas.flaw is FLAW_SCHEMA',        M.EVALUATOR.schemas.flaw === M.FLAW_SCHEMA)
ok('schemas.lens is LENS_SCHEMA',        M.EVALUATOR.schemas.lens === M.LENS_SCHEMA)
ok('schemas.seed is SEED_SCHEMA',        M.EVALUATOR.schemas.seed === M.SEED_SCHEMA)
ok('screeners is SCREENERS',             M.EVALUATOR.screeners === M.SCREENERS)
ok('tiebreakLens default integrity',     M.EVALUATOR.tiebreakLens === 'integrity')
ok('agentOptions empty (inherit)',       Object.keys(M.EVALUATOR.agentOptions).length === 0)
ok('lensWeight default returns 1',       M.EVALUATOR.lensWeight('voice') === 1)

// ── default prompts interpolate the real constants (no template drift) ─────────────────────
console.log('default prompts interpolate constants:')
ok('flawPrompt has CRITERIA_BLOCK',  M.flawPrompt(E).includes(M.CRITERIA_BLOCK))
ok('flawPrompt has DQ vocabulary',   M.flawPrompt(E).includes(M.HARD_DQ_CATEGORIES.join(', ')))
ok('lensPrompt has lens text',       M.lensPrompt('voice', E, F).includes(M.LENSES.voice))
ok('lensPrompt has CRITERIA_BLOCK',  M.lensPrompt('voice', E, F).includes(M.CRITERIA_BLOCK))
ok('seedPrompt has CRITERIA_BLOCK',  M.seedPrompt(E, F).includes(M.CRITERIA_BLOCK))

// ── (b) a MARKED config flows through every surface ────────────────────────────────────────
console.log('marked config threads through prompts:')
const marked = {
  ...M.EVALUATOR,
  criteriaBlock: 'SENTINEL_CRIT', incumbentClause: 'SENTINEL_INC', targetGateClause: 'SENTINEL_TGT',
  hardDqCategories: ['SENTINEL_CAT'], dqFamily: { SENTINEL_CAT: 'sentinel_fam' },
  lenses: { ...M.EVALUATOR.lenses, voice: 'SENTINEL_LENS' },
  panelFor: () => ['voice'], tiebreakLens: 'voice', screeners: 1,
  schemas: { flaw: { __m: 'FLAW' }, lens: { __m: 'LENS' }, seed: { __m: 'SEED' } },
  // agentOptions tries to override protected per-call fields — the call sites must NOT let it.
  agentOptions: { model: 'SENTINEL_MODEL', schema: { __evil: true }, label: 'EVIL_LABEL', phase: 'EVIL_PHASE' },
  lensWeight: l => (l === 'voice' ? 2 : 1),
}
ok('flawPrompt uses marked criteria',  M.flawPrompt(E, marked).includes('SENTINEL_CRIT'))
ok('flawPrompt uses marked targetGate', M.flawPrompt(E, marked).includes('SENTINEL_TGT'))
ok('flawPrompt uses marked DQ vocab',  M.flawPrompt(E, marked).includes('SENTINEL_CAT'))
ok('lensPrompt uses marked lens text', M.lensPrompt('voice', E, F, marked).includes('SENTINEL_LENS'))
ok('lensPrompt uses marked incumbent', M.lensPrompt('voice', E, F, marked).includes('SENTINEL_INC'))
ok('seedPrompt uses marked criteria',  M.seedPrompt(E, F, marked).includes('SENTINEL_CRIT'))

console.log('marked config threads through tally:')
const votes11 = [{ lens: 'voice', winner: E }, { lens: 'substance', winner: F }]
ok('default tally: 1-1 is a tie (null)',   M.tally(votes11, E, F) === null)
ok('marked tally: voice weight 2 wins E',  (M.tally(votes11, E, F, marked) || {}).id === E.id)

// ── (c) the RUN PATH reads the config (capture what agent actually received) ────────────────
console.log('playMatch run-path uses the marked config:')
reset()
await M.playMatch(E, F, 0, 'R16', 'p', [], marked)
ok('panel policy honored (1 lens call)',   captured.length === 1)
ok('lens agent got marked agentOptions',   captured[0].opts.model === 'SENTINEL_MODEL')
ok('lens prompt carried marked lens+crit',  captured[0].prompt.includes('SENTINEL_LENS') && captured[0].prompt.includes('SENTINEL_CRIT'))
ok('agentOptions CANNOT override schema',   captured[0].opts.schema === marked.schemas.lens) // not { __evil }
ok('agentOptions CANNOT override label',    captured[0].opts.label.startsWith('R16:') && captured[0].opts.label !== 'EVIL_LABEL')
ok('agentOptions CANNOT override phase',     captured[0].opts.phase === 'p')

console.log('screenAll run-path uses the marked config:')
reset()
await M.screenAll([{ id: 3, label: 'C', markdown: 'clean text' }], 'p', marked)
ok('screeners honored (1 gate call)',      captured.length === 1)
ok('gate agent got marked agentOptions',   captured[0].opts.model === 'SENTINEL_MODEL')
ok('gate prompt carried marked crit+vocab', captured[0].prompt.includes('SENTINEL_CRIT') && captured[0].prompt.includes('SENTINEL_CAT'))
ok('gate agentOptions CANNOT override schema', captured[0].opts.schema === marked.schemas.flaw) // not { __evil }
ok('gate agentOptions CANNOT override phase',  captured[0].opts.phase === 'p')

// ── findings #2/#3/#4: preflight config, weight guard, config-consistency validation ────────
console.log('preflight reads the config (ev.bans), not a global:')
ok('default preflight uses module BANS',   M.EVALUATOR.bans === M.BANS)
ok('marked bans=off: em dash NOT hardDQ',  M.preflight('a — b', { bans: { emDash: false, vocab: [] } }).hardDQ === false)
ok('marked bans=on: em dash IS hardDQ',    M.preflight('a — b', { bans: { emDash: true, vocab: [] } }).hardDQ === true)

console.log('lensWeight is guarded (undefined/NaN/negative -> 1):')
ok('lensW coerces NaN to 1',               M.lensW({ lensWeight: () => NaN }, 'voice') === 1)
ok('lensW coerces undefined to 1',         M.lensW({ lensWeight: () => undefined }, 'voice') === 1)
ok('lensW coerces negative to 1',          M.lensW({ lensWeight: () => -5 }, 'voice') === 1)
ok('lensW coerces zero to 1 (no collapse)', M.lensW({ lensWeight: () => 0 }, 'voice') === 1)
ok('lensW keeps a valid weight',           M.lensW({ lensWeight: () => 2 }, 'voice') === 2)
const badW = { ...M.EVALUATOR, lensWeight: () => NaN }
ok('tally with NaN weights does NOT silently pick b', M.tally([{ lens: 'voice', winner: E }], E, F, badW).id === E.id)

console.log('validateEvaluatorConfig is a complete safety contract:')
const throws = fn => { try { fn(); return false } catch { return true } }
// a minimal VALID custom config; each defect below flips exactly one field.
const vbase = { hardDqCategories: ['X'], dqFamily: { X: 'fam' }, preflightHardDqCategory: 'X',
  screeners: 3, lenses: { a: 'lens A' }, tiebreakLens: 'a', panelFor: () => ['a'],
  schemas: { flaw: M.makeFlawSchema(['X']) } }
ok('default config validates',             M.validateEvaluatorConfig(M.EVALUATOR) === M.EVALUATOR)
ok('valid custom config validates',        !throws(() => M.validateEvaluatorConfig({ ...vbase })))
ok('exact-enum: EXTRA category throws',    throws(() => M.validateEvaluatorConfig({ ...vbase, schemas: { flaw: M.makeFlawSchema(['X', 'Y']) } })))
ok('exact-enum: MISSING category throws',  throws(() => M.validateEvaluatorConfig({ ...vbase, hardDqCategories: ['X', 'Z'], dqFamily: { X: 'f', Z: 'f' }, schemas: { flaw: M.makeFlawSchema(['X']) } })))
ok('missing dqFamily mapping throws',      throws(() => M.validateEvaluatorConfig({ ...vbase, dqFamily: {} })))
ok('screeners=0 throws',                   throws(() => M.validateEvaluatorConfig({ ...vbase, screeners: 0 })))
ok('screeners=NaN throws',                 throws(() => M.validateEvaluatorConfig({ ...vbase, screeners: NaN })))
ok('ghost lens in panel throws',           throws(() => M.validateEvaluatorConfig({ ...vbase, panelFor: () => ['ghost'] })))
ok('empty panel throws',                   throws(() => M.validateEvaluatorConfig({ ...vbase, panelFor: () => [] })))
ok('ghost tiebreakLens throws',            throws(() => M.validateEvaluatorConfig({ ...vbase, tiebreakLens: 'ghost' })))
ok('preflight category not in cats throws', throws(() => M.validateEvaluatorConfig({ ...vbase, preflightHardDqCategory: 'NOPE' })))

// ── no-arg path reads the MODULE EVALUATOR (so a reassigned/certified config drives the run) ─
console.log('default (no-ev) run-path reads the module EVALUATOR:')
reset()
await M.screenAll([{ id: 4, label: 'D', markdown: 'plain default text' }], 'p')
ok('default screeners == SCREENERS calls', captured.length === M.SCREENERS)
ok('default gate uses module FLAW_SCHEMA',  captured[0].opts.schema === M.EVALUATOR.schemas.flaw)
ok('default gate inherits model (no override)', captured[0].opts.model === undefined)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
