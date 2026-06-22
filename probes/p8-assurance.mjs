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

const PASS_CONF = { verdict: 'PASS', passed: 12, failed_families: [] }
const BLOCK_CONF = { verdict: 'BLOCKED', passed: 8, failed_families: ['truth/integrity/MFT-fabrication'] }
const CLEAN_PROBES = { passed: 7, drift: [] }
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
ok('material author/editor disagreement ⇒ HUMAN_REVIEW_REQUIRED', M.qualifyRun({ ...baseInput, author_disagreement: true }).run_status === S.HUMAN)
ok('insufficient evidence ⇒ HUMAN_REVIEW_REQUIRED', M.qualifyRun({ ...baseInput, evidence_sufficient: false }).run_status === S.HUMAN)

// ── (g) the happy path ───────────────────────────────────────────────────────────────────────────
console.log('all-pass stable run:')
ok('all pass + stable ⇒ QUALIFIED_FOR_THIS_RUN', M.qualifyRun(baseInput).run_status === S.QUALIFIED)

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
