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
// whole-value entity + token-run fact semantics (the code-review finding): a FRAGMENT of a compound
// value — filename, date, path, version, accented/CJK name — must NOT excuse a fabrication. Entities
// match whole-value; facts match a contiguous run of whitespace tokens (punctuation stays in-token).
ok('"Parser" (sub-token) NOT excused by "Parser.ts"', M.ledgerLookup('Parser', packet).status === 'UNSUPPORTED')
const frag = { supported_facts: ['we ran 4170 iterations', 'shipped v1.2.3 today'],
  allowed_entities: { dates: ['2024-03-15'], files: ['config.test.ts', '/api/v2/users'], names: ['Émile', 'São Paulo'] },
  not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }
const U = s => M.ledgerLookup(s, frag).status === 'UNSUPPORTED'
const S = s => M.ledgerLookup(s, frag).status === 'SUPPORTED'
ok('numeric fragment "417" NOT excused by "4170"',  U('417'))
ok('day fragment "15" NOT excused by "2024-03-15"', U('15'))
ok('"test.ts" NOT excused by "config.test.ts"',     U('test.ts'))
ok('path segment "users" NOT excused by "/api/v2/users"', U('users'))
ok('version fragment "2.3" NOT excused by "v1.2.3"', U('2.3'))
ok('symbol-only span "," is UNSUPPORTED',           U(','))
ok('diacritic fragment "mile" NOT excused by "Émile"', U('mile'))
ok('initial "S" NOT excused by "São Paulo"',        U('S'))
ok('whole entity "config.test.ts" SUPPORTED',       S('config.test.ts'))
ok('whole entity "2024-03-15" SUPPORTED',           S('2024-03-15'))
ok('accented entity "São Paulo" (case/space) SUPPORTED', S('São Paulo'))
ok('exact fact token "4170" SUPPORTED',             S('4170'))
ok('full fact phrase SUPPORTED',                    S('we ran 4170 iterations'))
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
// Finding 3: multiple bucket members render ONE PER LINE — no comma-joined phrase a juror reads as one
// supported string but ledgerLookup (matching one member at a time, whole-value) would never confirm.
const multi = M.renderLedger({ supported_facts: [], allowed_entities: { files: ['Parser.ts', 'Lexer.ts'] }, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null })
ok('multi-member entities render one per line', multi.includes('- files: Parser.ts') && multi.includes('- files: Lexer.ts'))
ok('no comma-joined entity phrase',             !multi.includes('Parser.ts, Lexer.ts'))
// Re-review Finding A: an EXPLICIT empty not_allowed is preserved — judges are NOT told to enforce the
// default 9 banned classes the structured packet cleared (single-source-of-truth for custom configs).
const emptyNA = M.renderLedger({ supported_facts: ['a real fact'], allowed_entities: {}, not_allowed: [], target: null })
ok('explicit empty not_allowed is preserved',   !emptyNA.includes('invented line numbers'))
ok('empty not_allowed still bans concrete detail', emptyNA.includes('NOT ALLOWED unless in the ledger: any concrete detail'))
ok('non-empty not_allowed still enumerates',    M.renderLedger({ supported_facts: ['f'], allowed_entities: {}, not_allowed: ['secrets'], target: null }).includes('NOT ALLOWED unless in the ledger: secrets, or any concrete detail'))
// Finding 4: render is defensive — a raw (un-validated) packet (non-array na/bucket) must not throw.
ok('renderLedger does not throw on a raw packet', (() => { try { M.renderLedger({ not_allowed: 'dates', allowed_entities: ['x'] }); return true } catch { return false } })())
// Finding 6: byte-identity short-circuit compares not_allowed BY VALUE — a JSON-roundtripped default
// (value-equal, not reference-equal) still renders today's prose, so "a no-packet run is unchanged" holds.
ok('JSON-roundtripped default renders byte-identical', M.renderLedger(JSON.parse(JSON.stringify(M.SOURCE_PACKET))) === ORIG_LEDGER)

// ── (d) EVALUATOR threading (P1) + validation (single source of truth, shape, member types) ───
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
// withPacket gives the config a criteriaBlock that DOES contain the packet's rendered ledger (the
// single-source-of-truth contract) unless an explicit (mismatched) criteriaBlock is passed.
const withPacket = (sp, crit) => ({ ...vbase, sourcePacket: sp, criteriaBlock: crit !== undefined ? crit : ('lead\n' + M.renderLedger(sp) + '\ntail') })
ok('valid packet (criteria⊇ledger) validates', !throws(() => M.validateEvaluatorConfig(withPacket(M.SOURCE_PACKET))))
ok('populated packet rendered into criteria validates', !throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: ['real fact'], allowed_entities: { files: ['App.ts'] }, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }))))
// Finding 2b: a populated packet whose criteria does NOT contain its rendered ledger is a desync (throws)
ok('packet/criteria desync throws',            throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: ['secret fact'], allowed_entities: {}, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }, 'stale prose, no ledger'))))
// shape
ok('packet not an object throws',              throws(() => M.validateEvaluatorConfig(withPacket('nope'))))
ok('packet as ARRAY throws',                   throws(() => M.validateEvaluatorConfig(withPacket([]))))
ok('supported_facts not array throws',         throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: 'x', allowed_entities: {}, not_allowed: [] }))))
ok('not_allowed not array throws',             throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: {}, not_allowed: 'x' }))))
ok('allowed_entities not object throws',       throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: 5, not_allowed: [] }))))
ok('allowed_entities as ARRAY throws',         throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: ['x'], not_allowed: [] }))))
ok('non-array entity bucket throws',           throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: { files: 'x' }, not_allowed: [] }))))
// Finding 2a: members must be non-empty strings (else render emits null/[object Object] + inverts support)
ok('null fact member throws',                  throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [null], allowed_entities: {}, not_allowed: [] }))))
ok('number fact member throws',                throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [123], allowed_entities: {}, not_allowed: [] }))))
ok('object entity member throws',              throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: { files: [{ path: 'x' }] }, not_allowed: [] }))))
ok('non-string not_allowed member throws',     throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: [], allowed_entities: {}, not_allowed: [5] }))))
ok('empty-string fact member throws',          throws(() => M.validateEvaluatorConfig(withPacket({ supported_facts: ['   '], allowed_entities: {}, not_allowed: [] }))))

// Finding (review #1): no-arg ledgerLookup follows the ACTIVE EVALUATOR.sourcePacket, not a stale default
console.log('no-arg ledgerLookup follows the active evaluator (not a stale default):')
ok('before reassign: certified fact UNSUPPORTED', M.ledgerLookup('certified only fact').status === 'UNSUPPORTED')
const savedPacket = M.EVALUATOR.sourcePacket
M.EVALUATOR.sourcePacket = { supported_facts: ['certified only fact'], allowed_entities: {}, not_allowed: M.DEFAULT_NOT_ALLOWED, target: null }
ok('after reassign: no-arg lookup follows it', M.ledgerLookup('certified only fact').status === 'SUPPORTED')
ok('explicit packet arg still overrides',      M.ledgerLookup('certified only fact', M.SOURCE_PACKET).status === 'UNSUPPORTED')
M.EVALUATOR.sourcePacket = savedPacket
ok('restore: no-arg lookup back to default',   M.ledgerLookup('certified only fact').status === 'UNSUPPORTED')
// Re-review Finding B: a prose-only active evaluator (no sourcePacket, which validation allows) must NOT
// fall back to the module template — a FILLED module SOURCE_PACKET must not leak facts the active judge omits.
M.SOURCE_PACKET.supported_facts.push('stale module fact')
M.EVALUATOR.sourcePacket = undefined
ok('prose-only evaluator does not see stale module fact', M.ledgerLookup('stale module fact').status === 'UNSUPPORTED')
M.SOURCE_PACKET.supported_facts.pop()
M.EVALUATOR.sourcePacket = savedPacket

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
