// PLAN_3 U23 (P7) probe — fresh, run-scoped ecological probes detect DRIFT (not adaptive exploitation),
// are judged through the live config, and can NEVER enter the durable bank.
//
// Loads the REAL workflow-template.js prelude (buildProbes/judgeProbes), wraps it in a sandbox whose
// mocked `agent` CAPTURES calls and delegates to a reconfigurable judge (so the probe can simulate a
// faithful vs a drifty live config), and ALSO requires anchorbank.js to prove a probe is not corpus.
// Checks: (a) coverage (all probe types incl. ≥1 persona-drift + ≥1 A/B-reversal) and determinism with an
// injected generator (zero agent calls); (b) probes are run-scoped, carry no family, and anchorbank
// REFUSES to ingest them; (c) the default generator DOES call the live agent; (d) a faithful judge ⇒ no
// drift; (e) a drifty judge ⇒ persona-drift missed, dir reversed, and order-flip recorded as drift;
// (f) the report is scope:'drift' + adversarial_audit:'not_run' (NOT the audit).
//
//   run:  node probes/p7-ecological.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ab = require(join(here, '..', 'worldcup', 'references', 'anchorbank.js'))
const TEMPLATE = join(here, '..', 'worldcup', 'references', 'workflow-template.js')

let src = readFileSync(TEMPLATE, 'utf8').replace(/^export const meta/m, 'const meta')
const cut = src.indexOf('\nlet pool')
if (cut < 0) throw new Error('probe: could not find the `let pool` orchestration marker to slice the prelude')
const prelude = src.slice(0, cut)

const mockHeader = `
const __cap = captured, __ctl = ctl;
const log = () => {}, phase = () => {};
let args = [];
const agent = async (prompt, opts) => { __cap.push({ prompt, opts }); return __ctl.judge(prompt, opts); };
const parallel = async (thunks) => Promise.all(thunks.map(f => f()));
`
const footer = `
;return { QUALIFY, buildProbes, judgeProbes, PROBE_TYPES, EVALUATOR, DEFAULT_NOT_ALLOWED };
`
const captured = []
const ctl = { judge: async () => ({}) }
// eslint-disable-next-line no-new-func
const M = new Function('captured', 'ctl', mockHeader + prelude + footer)(captured, ctl)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const throws = fn => { try { fn(); return false } catch { return true } }
const reset = () => { captured.length = 0 }

const packet = { supported_facts: ['a real fact'], allowed_entities: { files: ['App.ts'] }, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }
const incumbent = 'A plain honest passage in the author own voice.'

// Injected deterministic generator (no agent): distinct markers so the mock judge can steer verdicts.
//   dir  → a:'AAA …' (should win), b:'BBB …' (should lose)
//   inv  → a:'INVA …', b:'INVB …'  (verdict must be order-stable)
//   gate → a:'DRIFTY …'            (must be caught)
const genFixture = async t => t.kind === 'gate' ? { a: 'DRIFTY ' + t.type }
  : t.kind === 'inv' ? { a: 'INVA ' + t.type, b: 'INVB ' + t.type } : { a: 'AAA ' + t.type, b: 'BBB ' + t.type }

// ── (a) coverage + determinism with an injected generator ─────────────────────────────────────
console.log('coverage + determinism (injected generator, no agent):')
reset()
const probes = await M.buildProbes({ incumbent, packet, generate: genFixture })
ok('buildProbes(injected) made ZERO agent calls', captured.length === 0)
ok('covers every declared probe type', M.PROBE_TYPES.every(t => probes.some(p => p.type === t.type)))
ok('≥1 distributed-persona-drift probe', probes.some(p => p.type === 'persona_drift'))
ok('≥1 A/B-reversal probe', probes.some(p => p.type === 'ab_reversal'))
ok('deterministic (same generator ⇒ same JSON)', JSON.stringify(await M.buildProbes({ incumbent, packet, generate: genFixture })) === JSON.stringify(probes))

// ── (b) run-scoped, never durable: anchorbank refuses to ingest a probe ───────────────────────
console.log('run-scoped, un-persistable:')
ok('every probe is run_scoped', probes.every(p => p.run_scoped === true))
ok('no probe carries a family (cannot be a bank card)', probes.every(p => !('family' in p)))
ok('anchorbank REFUSES to ingest probes as corpus (no family)', throws(() => ab.buildBank({ packet, items: probes })))

// ── (c) the default generator calls the live agent ────────────────────────────────────────────
console.log('default generator uses the live agent:')
reset()
ctl.judge = async (prompt, opts) => (opts && opts.label && opts.label.startsWith('gen:')) ? { a: 'gen-a', b: 'gen-b' } : {}
await M.buildProbes({ incumbent, packet })
ok('default generator issued gen: agent calls', captured.some(c => c.opts && c.opts.label && c.opts.label.startsWith('gen:')))
ok('one generation call per probe type', captured.filter(c => c.opts && c.opts.label && c.opts.label.startsWith('gen:')).length === M.PROBE_TYPES.length)

// judges: flaw calls are labeled flaw*; lens calls carry two entries. Split the lens prompt at ENTRY Y.
const xpart = prompt => prompt.slice(0, prompt.indexOf('ENTRY Y:'))
const faithful = async (prompt, opts) => {
  if (opts && opts.label && String(opts.label).startsWith('flaw')) return { disqualified: /DRIFTY/.test(prompt), category: /DRIFTY/.test(prompt) ? 'FALSE_AUTHORIAL_EXPERIENCE' : 'NONE', flaw: 'x', confidence: 'high', note: '' }
  const aTok = prompt.includes('INVA') ? 'INVA' : 'AAA'                 // the entry that SHOULD prevail
  return { winner: xpart(prompt).includes(aTok) ? 'X' : 'Y', margin: 'clear', reason: 'r' }   // order-stable: keyed on content, not slot
}
const drifty = async (prompt, opts) => {
  if (opts && opts.label && String(opts.label).startsWith('flaw')) return { disqualified: false, category: 'NONE', flaw: '', confidence: 'high', note: '' }  // misses persona drift
  if (prompt.includes('BBB')) return { winner: xpart(prompt).includes('BBB') ? 'X' : 'Y', margin: 'clear', reason: 'r' }   // dir: pick the weak one
  return { winner: 'X', margin: 'clear', reason: 'r' }                  // inv: position bias ⇒ flips under reversed order
}

// ── (d) faithful judge ⇒ no drift ──────────────────────────────────────────────────────────────
console.log('faithful live config ⇒ no drift:')
ctl.judge = faithful
const good = await M.judgeProbes(probes)
ok('report scope is drift', good.scope === 'drift')
ok('adversarial_audit is not_run (NOT the audit)', good.adversarial_audit === 'not_run')
ok('no drift under a faithful judge', good.drift.length === 0)
ok('passed === total', good.passed === good.total && good.total === probes.length)

// ── (e) drifty judge ⇒ drift surfaced per failure mode ─────────────────────────────────────────
console.log('drifty live config ⇒ drift surfaced:')
ctl.judge = drifty
const bad = await M.judgeProbes(probes)
const driftTypes = new Set(bad.drift.map(d => d.type))
ok('persona-drift miss is recorded as drift', driftTypes.has('persona_drift'))
ok('a reversed directional call is recorded as drift', driftTypes.has('omission') || driftTypes.has('structural_improve') || driftTypes.has('judge_bait'))
ok('order-flip (A/B reversal) is recorded as drift', driftTypes.has('ab_reversal'))
ok('drift is reported, not asserted away', bad.drift.length > 0 && bad.passed < bad.total)
ok('still scope:drift + adversarial_audit:not_run', bad.scope === 'drift' && bad.adversarial_audit === 'not_run')

ok('QUALIFY is off by default', M.QUALIFY === false)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
