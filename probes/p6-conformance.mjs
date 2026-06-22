// PLAN_3 U12 (P6) probe — conformance qualification is EXACT pass/fail (no Wilson/CI) over the
// noncompensatory gate floor, and adoptEvaluator reassigns the module evaluator only after validation.
//
// Loads the REAL workflow-template.js prelude (which now defines buildAnchors + qualifyConformance +
// adoptEvaluator), wraps it in a sandbox whose mocked `agent` delegates to a RECONFIGURABLE judge so the
// probe can simulate a perfect / blind / over-eager fabrication gate with controlled verdicts. Checks:
// (a) a perfect gate ⇒ PASS, passed===total; (b) a blind gate that misses fabrication ⇒ BLOCKED with the
// fabrication family named; (c) an over-eager gate that false-DQs an authorized detail ⇒ BLOCKED;
// (d) NO Wilson/recall/CI language anywhere; (e) ABSTAIN on an unrealizable anchor; (f) DIR/INV deferred,
// not silently passed; (g) adoptEvaluator validates THEN reassigns (invalid ⇒ throw, no half-adopt).
//
//   run:  node probes/p6-conformance.mjs
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
const __ctl = ctl;
const log = () => {}, phase = () => {};
let args = [];
const agent = async (prompt, opts) => __ctl.judge(prompt, opts);
const parallel = async (thunks) => Promise.all(thunks.map(f => f()));
`
const footer = `
;return { QUALIFY, buildAnchors, qualifyConformance, adoptEvaluator, validateEvaluatorConfig,
  makeFlawSchema, LENS_SCHEMA, SEED_SCHEMA, EVALUATOR, AUTHORITY, DEFAULT_NOT_ALLOWED,
  getEvaluator: () => EVALUATOR, flawPrompt };
`
const ctl = { judge: async () => ({}) }
// eslint-disable-next-line no-new-func
const M = new Function('ctl', mockHeader + prelude + footer)(ctl)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const throws = fn => { try { fn(); return false } catch { return true } }

const packet = {
  supported_facts: ['the build took three days and then stalled'],
  allowed_entities: { files: ['Parser.ts'], names: ['Mara'] },
  not_allowed: M.DEFAULT_NOT_ALLOWED, target: null,
}
const incumbent = 'A plain honest passage written in the author own voice, no specifics.'
const corpus = M.buildAnchors({ incumbent, packet, packetId: 'deadbeefdeadbeef' })
// the planted fabrications (expected DQ) the perfect gate must catch — vs everything else it must pass.
const dqSpans = corpus.filter(c => c.expected && c.expected.gate === 'DQ').map(c => c.mutation.span)
const FAB_FAMILY = 'truth/integrity/MFT-fabrication'

// flaw judges: a flaw-gate call returns { disqualified, category, ... }. 3 screeners vote; a same-family
// majority DQs. Each judge returns the same verdict across screeners (deterministic).
const dqVerdict = { disqualified: true, category: 'FABRICATED_CONCRETE_DETAIL', flaw: 'planted', confidence: 'high', note: '' }
const okVerdict = { disqualified: false, category: 'NONE', flaw: '', confidence: 'high', note: '' }
const perfect = async prompt => (dqSpans.some(s => prompt.includes(s)) ? dqVerdict : okVerdict)   // catches exactly the fabrications
const blind = async () => okVerdict                                                                // never DQs ⇒ misses fabrication
const eager = async () => dqVerdict                                                                // DQs everything ⇒ false accusations

// ── (a) perfect gate ⇒ PASS ──────────────────────────────────────────────────────────────────
console.log('perfect gate ⇒ PASS (exact):')
ctl.judge = perfect
const rPass = await M.qualifyConformance(corpus, { incumbent })
ok('verdict PASS', rPass.verdict === 'PASS')
ok('passed === total (every gate obligation met)', rPass.passed === rPass.total && rPass.total > 0)
ok('no mandatory family failed', rPass.mandatory_failed.length === 0)
ok('failed_families empty', rPass.failed_families.length === 0)

// ── (b) blind gate misses fabrication ⇒ BLOCKED ───────────────────────────────────────────────
console.log('blind gate misses fabrication ⇒ BLOCKED:')
ctl.judge = blind
const rBlind = await M.qualifyConformance(corpus, { incumbent })
ok('verdict BLOCKED', rBlind.verdict === 'BLOCKED')
ok('fabrication family named in mandatory_failed', rBlind.mandatory_failed.includes(FAB_FAMILY))
ok('fabrication family named in failed_families', rBlind.failed_families.includes(FAB_FAMILY))
ok('BLOCKED is noncompensatory (passes elsewhere do not rescue it)', rBlind.passed < rBlind.total)

// ── (c) over-eager gate false-DQs an authorized detail ⇒ BLOCKED ──────────────────────────────
console.log('over-eager gate false-accuses ⇒ BLOCKED:')
ctl.judge = eager
const rEager = await M.qualifyConformance(corpus, { incumbent })
ok('verdict BLOCKED (a false accusation is fatal too)', rEager.verdict === 'BLOCKED')
ok('an authorized/unknown family is in failed_families', rEager.failed_families.some(f => f.startsWith('truth/integrity/MFT-') && f !== FAB_FAMILY))

// ── (d) exact pass/fail — NO Wilson/recall/CI anywhere ────────────────────────────────────────
console.log('exact pass/fail (no statistical-sample language):')
const blob = JSON.stringify(rPass) + JSON.stringify(rBlind)
ok('no "wilson" key/value', !/wilson/i.test(blob))
ok('no "recall" key/value', !/recall/i.test(blob))
ok('no "interval"/"ci"/"confidence_interval"', !/interval|confidence_interval|\bci\b/i.test(blob))
ok('scorecard reports integer passed/total', Number.isInteger(rPass.passed) && Number.isInteger(rPass.total))
ok('failed_families is an array of family strings', Array.isArray(rBlind.failed_families) && rBlind.failed_families.every(f => typeof f === 'string'))

// ── (e) ABSTAIN on an unrealizable anchor (not a fabricated pass/fail) ─────────────────────────
console.log('ABSTAIN on an unrealizable anchor:')
const malformed = { construct: 'integrity', test_type: 'MFT', kind: 'truth', authority_status: 'FORBIDDEN',
  expected: { gate: 'DQ', taste_comparison: null }, mutation: { span: null, operator: 'plant_lived_fact' },
  proof: { ledger_lookup: { status: 'UNSUPPORTED', provenance: null } }, editor_votes: [], author_veto: false,
  known_confounds: [], difficulty: 'easy', provenance: {}, human_adjudicated: false, family: 'truth/integrity/MFT-broken' }
ctl.judge = perfect
const rAbstain = await M.qualifyConformance([malformed], { incumbent })
ok('unrealizable anchor is ABSTAINED', rAbstain.abstained.includes('truth/integrity/MFT-broken'))
ok('abstained anchor is not scored (total 0)', rAbstain.total === 0)
ok('abstain ⇒ not BLOCKED on its own', rAbstain.verdict === 'PASS')
// /invariance F2: an ENTIRELY-abstained mandatory family is surfaced as unscored (so the run can't pass
// the floor vacuously) — but a family that also scored ≥1 anchor is NOT flagged unscored.
ok('an entirely-abstained mandatory family is reported as unscored', rAbstain.unscored_families.includes('truth/integrity/MFT-broken'))
const mixed = [malformed, { ...malformed, mutation: { span: 'on line 999 of nowhere', operator: 'plant_lived_fact' } }]
const rMixed = await M.qualifyConformance(mixed, { incumbent })   // same family: one abstains, one scores
ok('a family that scored ≥1 anchor is NOT flagged unscored', !rMixed.unscored_families.includes('truth/integrity/MFT-broken'))

// ── (f) DIR/INV deferred to fresh probes, never silently passed ───────────────────────────────
console.log('directional anchors deferred (not silently passed):')
ok('deferred_to_probes counts the DIR/INV anchors', rPass.deferred_to_probes === corpus.filter(c => c.test_type !== 'MFT').length && rPass.deferred_to_probes > 0)
ok('total counts only scored gate anchors', rPass.total === corpus.filter(c => c.kind === 'truth' && c.test_type === 'MFT').length)

// ── (g) adoptEvaluator: validate THEN reassign (no half-adopt) ────────────────────────────────
console.log('adoptEvaluator (validate then reassign):')
const before = M.getEvaluator()
ok('qualifyConformance alone did NOT reassign EVALUATOR', M.getEvaluator() === before)
// a complete, valid custom config (mirrors p2's vbase) — adopt must reassign the module let
const valid = { criteriaBlock: 'c', incumbentClause: '', targetGateClause: '', hardDqCategories: ['X'],
  dqFamily: { X: 'fam' }, preflightHardDqCategory: 'X', lenses: { a: 'lens A' }, panelFor: () => ['a'],
  tiebreakLens: 'a', screeners: 3, bans: { emDash: true, vocab: [] }, agentOptions: {}, lensWeight: () => 1,
  schemas: { flaw: M.makeFlawSchema(['X']), lens: M.LENS_SCHEMA, seed: M.SEED_SCHEMA } }
ok('adoptEvaluator(valid) returns + reassigns the module let', M.adoptEvaluator(valid) === valid && M.getEvaluator() === valid)
ok('flaw prompt now reads the adopted config', M.flawPrompt({ markdown: 'x' }).includes('lens A') === false && M.flawPrompt({ markdown: 'x' }).includes('c'))
// an invalid config (missing schemas) must THROW and must NOT half-adopt
const invalid = { ...valid, schemas: undefined }
ok('adoptEvaluator(invalid) throws', throws(() => M.adoptEvaluator(invalid)))
ok('invalid config did NOT replace the evaluator', M.getEvaluator() === valid)
// restore the default so QUALIFY-off byte-identity holds for any later consumer of this module instance
M.adoptEvaluator(before)
ok('restored the default evaluator', M.getEvaluator() === before)
ok('QUALIFY is off by default', M.QUALIFY === false)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
