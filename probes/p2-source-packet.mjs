// PLAN_3 U20 (P2) probe — the structured SOURCE_PACKET + the MECHANICAL fact-ledger proof.
//
// Loads the REAL worldcup/references/workflow-template.js (prelude up to `let pool`), de-exports
// `meta`, and wraps it in a sandbox whose mocked `agent` CAPTURES every call. Then it checks:
//   (a) byte-identity — the default (unfilled) packet renders today's exact ledger prose, and the
//       module CRITERIA_BLOCK is unchanged (the qualifier is opt-in; a no-packet run is unchanged);
//   (b) the mechanical proof — ledgerLookup is set-membership/substring over the structured packet,
//       returns SUPPORTED|UNSUPPORTED with provenance, makes ZERO agent() calls, and does NOT excuse
//       a bigger fabricated span just because it contains an allowed entity (one-directional match);
//   (c) one source of truth — a populated packet's rendered prose contains exactly what ledgerLookup
//       treats as supported, so the judges' prose and the mechanical check can never disagree;
//   (d) EVALUATOR threading (P1) — the default carries the packet, validateEvaluatorConfig validates
//       its shape, and the check is OPTIONAL so a prose-only custom config still validates.
//
//   run:  node probes/p2-source-packet.mjs
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
const agent = async (prompt, opts) => { __cap.push({ prompt, opts }); return {}; };
const parallel = async (thunks) => Promise.all(thunks.map(f => f()));
`
const footer = `
;return { SOURCE_PACKET, renderLedger, ledgerLookup, EVALUATOR, validateEvaluatorConfig,
  CRITERIA_BASE, CRITERIA_BLOCK, makeFlawSchema, LENS_SCHEMA, SEED_SCHEMA, DEFAULT_NOT_ALLOWED };
`
const captured = []
// eslint-disable-next-line no-new-func
const M = new Function('captured', mockHeader + prelude + footer)(captured)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }

// The exact ledger block U20 replaced with a render — the byte-identity anchor (must reproduce).
const ORIG_LEDGER = `- FACT LEDGER (what is actually true; everything concrete must trace here): FILL.
- NOT ALLOWED unless in the ledger: invented line numbers, class/file names, stack
  traces, error messages, dates, names, places, quotes, scenes, or any concrete detail
  presented as lived fact. Manufactured specificity is a flaw, not a strength.`

// ── (a) byte-identity: the unfilled default renders today's exact prose ──────────────────────
console.log('byte-identity (default packet renders today\'s ledger):')
ok('renderLedger(default) === original block', M.renderLedger(M.SOURCE_PACKET) === ORIG_LEDGER)
ok('renderLedger() (no arg) defaults to packet', M.renderLedger() === ORIG_LEDGER)
ok('CRITERIA_BASE still contains the block',   M.CRITERIA_BASE.includes(ORIG_LEDGER))
ok('EVALUATOR.criteriaBlock === CRITERIA_BLOCK', M.EVALUATOR.criteriaBlock === M.CRITERIA_BLOCK)
ok('default packet: empty supported_facts',    M.SOURCE_PACKET.supported_facts.length === 0)
ok('default packet: not_allowed is the default', M.SOURCE_PACKET.not_allowed === M.DEFAULT_NOT_ALLOWED)
ok('default packet: target is null (no TARGET)', M.SOURCE_PACKET.target === null)
ok('loading the module made ZERO agent calls', captured.length === 0)

// ── (b) the MECHANICAL proof — set-membership, no LLM, one-directional entity match ──────────
console.log('mechanical ledgerLookup (no LLM call):')
const before = captured.length
// default (unfilled) packet: nothing concrete is declared true, so every span is UNSUPPORTED
ok('default: "three days" UNSUPPORTED',  M.ledgerLookup('three days').status === 'UNSUPPORTED')
ok('default: "Parser.ts" UNSUPPORTED',   M.ledgerLookup('Parser.ts').status === 'UNSUPPORTED')
ok('empty span UNSUPPORTED',             M.ledgerLookup('   ').status === 'UNSUPPORTED')

const packet = {
  supported_facts: ['the build took three days and then stalled'],
  allowed_entities: { files: ['Parser.ts'], names: ['Mara'] },
  not_allowed: M.DEFAULT_NOT_ALLOWED, target: null,
}
const sup = M.ledgerLookup('three days', packet)
ok('fact substring -> SUPPORTED',        sup.status === 'SUPPORTED')
ok('fact match carries provenance',      sup.provenance && sup.provenance.kind === 'fact')
const ent = M.ledgerLookup('Parser.ts', packet)
ok('allowed entity -> SUPPORTED',        ent.status === 'SUPPORTED')
ok('entity provenance names the bucket', ent.provenance && ent.provenance.kind === 'files')
ok('entity match is case-insensitive',   M.ledgerLookup('parser.ts', packet).status === 'SUPPORTED')
ok('planted "line 417" UNSUPPORTED',     M.ledgerLookup('line 417', packet).status === 'UNSUPPORTED')
// one-directional: a fabricated span is NOT excused just because it embeds an allowed entity
ok('"line 417 of Parser.ts" UNSUPPORTED', M.ledgerLookup('line 417 of Parser.ts', packet).status === 'UNSUPPORTED')
ok('unrelated name UNSUPPORTED',         M.ledgerLookup('Devon', packet).status === 'UNSUPPORTED')
ok('whole token "Parser" supported by "Parser.ts"', M.ledgerLookup('Parser', packet).status === 'SUPPORTED')
// word-boundary soundness (the /invariance finding): a coincidental character fragment must NOT
// excuse a fabrication — '417' is not supported by a fact mentioning '4170', '201' not by '2019'.
const frag = { supported_facts: ['we ran 4170 iterations'], allowed_entities: { dates: ['2019'] }, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }
ok('numeric fragment "417" NOT excused by "4170"', M.ledgerLookup('417', frag).status === 'UNSUPPORTED')
ok('prefix fragment "201" NOT excused by "2019"',  M.ledgerLookup('201', frag).status === 'UNSUPPORTED')
ok('exact "4170" still SUPPORTED',                 M.ledgerLookup('4170', frag).status === 'SUPPORTED')
ok('exact "2019" still SUPPORTED',                 M.ledgerLookup('2019', frag).status === 'SUPPORTED')
ok('ledgerLookup made ZERO agent calls', captured.length === before)

// ── (c) one source of truth — the prose the judges read matches what ledgerLookup checks ─────
console.log('one source of truth (rendered prose matches the structured packet):')
const prose = M.renderLedger(packet)
ok('rendered prose lists the supported fact', prose.includes('the build took three days and then stalled'))
ok('rendered prose lists the allowed file',   prose.includes('Parser.ts'))
ok('rendered prose lists the allowed name',   prose.includes('Mara'))
ok('rendered prose omits the planted "line 417"', !prose.includes('line 417'))
ok('populated render differs from FILL block', prose !== ORIG_LEDGER)
// consistency: everything the prose presents as supported, ledgerLookup confirms; the planted one it doesn't
for (const span of ['three days', 'Parser.ts', 'Mara'])
  ok(`prose+lookup agree SUPPORTED: "${span}"`, prose.includes(span.includes('three') ? 'three days' : span) && M.ledgerLookup(span, packet).status === 'SUPPORTED')

// ── (d) EVALUATOR threading (P1) + validation (optional but shape-checked when present) ───────
console.log('EVALUATOR threading + validation:')
const throws = fn => { try { fn(); return false } catch { return true } }
ok('EVALUATOR.sourcePacket === SOURCE_PACKET', M.EVALUATOR.sourcePacket === M.SOURCE_PACKET)
ok('default config validates (has packet)',    M.validateEvaluatorConfig(M.EVALUATOR) === M.EVALUATOR)
// a complete prose-only custom config (NO sourcePacket) — optionality: must still validate
const vbase = { criteriaBlock: 'c', incumbentClause: '', targetGateClause: '',
  hardDqCategories: ['X'], dqFamily: { X: 'fam' }, preflightHardDqCategory: 'X',
  lenses: { a: 'lens A' }, panelFor: () => ['a'], tiebreakLens: 'a', screeners: 3,
  bans: { emDash: true, vocab: [] }, agentOptions: {}, lensWeight: () => 1,
  schemas: { flaw: M.makeFlawSchema(['X']), lens: M.LENS_SCHEMA, seed: M.SEED_SCHEMA } }
ok('prose-only config (no packet) validates',  !throws(() => M.validateEvaluatorConfig({ ...vbase })))
const withPacket = sp => ({ ...vbase, sourcePacket: sp })
ok('valid structured packet validates',        !throws(() => M.validateEvaluatorConfig(withPacket(M.SOURCE_PACKET))))
ok('packet not an object throws',              throws(() => M.validateEvaluatorConfig(withPacket('nope'))))
ok('supported_facts not array throws',         throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: 'x', allowed_entities: {}, not_allowed: [] }))))
ok('not_allowed not array throws',             throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: {}, not_allowed: 'x' }))))
ok('allowed_entities not object throws',       throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: 5, not_allowed: [] }))))
ok('non-array entity bucket throws',           throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: { files: 'x' }, not_allowed: [] }))))

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
