// PLAN_3 U20 (P2) probe — the structured SOURCE_PACKET and the prose rubric it renders.
//
// (The mechanical fact-ledger lookup and the whole opt-in qualifier subsystem were removed in the
// trim — this probe now covers only the WIRED surface: SOURCE_PACKET is the single source of truth the
// rubric prose is rendered from.) Loads the REAL worldcup/references/workflow-template.js (prelude up to
// `let pool`), de-exports `meta`, wraps it in a sandbox whose mocked `agent` CAPTURES calls. Checks:
//   (a) byte-identity — the default (unfilled) packet renders today's exact ledger prose, and the module
//       CRITERIA_BLOCK is unchanged (a no-packet run is byte-for-byte unchanged);
//   (b) one source of truth — a populated packet's rendered prose lists exactly its facts/entities, one
//       per line, with the planted-but-absent detail omitted;
//   (c) EVALUATOR threading + validation — the default carries the packet, validateEvaluatorConfig
//       validates its shape, the check is OPTIONAL (a prose-only config still validates), and a
//       packet/criteria desync is rejected.
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
;return { SOURCE_PACKET, renderLedger, EVALUATOR, validateEvaluatorConfig,
  CRITERIA_BASE, CRITERIA_BLOCK, makeFlawSchema, LENS_SCHEMA, SEED_SCHEMA, DEFAULT_NOT_ALLOWED };
`
const captured = []
// eslint-disable-next-line no-new-func
const M = new Function('captured', mockHeader + prelude + footer)(captured)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const throws = fn => { try { fn(); return false } catch { return true } }

// The exact ledger block the default (unfilled) packet must reproduce — the byte-identity anchor.
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
ok('JSON-roundtripped default renders byte-identical', M.renderLedger(JSON.parse(JSON.stringify(M.SOURCE_PACKET))) === ORIG_LEDGER)

// ── (b) one source of truth — the prose lists exactly the packet's facts/entities ────────────
console.log('one source of truth (rendered prose matches the structured packet):')
const packet = {
  supported_facts: ['the build took three days and then stalled'],
  allowed_entities: { files: ['Parser.ts'], names: ['Mara'] },
  not_allowed: M.DEFAULT_NOT_ALLOWED, target: null,
}
const prose = M.renderLedger(packet)
ok('rendered prose lists the supported fact', prose.includes('the build took three days and then stalled'))
ok('rendered prose lists the allowed file',   prose.includes('Parser.ts'))
ok('rendered prose lists the allowed name',   prose.includes('Mara'))
ok('rendered prose omits a planted absent detail', !prose.includes('line 417'))
ok('populated render differs from FILL block', prose !== ORIG_LEDGER)
// multiple bucket members render ONE PER LINE — no comma-joined phrase
const multi = M.renderLedger({ supported_facts: [], allowed_entities: { files: ['Parser.ts', 'Lexer.ts'] }, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null })
ok('multi-member entities render one per line', multi.includes('- files: Parser.ts') && multi.includes('- files: Lexer.ts'))
ok('no comma-joined entity phrase',             !multi.includes('Parser.ts, Lexer.ts'))
// an EXPLICIT empty not_allowed is preserved — judges are NOT told to enforce the default banned classes
const emptyNA = M.renderLedger({ supported_facts: ['a real fact'], allowed_entities: {}, not_allowed: [], target: null })
ok('explicit empty not_allowed is preserved',   !emptyNA.includes('invented line numbers'))
ok('empty not_allowed still bans concrete detail', emptyNA.includes('NOT ALLOWED unless in the ledger: any concrete detail'))
ok('non-empty not_allowed still enumerates',    M.renderLedger({ supported_facts: ['f'], allowed_entities: {}, not_allowed: ['secrets'], target: null }).includes('NOT ALLOWED unless in the ledger: secrets, or any concrete detail'))
// render is defensive — a raw (un-validated) packet must not throw
ok('renderLedger does not throw on a raw packet', (() => { try { M.renderLedger({ not_allowed: 'dates', allowed_entities: ['x'] }); return true } catch { return false } })())

// ── (c) EVALUATOR threading + validation (shape, optionality, single-source-of-truth desync) ──
console.log('EVALUATOR threading + validation:')
ok('EVALUATOR.sourcePacket === SOURCE_PACKET', M.EVALUATOR.sourcePacket === M.SOURCE_PACKET)
ok('default config validates (has packet)',    M.validateEvaluatorConfig(M.EVALUATOR) === M.EVALUATOR)
// a complete prose-only custom config (NO sourcePacket) — optionality: must still validate
const vbase = { criteriaBlock: 'c', incumbentClause: '', targetGateClause: '',
  hardDqCategories: ['X'], dqFamily: { X: 'fam' }, preflightHardDqCategory: 'X',
  lenses: { a: 'lens A' }, panelFor: () => ['a'], tiebreakLens: 'a', screeners: 3,
  bans: { emDash: true, vocab: [] }, agentOptions: {}, lensWeight: () => 1,
  schemas: { flaw: M.makeFlawSchema(['X']), lens: M.LENS_SCHEMA, seed: M.SEED_SCHEMA } }
ok('prose-only config (no packet) validates',  !throws(() => M.validateEvaluatorConfig({ ...vbase })))
const withPacket = (sp, crit) => ({ ...vbase, sourcePacket: sp, criteriaBlock: crit !== undefined ? crit : ('lead\n' + M.renderLedger(sp) + '\ntail') })
ok('valid packet (criteria⊇ledger) validates', !throws(() => M.validateEvaluatorConfig(withPacket(M.SOURCE_PACKET))))
ok('populated packet rendered into criteria validates', !throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: ['real fact'], allowed_entities: { files: ['App.ts'] }, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }))))
// a populated packet whose criteria does NOT contain its rendered ledger is a desync (throws)
ok('packet/criteria desync throws',            throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: ['secret fact'], allowed_entities: {}, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }, 'stale prose, no ledger'))))
// shape
ok('packet not an object throws',              throws(() => M.validateEvaluatorConfig(withPacket('nope'))))
ok('packet as ARRAY throws',                   throws(() => M.validateEvaluatorConfig(withPacket([]))))
ok('supported_facts not array throws',         throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: 'x', allowed_entities: {}, not_allowed: [] }))))
ok('not_allowed not array throws',             throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: {}, not_allowed: 'x' }))))
ok('allowed_entities not object throws',       throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: 5, not_allowed: [] }))))
ok('allowed_entities as ARRAY throws',         throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: ['x'], not_allowed: [] }))))
ok('non-array entity bucket throws',           throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: { files: 'x' }, not_allowed: [] }))))
ok('null fact member throws',                  throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [null], allowed_entities: {}, not_allowed: [] }))))
ok('number fact member throws',                throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [123], allowed_entities: {}, not_allowed: [] }))))
ok('object entity member throws',              throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: { files: [{ path: 'x' }] }, not_allowed: [] }))))
ok('non-string not_allowed member throws',     throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: {}, not_allowed: [5] }))))
ok('empty-string fact member throws',          throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: ['   '], allowed_entities: {}, not_allowed: [] }))))

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
