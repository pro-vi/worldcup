// PLAN_3 U11b (P5) probe — the orchestrator bridge qualify.js composes anchorbank.js to persist the
// durable corpus, load a held-out partition bound to the LIVE packet, and write the run-assurance card.
//
// No harness dependency — qualify.js is orchestrator-side (real fs). Asserts: (a) persistAnchors
// round-trips to a verifiable committed bank and stamps `created` when absent; (b) loadCorpusForRun
// returns the held-out certification/canary partitions disjoint from authored dev/selection, binds to
// the packet (stale ⇒ throw), and refuses a vacuous bank; (c) anchorBankArg carries only what crosses
// the JSON seam; (d) writeCard round-trips atomically and validates its path components — EXECUTED
// counterexamples: a stale packet, a path-traversal run_id, a non-hex packet_id, and a tampered bank all throw.
//
//   run:  node probes/p5-qualify.mjs
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const q = require(join(here, '..', 'worldcup', 'references', 'qualify.js'))
const ab = require(join(here, '..', 'worldcup', 'references', 'anchorbank.js'))

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const throws = fn => { try { fn(); return false } catch { return true } }

const packetA = { supported_facts: ['the build took three days'], allowed_entities: { files: ['Parser.ts'] }, not_allowed: ['dates'], target: null }
const packetB = { supported_facts: ['a different truth'], allowed_entities: { files: ['Lexer.ts'] }, not_allowed: ['dates'], target: null }
// item-card shape is U11a's; anchorbank only reads .family/.kind/.human_adjudicated. 12 families ⇒ a
// non-empty certification partition (deterministic from packet_id, like p3).
const mkItems = () => Array.from({ length: 60 }, (_, i) => ({
  id: i, family: 'fam-' + (i % 12), kind: i % 2 ? 'truth' : 'taste',
  human_adjudicated: i % 4 === 0, mutation: { span: 's' + i, operator: 'plant_lived_fact' },
}))

const base = mkdtempSync(join(tmpdir(), 'wc-qualify-'))
try {
  // ── (a) persistAnchors round-trips + stamps created ──────────────────────────────────────────
  console.log('persistAnchors → durable committed bank:')
  const { file, bank } = q.persistAnchors({ packet: packetA, items: mkItems(), baseDir: base, provenance: { constructor: 'p5' } })
  ok('write path is anchors/<packet_id>/bank-v<version>.json', file === join(base, 'anchors', bank.packet_id, `bank-v${bank.version}.json`) && existsSync(file))
  ok('no .tmp left after atomic write', !readdirSync(join(base, 'anchors', bank.packet_id)).some(f => f.endsWith('.tmp')))
  ok('persisted bank verifies via anchorbank', ab.read(file).version === bank.version)
  ok('created is stamped when not supplied (ISO)', typeof bank.created === 'string' && /^\d{4}-\d\d-\d\dT/.test(bank.created))
  const explicit = q.persistAnchors({ packet: packetB, items: mkItems(), baseDir: base, created: '2026-06-21T00:00:00Z' })
  ok('explicit created is preserved', explicit.bank.created === '2026-06-21T00:00:00Z')
  ok('persistAnchors needs a baseDir', throws(() => q.persistAnchors({ packet: packetA, items: mkItems() })))

  // ── (b) loadCorpusForRun: held-out, packet-bound, non-vacuous ─────────────────────────────────
  console.log('loadCorpusForRun (held-out, packet-bound):')
  const loaded = q.loadCorpusForRun(file, packetA)
  ok('version/packet_id surfaced', loaded.version === bank.version && loaded.packet_id === bank.packet_id)
  ok('certification partition is held out + non-empty', Array.isArray(loaded.heldOut.certification) && loaded.heldOut.certification.length > 0)
  ok('every held-out cert item belongs to a certification family',
    loaded.heldOut.certification.every(it => bank.manifest[String(it.family)] === 'certification'))
  ok('canary partition is held out', loaded.heldOut.canary.every(it => bank.manifest[String(it.family)] === 'canary'))
  ok('authored = dev ∪ selection', loaded.authored.dev.every(it => bank.manifest[String(it.family)] === 'dev') && loaded.authored.selection.every(it => bank.manifest[String(it.family)] === 'selection'))
  const heldFams = new Set([...loaded.heldOut.certification, ...loaded.heldOut.canary].map(it => String(it.family)))
  const authFams = new Set([...loaded.authored.dev, ...loaded.authored.selection].map(it => String(it.family)))
  ok('held-out ∩ authored families = ∅', [...heldFams].every(f => !authFams.has(f)))
  ok('partitions partition the corpus', loaded.heldOut.certification.length + loaded.heldOut.canary.length + loaded.authored.dev.length + loaded.authored.selection.length === 60)
  // adversarial: a STALE packet must not be scorable — the held-out integrity property
  ok('loadCorpusForRun on a STALE packet throws', throws(() => q.loadCorpusForRun(file, packetB)))
  let serr = ''; try { q.loadCorpusForRun(file, packetB) } catch (e) { serr = e.message }
  ok('stale-packet error names the file', serr.includes(file))
  // a vacuous bank (too few families ⇒ empty certification partition) is refused
  const tiny = q.persistAnchors({ packet: packetA, items: [{ id: 1, family: 'only-one', kind: 'truth' }], baseDir: join(base, 'tiny') })
  ok('loadCorpusForRun refuses a vacuous (empty-certification) bank',
    throws(() => q.loadCorpusForRun(tiny.file, packetA)) === (ab.certificationFamilies(tiny.bank).length === 0))
  // adversarial: a TAMPERED bank (edit an item, keep checksum) must not load
  const tfile = join(base, 'tampered.json')
  const tampered = JSON.parse(JSON.stringify(bank)); tampered.items[0].mutation.span = 'FORGED'
  writeFileSync(tfile, JSON.stringify(tampered))
  ok('loadCorpusForRun on a tampered bank throws', throws(() => q.loadCorpusForRun(tfile, packetA)))

  // ── (c) anchorBankArg — only JSON crosses the seam ────────────────────────────────────────────
  console.log('anchorBankArg (the args.anchorBank envelope):')
  const arg = q.anchorBankArg(loaded)
  ok('arg carries version + packet_id', arg.version === bank.version && arg.packet_id === bank.packet_id)
  ok('arg.items is the scored certification partition', arg.items === loaded.heldOut.certification)
  ok('arg.canary is the canary partition', arg.canary === loaded.heldOut.canary)
  ok('arg is JSON-serializable (crosses the sandbox seam)', !throws(() => JSON.parse(JSON.stringify(arg))))

  // ── (d) writeCard — atomic round-trip + path-component safety ──────────────────────────────────
  console.log('writeCard (atomic, path-safe):')
  const card = { packet_id: bank.packet_id, run_id: 'run-2026-06-21-01', run_status: 'QUALIFIED_FOR_THIS_RUN', anchor_bank_version: bank.version, adversarial_audit: 'not_run' }
  const cfile = q.writeCard(card, base)
  ok('card path is anchors/<pid>/assurance-v<run_id>.json', cfile === join(base, 'anchors', bank.packet_id, 'assurance-vrun-2026-06-21-01.json') && existsSync(cfile))
  ok('no .tmp left after atomic card write', !readdirSync(join(base, 'anchors', bank.packet_id)).some(f => f.endsWith('.tmp')))
  ok('card round-trips byte-equal', JSON.stringify(q.readCard(cfile)) === JSON.stringify(card))
  // adversarial path-component counterexamples — a forged id can't escape the anchors dir
  ok('writeCard rejects a path-traversal run_id', throws(() => q.writeCard({ ...card, run_id: '../../etc/passwd' }, base)))
  ok('writeCard rejects a run_id with a slash', throws(() => q.writeCard({ ...card, run_id: 'a/b' }, base)))
  ok('writeCard rejects a non-hex packet_id', throws(() => q.writeCard({ ...card, packet_id: '../escape' }, base)))
  ok('writeCard rejects a non-object card', throws(() => q.writeCard('nope', base)))
  ok('writeCard needs a baseDir', throws(() => q.writeCard(card)))
  let rerr = ''; try { q.readCard(join(base, 'nope.json')) } catch (e) { rerr = e.message }
  ok('readCard tags a missing file with its path', rerr.includes('nope.json'))
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
