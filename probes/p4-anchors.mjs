// PLAN_3 U11a (P4) probe — the conformance CORPUS generator (buildAnchors) is a deterministic FALSIFIER:
// a card is a mutation SPECIFICATION + expected outcome + provenance, built with ZERO agent() calls, and
// its authority_status is DERIVED from the mechanical ledgerLookup — never launderable by a caller.
//
// Loads the REAL worldcup/references/workflow-template.js (prelude up to `let pool`), de-exports `meta`,
// wraps it in a sandbox whose mocked `agent` CAPTURES every call (so "no LLM call" is provable), and ALSO
// requires the real anchorbank.js (orchestrator-side) to prove the cards build a verifiable held-out bank.
// Then it checks: (a) zero agent() calls; (b) the authority/proof consistency invariant (the anti-
// laundering core) incl. EXECUTED counterexamples that must throw; (c) DIR controls for every construct +
// the 5 mandatory positive controls; (d) disaggregated taste votes + author veto; (e) no answer-key label
// leak; (f) the cards are a valid anchorbank corpus; (g) no-incumbent ⇒ [] and QUALIFY is off by default.
//
//   run:  node probes/p4-anchors.mjs
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
const __cap = captured;
const log = () => {}, phase = () => {};
let args = [];
const agent = async (prompt, opts) => { __cap.push({ prompt, opts }); return {}; };
const parallel = async (thunks) => Promise.all(thunks.map(f => f()));
`
const footer = `
;return { QUALIFY, buildAnchors, authorityFor, ledgerLookup, AUTHORITY, MECHANICAL_AUTHORITY,
  DIR_CONTROLS, EVALUATOR, INCUMBENT, SOURCE_PACKET, DEFAULT_NOT_ALLOWED };
`
const captured = []
// eslint-disable-next-line no-new-func
const M = new Function('captured', mockHeader + prelude + footer)(captured)

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const throws = fn => { try { fn(); return false } catch { return true } }
const reset = () => { captured.length = 0 }

ok('loading the module made ZERO agent calls', captured.length === 0)
ok('QUALIFY is off by default', M.QUALIFY === false)

// A populated U20-style packet + a real incumbent. Spans below are chosen to exercise both branches.
const packet = {
  supported_facts: ['the build took three days and then stalled', 'we ran 4170 iterations'],
  allowed_entities: { files: ['Parser.ts'], names: ['Mara'] },
  not_allowed: M.DEFAULT_NOT_ALLOWED, target: null,
}
const incumbent = 'A true essay about the three-day build, written plainly in the author\'s own voice.'

reset()
const cards = M.buildAnchors({ incumbent, packet, packetId: 'deadbeefdeadbeef' })

// ── (a) deterministic, zero agent() calls ──────────────────────────────────────────────────────
console.log('deterministic, no LLM:')
ok('buildAnchors made ZERO agent calls', captured.length === 0)
ok('returns a non-empty card array', Array.isArray(cards) && cards.length > 0)
const again = M.buildAnchors({ incumbent, packet, packetId: 'deadbeefdeadbeef' })
ok('deterministic (same input ⇒ same JSON)', JSON.stringify(cards) === JSON.stringify(again))

// ── (b) every card is well-formed; authority/proof consistency is the anti-laundering invariant ──
console.log('card shape + authority/proof consistency (anti-laundering):')
ok('every card has a non-empty string family', cards.every(c => typeof c.family === 'string' && c.family !== ''))
ok('every card has a valid authority_status', cards.every(c => Object.values(M.AUTHORITY).includes(c.authority_status)))
ok('every card kind ∈ {truth,taste}', cards.every(c => c.kind === 'truth' || c.kind === 'taste'))
ok('every card test_type ∈ {MFT,INV,DIR}', cards.every(c => ['MFT', 'INV', 'DIR'].includes(c.test_type)))
ok('every card stamps the passed source_packet_id', cards.every(c => c.source_packet_id === 'deadbeefdeadbeef'))
// the core invariant: mechanically-backed status ⟺ a real ledgerLookup proof; declarative ⟺ proof:null
ok('MECHANICAL status ⟺ proof present', cards.every(c => M.MECHANICAL_AUTHORITY.has(c.authority_status) === (c.proof !== null)))
ok('ASSERTED_TRUE/AUTHORIZED ⟹ proof.status SUPPORTED',
  cards.filter(c => c.authority_status === M.AUTHORITY.ASSERTED_TRUE || c.authority_status === M.AUTHORITY.AUTHORIZED)
    .every(c => c.proof && c.proof.ledger_lookup && c.proof.ledger_lookup.status === 'SUPPORTED'))
ok('FORBIDDEN ⟹ proof.status UNSUPPORTED',
  cards.filter(c => c.authority_status === M.AUTHORITY.FORBIDDEN)
    .every(c => c.proof && c.proof.ledger_lookup && c.proof.ledger_lookup.status === 'UNSUPPORTED'))
ok('UNKNOWN/EXTERNALLY_VERIFIED ⟹ proof null',
  cards.filter(c => c.authority_status === M.AUTHORITY.UNKNOWN || c.authority_status === M.AUTHORITY.EXTERNALLY_VERIFIED)
    .every(c => c.proof === null))
// the proof is the LITERAL mechanical result — recomputing ledgerLookup on the span must match (no LLM)
reset()
ok('every truth-card proof matches a fresh ledgerLookup (mechanical, no LLM)',
  cards.filter(c => c.proof).every(c => M.ledgerLookup(c.mutation.span, packet).status === c.proof.ledger_lookup.status))
ok('recomputing every proof made ZERO agent calls', captured.length === 0)
// gate expectations follow authority, honestly
ok('FORBIDDEN cards expect a DQ', cards.filter(c => c.authority_status === M.AUTHORITY.FORBIDDEN).every(c => c.expected.gate === 'DQ'))
ok('authorized cards expect a PASS', cards.filter(c => c.authority_status === M.AUTHORITY.ASSERTED_TRUE || c.authority_status === M.AUTHORITY.AUTHORIZED).every(c => c.expected.gate === 'PASS'))
ok('UNKNOWN/hedged MFT expects a PASS (false-accusation guard)',
  cards.filter(c => c.authority_status === M.AUTHORITY.UNKNOWN && c.test_type === 'MFT').every(c => c.expected.gate === 'PASS'))

// EXECUTED adversarial counterexamples — the launder paths must THROW, not silently emit a bad card
console.log('adversarial: authority laundering must throw:')
ok('cannot mint SUPPORTED authority over an absent span', throws(() => M.authorityFor('a span the packet never authorizes', packet, 'authorized')))
ok('cannot mark a packet-supported span FORBIDDEN', throws(() => M.authorityFor('three days', packet, 'forbidden')))
ok('an entity span minted AUTHORIZED only when SUPPORTED', M.authorityFor('Parser.ts', packet, 'authorized').authority_status === M.AUTHORITY.AUTHORIZED)
ok('a fact span minted ASSERTED_TRUE only when SUPPORTED', M.authorityFor('three days', packet, 'authorized').authority_status === M.AUTHORITY.ASSERTED_TRUE)

// ── (c) mandatory directional coverage ──────────────────────────────────────────────────────────
console.log('DIR coverage (every construct + the 5 mandatory controls):')
const dir = cards.filter(c => c.test_type === 'DIR')
for (const c of Object.keys(M.EVALUATOR.lenses)) ok(`DIR card exists for construct "${c}"`, dir.some(d => d.construct === c))
const ctrlIds = new Set(dir.map(d => d.expected.taste_comparison && d.expected.taste_comparison.direction))
for (const d of M.DIR_CONTROLS) ok(`mandatory positive control ${d.id} present`, ctrlIds.has(d.id))
ok('every DIR card names a winner≻loser direction', dir.every(d => d.expected.taste_comparison && d.expected.taste_comparison.winner && d.expected.taste_comparison.loser))

// ── (d) taste votes disaggregated + author veto; (e) no answer-key leak ──────────────────────────
console.log('disaggregated taste votes + no label leak:')
const taste = cards.filter(c => c.kind === 'taste')
ok('taste cards exist', taste.length > 0)
ok('taste cards carry a disaggregated editor_votes[] (one entry per juror, vote null)',
  taste.every(c => Array.isArray(c.editor_votes) && c.editor_votes.length >= 1 && c.editor_votes.every(v => typeof v.juror === 'string' && v.vote === null)))
ok('no collapsed single taste score (votes stay a per-juror array)', taste.every(c => !('score' in c) && !('taste_score' in c)))
ok('every card carries an author_veto boolean', cards.every(c => typeof c.author_veto === 'boolean'))
ok('truth cards carry no editor votes', cards.filter(c => c.kind === 'truth').every(c => Array.isArray(c.editor_votes) && c.editor_votes.length === 0))
const blob = JSON.stringify(cards)
ok('no "Original" answer-key label leaks', !blob.includes('Original'))
ok('no "Fabricated" answer-key label leaks', !blob.includes('Fabricated'))
ok('no "Bland" answer-key label leaks', !blob.includes('Bland'))

// ── (f) the cards are a valid, held-out anchorbank corpus ─────────────────────────────────────────
console.log('cards compose a verifiable held-out bank:')
let bank
ok('anchorbank.buildBank accepts the cards (all have string families)', !throws(() => { bank = ab.buildBank({ packet, items: cards }) }))
ok('the built bank verifies', !throws(() => ab.verify(bank)))
ok('partition counts sum to card count', Object.values(ab.partitionCounts(bank)).reduce((a, c) => a + c, 0) === cards.length)
const famCounts = {}
for (const c of cards) famCounts[c.family] = (famCounts[c.family] || 0) + 1
ok('partitioning is BY family — some family holds ≥2 items', Object.values(famCounts).some(n => n >= 2))
ok('held-out ∩ authored = ∅', ab.heldOutFamilies(bank).every(f => !new Set(ab.authoredFamilies(bank)).has(f)))

// ── (g) edges: no incumbent ⇒ [] (no throw); default packet ⇒ no authorized truth anchors ─────────
console.log('edges:')
ok('no incumbent ⇒ [] (no throw)', JSON.stringify(M.buildAnchors({ incumbent: '', packet })) === '[]')
ok('whitespace incumbent ⇒ []', JSON.stringify(M.buildAnchors({ incumbent: '   ', packet })) === '[]')
reset()
const dflt = M.buildAnchors({ incumbent })   // default (unfilled) packet: no supported facts/entities
ok('default packet ⇒ no ASSERTED_TRUE/AUTHORIZED cards', !dflt.some(c => c.authority_status === M.AUTHORITY.ASSERTED_TRUE || c.authority_status === M.AUTHORITY.AUTHORIZED))
ok('default packet still yields FORBIDDEN fabrication anchors', dflt.some(c => c.authority_status === M.AUTHORITY.FORBIDDEN))
ok('default packet still yields the DIR controls', dflt.filter(c => c.test_type === 'DIR').length >= M.DIR_CONTROLS.length)
ok('default-packet build still made ZERO agent calls', captured.length === 0)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
