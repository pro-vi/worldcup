// PLAN_3 U24 (P8) probe — the run-status STATE MACHINE is honest and precise, and the assurance card
// carries the full envelope with no "certified/accuracy/recall" language.
//
// Loads the REAL workflow-template.js prelude (qualifyRun/runPerturbations), wraps it in a sandbox with a
// reconfigurable mocked judge (for runPerturbations), and ALSO requires qualify.js to prove the card
// round-trips through writeCard. Checks the 4-state machine on controlled inputs: (a) BLOCKED dominates;
// (b) a champion flip ACROSS the margin band ⇒ UNSTABLE; (c) a flip WITHIN the near-tie band ⇒ NOT
// UNSTABLE; (d) a bracket-reseed flip ⇒ NOT UNSTABLE (envelope only); (e) a missing second model ⇒
// alt_model:'not_run'; (f) author/editor disagreement & insufficient evidence ⇒ HUMAN_REVIEW_REQUIRED;
// (g) an all-pass stable run ⇒ QUALIFIED_FOR_THIS_RUN; (h) the card serializes (envelope, taste agreement,
// adversarial_audit:'not_run', expires_on, top_set inert) and contains NO certified/accuracy/recall words;
// (i) runPerturbations is champion-only and faithful-judge-stable; (j) the card writes + reads back.
//
//   run:  node probes/p8-assurance.mjs
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const q = require(join(here, '..', 'worldcup', 'references', 'qualify.js'))
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
;return { QUALIFY, qualifyRun, runPerturbations, RUN_STATUS, EVALUATOR };
`
const ctl = { judge: async () => ({}) }
// eslint-disable-next-line no-new-func
const M = new Function('ctl', mockHeader + prelude + footer)(ctl)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }

// Fixtures mirror REAL pipeline output: conformance carries a scored floor; probes carry a `total`; at
// least one judge-side perturbation ran. decide() now requires POSITIVE proof each channel ran.
const PASS_CONF = { verdict: 'PASS', passed: 12, failed_families: [], mandatory_failed: [], floor: { scored_must_dq: 4, scored_must_pass: 6, untested: null }, unscored_families: [] }
const BLOCK_CONF = { verdict: 'BLOCKED', passed: 8, failed_families: ['truth/integrity/MFT-fabrication'], floor: { scored_must_dq: 4, scored_must_pass: 6, untested: null } }
const CLEAN_PROBES = { passed: 7, total: 7, drift: [] }
const baseInput = {
  packet_id: 'deadbeefdeadbeef', run_id: 'run-01', conformance: PASS_CONF, probes: CLEAN_PROBES,
  evidence_sufficient: true, author_disagreement: false, anchor_bank_version: 'cafebabecafebabe',
  judge_models: ['model-x'], taste: { agreement_with_named_adjudicators: 0.8, author_vetoes: [] },
  envelope: { packet_completeness: 'high', field_diversity: 'medium', generator_identity: 'gen-1' },
  perturbations: { mirrored_order: { flipped: false, band: 'within' }, paraphrase: { flipped: false, band: 'within' }, alt_model: 'not_run' },
}
const S = M.RUN_STATUS

// ── (a) BLOCKED dominates ──────────────────────────────────────────────────────────────────────
console.log('BLOCKED dominates:')
ok('conformance BLOCKED ⇒ BLOCKED', M.qualifyRun({ ...baseInput, conformance: BLOCK_CONF }).run_status === S.BLOCKED)
ok('BLOCKED even when a perturbation also flips across the band',
  M.qualifyRun({ ...baseInput, conformance: BLOCK_CONF, perturbations: { mirrored_order: { flipped: true, band: 'across' } } }).run_status === S.BLOCKED)

// ── (b)(c) UNSTABLE is precise: across-band flip only ────────────────────────────────────────────
console.log('UNSTABLE is across-band only:')
ok('mirrored-order flip ACROSS the band ⇒ UNSTABLE',
  M.qualifyRun({ ...baseInput, perturbations: { mirrored_order: { flipped: true, band: 'across' } } }).run_status === S.UNSTABLE)
ok('flip WITHIN the near-tie band ⇒ NOT UNSTABLE (close call)',
  M.qualifyRun({ ...baseInput, perturbations: { mirrored_order: { flipped: true, band: 'within' } } }).run_status === S.QUALIFIED)
ok('paraphrase flip across the band ⇒ UNSTABLE',
  M.qualifyRun({ ...baseInput, perturbations: { paraphrase: { flipped: true, band: 'across' } } }).run_status === S.UNSTABLE)
ok('configured alt-model flip across the band ⇒ UNSTABLE',
  M.qualifyRun({ ...baseInput, perturbations: { alt_model: { flipped: true, band: 'across' } } }).run_status === S.UNSTABLE)

// ── (d) bracket-reseed is NOT a judge-side perturbation ──────────────────────────────────────────
console.log('bracket-reseed is envelope-only, never UNSTABLE:')
const reseed = M.qualifyRun({ ...baseInput, perturbations: { mirrored_order: { flipped: false, band: 'within' }, bracket_reseed: { flipped: true, band: 'across' } } })
ok('a bracket-reseed flip ⇒ NOT UNSTABLE', reseed.run_status === S.QUALIFIED)
ok('the reseed flip lands in operating_envelope.bracket_seed_sensitivity', reseed.operating_envelope.bracket_seed_sensitivity && reseed.operating_envelope.bracket_seed_sensitivity.flipped === true)

// ── (e) alt-model optionality is explicit ────────────────────────────────────────────────────────
console.log('alt-model optionality:')
ok('absent alt-model ⇒ envelope alt_model "not_run" (not silent stability)', M.qualifyRun(baseInput).operating_envelope.alt_model === 'not_run')
ok('perturbation_count excludes not_run perturbations', M.qualifyRun(baseInput).perturbation_count === 2)

// ── (f) HUMAN_REVIEW_REQUIRED ────────────────────────────────────────────────────────────────────
console.log('HUMAN_REVIEW_REQUIRED:')
const disag = M.qualifyRun({ ...baseInput, author_disagreement: true })
const insuff = M.qualifyRun({ ...baseInput, evidence_sufficient: false })
ok('material author/editor disagreement ⇒ HUMAN_REVIEW_REQUIRED', disag.run_status === S.HUMAN)
ok('insufficient evidence ⇒ HUMAN_REVIEW_REQUIRED', insuff.run_status === S.HUMAN)
// /failure-mode axis 7: the two HUMAN causes have different remedies — the card must distinguish them
ok('disagreement vs insufficiency carry DISTINCT status_reason', disag.status_reason !== insuff.status_reason)
ok('disagreement reason names the value disagreement', /disagreement/.test(disag.status_reason))
ok('insufficiency reason names insufficient evidence', /insufficient/.test(insuff.status_reason))
// /invariance F1 (Blocker): a run with NO conformance fails CLOSED to HUMAN_REVIEW, never QUALIFIED
const noEvidence = M.qualifyRun({ packet_id: 'deadbeefdeadbeef', run_id: 'r' })
ok('NO conformance ⇒ HUMAN_REVIEW (fail closed, not silent certify)', noEvidence.run_status === S.HUMAN)
ok('no-conformance reason names the missing conformance', /no_conformance/.test(noEvidence.status_reason))
ok('NO conformance + heavy drift still ⇒ HUMAN_REVIEW (never QUALIFIED)',
  M.qualifyRun({ packet_id: 'deadbeefdeadbeef', run_id: 'r', probes: { passed: 0, drift: [{ type: 'persona_drift' }] } }).run_status === S.HUMAN)
// /invariance F2: a mandatory family that ENTIRELY abstained is insufficient evidence ⇒ HUMAN_REVIEW
ok('an entirely-unscored mandatory family ⇒ HUMAN_REVIEW',
  M.qualifyRun({ ...baseInput, conformance: { verdict: 'PASS', passed: 0, failed_families: [], unscored_families: ['truth/integrity/MFT-fabrication'] } }).run_status === S.HUMAN)
ok('a partially-abstained but scored floor still ⇒ QUALIFIED', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, abstained: ['x'], unscored_families: [] } }).run_status === S.QUALIFIED)

// ── (f2) ALLOWLIST: decide() gates QUALIFIED on ALL collected evidence (P0/P1 review) ─────────────
console.log('fail-closed allowlist — every evidence channel gates:')
// finding 3 — only an explicit PASS proceeds; any other verdict string fails closed (not QUALIFIED)
for (const v of ['pass', 'OK', 'qualified', '', 'PASSS'])
  ok(`unrecognized verdict ${JSON.stringify(v)} ⇒ HUMAN (not QUALIFIED)`, M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, verdict: v } }).run_status === S.HUMAN)
// finding 3 — a DESYNCED verdict (PASS but a non-empty failure array) ⇒ BLOCKED
ok('verdict PASS + non-empty mandatory_failed ⇒ BLOCKED', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, mandatory_failed: ['truth/integrity/MFT-fabrication'] } }).run_status === S.BLOCKED)
ok('verdict PASS + non-empty failed_families ⇒ BLOCKED', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, failed_families: ['x'] } }).run_status === S.BLOCKED)
// finding 1 — an untested floor (must-DQ or must-PASS scored nothing) ⇒ HUMAN
ok('conformance.floor.untested ⇒ HUMAN', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, floor: { untested: 'no_scored_must_dq' } } }).run_status === S.HUMAN)
ok('passed:0 (floor scored nothing) ⇒ HUMAN', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, passed: 0 } }).run_status === S.HUMAN)
// finding 2 — fresh-probe DRIFT gates status; a persona-drift miss is a live fabrication breach ⇒ BLOCKED
ok('persona_drift in probes ⇒ BLOCKED (live fabrication breach)', M.qualifyRun({ ...baseInput, probes: { passed: 6, total: 7, drift: [{ type: 'persona_drift' }] } }).run_status === S.BLOCKED)
ok('other drift ⇒ HUMAN (fresh_probe_drift)', M.qualifyRun({ ...baseInput, probes: { passed: 6, total: 7, drift: [{ type: 'ab_reversal' }] } }).run_status === S.HUMAN)
ok('drift reason is fresh_probe_drift', M.qualifyRun({ ...baseInput, probes: { passed: 6, total: 7, drift: [{ type: 'omission' }] } }).status_reason === 'fresh_probe_drift')
ok('passed < total (no drift list) still ⇒ HUMAN', M.qualifyRun({ ...baseInput, probes: { passed: 5, total: 7, drift: [] } }).run_status === S.HUMAN)
// finding 5 — a non-empty author veto gates, even without the hand-set boolean
ok('non-empty author_vetoes ⇒ HUMAN_REVIEW', M.qualifyRun({ ...baseInput, taste: { agreement_with_named_adjudicators: 0.0, author_vetoes: ['champ'] } }).run_status === S.HUMAN)
ok('vetoed run reason is material_author_disagreement', M.qualifyRun({ ...baseInput, taste: { author_vetoes: ['champ'] } }).status_reason === 'material_author_disagreement')
// finding 4 — a flip with an UNRECOGNIZED/missing band can't be classified ⇒ fail closed (not silent-stable)
ok('flipped with unknown band ⇒ HUMAN (not silent stability)', M.qualifyRun({ ...baseInput, perturbations: { mirrored_order: { flipped: true, band: 'wat' } } }).run_status === S.HUMAN)
ok('flipped with missing band ⇒ HUMAN', M.qualifyRun({ ...baseInput, perturbations: { mirrored_order: { flipped: true } } }).run_status === S.HUMAN)

// ── (f3) RE-REVIEW: positive-proof + type-strict + totality (decide() must self-defend) ───────────
console.log('re-review: each channel must positively prove it RAN:')
// the minimal-input fail-open: a bare PASS with no floor / no probes / no perturbations must NOT certify
ok('bare {verdict:PASS,passed} (no floor/probes/perturbations) ⇒ HUMAN', M.qualifyRun({ packet_id: 'deadbeefdeadbeef', run_id: 'r', conformance: { verdict: 'PASS', passed: 5, failed_families: [] } }).run_status === S.HUMAN)
// floor must be POSITIVELY scored — a floor reporting zero scored, even with untested:null, is vacuous
ok('floor scored_must_dq:0 (untested:null) ⇒ HUMAN', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, floor: { scored_must_dq: 0, scored_must_pass: 6, untested: null } } }).run_status === S.HUMAN)
ok('floor scored_must_pass:0 ⇒ HUMAN', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, floor: { scored_must_dq: 4, scored_must_pass: 0, untested: null } } }).run_status === S.HUMAN)
ok('no floor object at all ⇒ HUMAN', M.qualifyRun({ ...baseInput, conformance: { verdict: 'PASS', passed: 5, failed_families: [] } }).run_status === S.HUMAN)
// fresh probes must have RUN (a `total` > 0) — the default {passed:0,drift:[]} shape must not certify
ok('probes without a total (phase never ran) ⇒ HUMAN', M.qualifyRun({ ...baseInput, probes: { passed: 0, drift: [] } }).run_status === S.HUMAN)
ok('absent probes ⇒ HUMAN (fresh_probes_not_run)', M.qualifyRun({ ...baseInput, probes: undefined }).status_reason === 'insufficient_evidence:fresh_probes_not_run')
// at least one judge-side perturbation must have run
ok('no perturbation ran ⇒ HUMAN (perturbations_not_run)', M.qualifyRun({ ...baseInput, perturbations: { alt_model: 'not_run' } }).status_reason === 'insufficient_evidence:perturbations_not_run')
// TYPE-STRICT: a wrong-typed failure signal must NOT coerce to "no failure"
ok('string failed_families ⇒ NOT QUALIFIED', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, failed_families: 'truth/integrity/MFT-fabrication' } }).run_status !== S.QUALIFIED)
ok('string drift "persona_drift" ⇒ NOT QUALIFIED', M.qualifyRun({ ...baseInput, probes: { passed: 0, total: 7, drift: 'persona_drift' } }).run_status !== S.QUALIFIED)
ok('string author_vetoes ⇒ NOT QUALIFIED', M.qualifyRun({ ...baseInput, taste: { author_vetoes: 'champ' } }).run_status !== S.QUALIFIED)
// TOTALITY: a non-object input (incl. null) maps to a state, never throws
ok('qualifyRun(null) ⇒ HUMAN (no throw)', (() => { try { return M.qualifyRun(null).run_status === S.HUMAN } catch { return false } })())
ok('qualifyRun(undefined) ⇒ HUMAN', M.qualifyRun(undefined).run_status === S.HUMAN)
ok('qualifyRun(42) ⇒ HUMAN', M.qualifyRun(42).run_status === S.HUMAN)
// BLOCKED DOMINANCE: a persona-drift breach wins over a co-occurring insufficiency, never masked to a softer state
ok('persona_drift breach + evidence_sufficient:false ⇒ BLOCKED (dominance)', M.qualifyRun({ ...baseInput, evidence_sufficient: false, probes: { passed: 6, total: 7, drift: [{ type: 'persona_drift' }] } }).run_status === S.BLOCKED)
// HONEST GAP: a directional-unscored conformance flags a first-class blind spot
ok('directional_not_scored ⇒ taste blind spot recorded', M.qualifyRun({ ...baseInput, conformance: { ...PASS_CONF, directional_not_scored: 15 } }).known_blind_spots.includes('taste_direction_positive_controls_unscored'))
ok('no directional gap ⇒ no spurious blind spot', !M.qualifyRun(baseInput).known_blind_spots.includes('taste_direction_positive_controls_unscored'))

// ── (g) the happy path ───────────────────────────────────────────────────────────────────────────
console.log('all-pass stable run:')
ok('all pass + stable ⇒ QUALIFIED_FOR_THIS_RUN', M.qualifyRun(baseInput).run_status === S.QUALIFIED)
ok('QUALIFIED reason names all three evidence channels', M.qualifyRun(baseInput).status_reason === 'conformance_probes_perturbations_passed')

// ── (h) the card: full envelope, honest language ─────────────────────────────────────────────────
console.log('assurance card shape + honest language:')
const card = M.qualifyRun(baseInput)
const envKeys = ['packet_completeness', 'packet_provenance', 'field_diversity', 'generator_identity', 'evaluator_config_id', 'gate_false_dq_behavior', 'pair_order_stability', 'paraphrase_stability', 'preference_cycles', 'bracket_seed_sensitivity', 'alt_model', 'escalation']
ok('operating_envelope carries every declared field', envKeys.every(k => k in card.operating_envelope))
ok('adversarial_audit is a first-class not_run field', card.adversarial_audit === 'not_run')
ok('anchor_bank_version is carried', card.anchor_bank_version === 'cafebabecafebabe')
ok('expires_on names the model/prompt change trigger', card.expires_on && card.expires_on.model_or_prompt_change === true)
ok('taste reads "agreement_with_named_adjudicators"', 'agreement_with_named_adjudicators' in card.taste)
ok('top_set is inert (null) forward-compat', card.top_set === null)
const blob = JSON.stringify(card)
ok('no "certified" language', !/certif/i.test(blob))
ok('no "accuracy" language', !/accuracy/i.test(blob))
ok('no "recall" language', !/recall/i.test(blob))
ok('taste field is not "accuracy"/"recall"', !('accuracy' in card.taste) && !('recall' in card.taste))

// ── (i) runPerturbations is champion-only + faithful-judge-stable ────────────────────────────────
console.log('runPerturbations (champion-only):')
const xpart = prompt => prompt.slice(0, prompt.indexOf('ENTRY Y:'))
ctl.judge = async prompt => ({ winner: xpart(prompt).includes('CHAMP') ? 'X' : 'Y', margin: 'decisive', reason: 'r' })   // content-keyed ⇒ stable
const A = { id: 'A', label: 'A', markdown: 'CHAMP wins', rating: 1500 }
const B = { id: 'B', label: 'B', markdown: 'other', rating: 1500 }
const pNone = await M.runPerturbations(A, B, { paraphrase: true, altModel: null })
ok('mirrored_order computed', pNone.mirrored_order && typeof pNone.mirrored_order.flipped === 'boolean')
ok('faithful (content-keyed) judge ⇒ mirrored_order does NOT flip', pNone.mirrored_order.flipped === false)
ok('paraphrase computed when requested', pNone.paraphrase !== 'not_run')
ok('alt_model is not_run when no second model configured', pNone.alt_model === 'not_run')
const pAlt = await M.runPerturbations(A, B, { paraphrase: false, altModel: 'model-2' })
ok('alt_model runs when a second model IS configured', pAlt.alt_model !== 'not_run')
ok('paraphrase is not_run when not requested', pAlt.paraphrase === 'not_run')
// position-biased judge ⇒ mirrored swap flips the winner (the genuine order-reversal signal)
ctl.judge = async () => ({ winner: 'X', margin: 'decisive', reason: 'r' })
const pBias = await M.runPerturbations(A, B, { paraphrase: false, altModel: null })
ok('position-biased judge ⇒ mirrored_order flips', pBias.mirrored_order.flipped === true)
// the guard working: playMatch counterbalances orderIdx, so pure position bias yields SPLIT (narrow)
// final margins ⇒ the flip is WITHIN the near-tie band ⇒ NOT a confident UNSTABLE (order-noise alone).
ok('order-noise flip is WITHIN the band (margin-band guard)', pBias.mirrored_order.band === 'within')
ok('⇒ this flip does NOT escalate to UNSTABLE', M.qualifyRun({ ...baseInput, perturbations: { mirrored_order: pBias.mirrored_order } }).run_status === S.QUALIFIED)

// ── (j) the card round-trips through qualify.writeCard ───────────────────────────────────────────
console.log('card persists via qualify.writeCard:')
const baseDir = mkdtempSync(join(tmpdir(), 'wc-assurance-'))
try {
  const file = q.writeCard(card, baseDir)
  ok('writeCard accepts the qualifyRun card', typeof file === 'string')
  ok('card reads back byte-equal', JSON.stringify(q.readCard(file)) === JSON.stringify(card))
} finally { rmSync(baseDir, { recursive: true, force: true }) }

ok('QUALIFY is off by default', M.QUALIFY === false)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
