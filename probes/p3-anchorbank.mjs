// PLAN_3 U21 (P3) probe — the durable anchor bank is content-addressed, held-out by family, and
// tamper-evident. No harness dependency.
//
// Asserts the P3 gate: (a) reproducible — same packet+items ⇒ same version + checksum + manifest, and
// a write→read roundtrip preserves them; (b) changing the packet (or the items) bumps the version;
// (c) held-out by FAMILY — every family lands in exactly one partition and the certification/canary
// partitions are disjoint from the families the run may author; (d) tamper-evident — editing items,
// checksum, or version makes verify()/read() throw (a hand-edited bank can't silently certify).
//
//   run:  node probes/p3-anchorbank.mjs
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ab = require(join(here, '..', 'worldcup', 'references', 'anchorbank.js'))

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name) } else { fail++; console.log('  XX  ' + name) } }
const throws = fn => { try { fn(); return false } catch { return true } }

// two distinct U20-style packets, and a family-tagged item set (item-card shape is U11's; anchorbank
// only reads .family / .kind / .human_adjudicated).
const packetA = { supported_facts: ['the build took three days'], allowed_entities: { files: ['Parser.ts'] }, not_allowed: ['dates'], target: null }
const packetB = { supported_facts: ['the build took three days'], allowed_entities: { files: ['Lexer.ts'] }, not_allowed: ['dates'], target: null }
const mkItems = () => Array.from({ length: 60 }, (_, i) => ({
  id: i, family: 'fam-' + (i % 12), kind: i % 2 ? 'truth' : 'taste',
  human_adjudicated: i % 4 === 0, mutation: { span: 's' + i, operator: 'swap' },
}))

// ── (a) reproducibility ──────────────────────────────────────────────────────────────────────
console.log('reproducible (same packet+items ⇒ same version/checksum/manifest):')
const b1 = ab.buildBank({ packet: packetA, items: mkItems(), created: '2026-06-21T00:00:00Z' })
const b2 = ab.buildBank({ packet: packetA, items: mkItems(), created: '2099-01-01T00:00:00Z' })
ok('same packet_id',  b1.packet_id === b2.packet_id)
ok('same version',    b1.version === b2.version)
ok('same checksum',   b1.checksum === b2.checksum)
ok('version independent of created timestamp', b1.version === b2.version)
ok('manifest deterministic', JSON.stringify(b1.manifest) === JSON.stringify(b2.manifest))
ok('packet_id is content-addressed (=packetId)', b1.packet_id === ab.packetId(packetA))

// ── (b) changing the packet / items bumps the version ────────────────────────────────────────
console.log('changing the packet (or items) bumps the version:')
const bB = ab.buildBank({ packet: packetB, items: mkItems() })
ok('different packet ⇒ different packet_id', b1.packet_id !== bB.packet_id)
ok('different packet ⇒ different version',   b1.version !== bB.version)
const moreItems = ab.buildBank({ packet: packetA, items: [...mkItems(), { id: 999, family: 'fam-new', kind: 'truth' }] })
ok('different items ⇒ different checksum',    b1.checksum !== moreItems.checksum)
ok('different items ⇒ different version',     b1.version !== moreItems.version)
ok('isStaleFor: bank(A) is stale for packet B', ab.isStaleFor(b1, packetB))
ok('isStaleFor: bank(A) is NOT stale for packet A', !ab.isStaleFor(b1, packetA))

// ── (c) held out BY FAMILY (the load-bearing property) ───────────────────────────────────────
console.log('held out by family (one family → one partition; held-out ∩ authored = ∅):')
const families = Object.keys(b1.manifest)
ok('every family has a partition', families.every(f => ['dev', 'selection', 'certification', 'canary'].includes(b1.manifest[f])))
const held = new Set(ab.heldOutFamilies(b1))
const authored = new Set(ab.authoredFamilies(b1))
ok('held-out ∩ authored = ∅', [...held].every(f => !authored.has(f)))
ok('held-out ∪ authored = all families', held.size + authored.size === families.length)
ok('certification items come only from certification families',
  ab.itemsInPartition(b1, 'certification').every(it => b1.manifest[String(it.family)] === 'certification'))
ok('partition counts sum to item count', Object.values(ab.partitionCounts(b1)).reduce((a, c) => a + c, 0) === 60)
ok('partitionFor is stable across calls', ab.partitionFor('fam-3', b1.packet_id) === ab.partitionFor('fam-3', b1.packet_id))
// a family's partition is independent of which run/items it appears in (keyed by packet, not item set)
ok('family partition is packet-stable, not item-stable', ab.partitionOf(b1, 'fam-3') === ab.partitionOf(moreItems, 'fam-3'))
ok('unadjudicated flags un-adjudicated taste anchors only',
  ab.unadjudicated(b1).every(it => it.kind === 'taste' && !it.human_adjudicated) && ab.unadjudicated(b1).length > 0)
// a family-less item can't be held out BY family — buildBank must reject it, not silently drop it
ok('buildBank rejects a family-less item',  throws(() => ab.buildBank({ packet: packetA, items: [{ id: 1, kind: 'truth' }] })))
ok('buildBank rejects an empty-string family', throws(() => ab.buildBank({ packet: packetA, items: [{ id: 1, family: '' }] })))

// ── (d) tamper-evident persistence (write → read roundtrip + integrity) ──────────────────────
console.log('tamper-evident persistence:')
const base = mkdtempSync(join(tmpdir(), 'wc-anchorbank-'))
try {
  const file = ab.write(b1, base)
  ok('write path is anchors/<packet_id>/bank-v<version>.json',
    file === join(base, 'anchors', b1.packet_id, `bank-v${b1.version}.json`) && existsSync(file))
  ok('no .tmp left after atomic write', !readdirSync(join(base, 'anchors', b1.packet_id)).some(f => f.endsWith('.tmp')))
  const loaded = ab.read(file)
  ok('roundtrip preserves checksum',  loaded.checksum === b1.checksum)
  ok('roundtrip preserves version',   loaded.version === b1.version)
  ok('roundtrip preserves manifest',  JSON.stringify(loaded.manifest) === JSON.stringify(b1.manifest))

  // tamper: edit an item card but keep the stored checksum → read must reject (the whole point)
  const tampered = JSON.parse(JSON.stringify(b1)); tampered.items[0].mutation.span = 'FORGED'
  ok('tampered items ⇒ verify throws (checksum)', throws(() => ab.verify(tampered)))
  const tfile = join(base, 'tampered.json'); writeFileSync(tfile, JSON.stringify(tampered))
  ok('tampered items ⇒ read throws',  throws(() => ab.read(tfile)))
  // tamper: bump version without rebuilding → reject
  const tv = JSON.parse(JSON.stringify(b1)); tv.version = 'deadbeefdeadbeef'
  ok('forged version ⇒ verify throws', throws(() => ab.verify(tv)))
  // tamper: swap a family's checksum/items mismatch
  const tc = JSON.parse(JSON.stringify(b1)); tc.checksum = 'deadbeefdeadbeef'
  ok('forged checksum ⇒ verify throws', throws(() => ab.verify(tc)))
  // wrong schema
  ok('unknown schema ⇒ verify throws', throws(() => ab.verify({ ...b1, schema: 'nope' })))
  // THE headline /invariance finding: forging the MANIFEST (move a held-out family to dev) must be
  // caught — verify recomputes the manifest from (packet_id, items), it does not trust the file.
  const hf = ab.heldOutFamilies(b1)
  ok('sample has a held-out family', hf.length > 0)
  const tm = JSON.parse(JSON.stringify(b1)); tm.manifest[hf[0]] = 'dev'
  ok('forged manifest (held-out → dev) ⇒ verify throws', throws(() => ab.verify(tm)))
  // but a REORDERED (semantically identical) manifest still validates — compare is canonical
  const reordered = JSON.parse(JSON.stringify(b1))
  reordered.manifest = Object.fromEntries(Object.entries(reordered.manifest).reverse())
  ok('reordered manifest still validates (canonical compare)', !throws(() => ab.verify(reordered)))
  // non-hex packet_id (path traversal / corruption) ⇒ reject before it's used as a path component
  ok('non-hex packet_id ⇒ verify throws', throws(() => ab.verify({ ...b1, packet_id: '../../etc' })))
  // corrupt JSON ⇒ read throws an error that NAMES the file (diagnosable, not a bare SyntaxError)
  const cfile = join(base, 'corrupt.json'); writeFileSync(cfile, '{ "schema": "worldcup/anchor-bank@1", "items": [')
  let cerr = ''; try { ab.read(cfile) } catch (e) { cerr = e.message }
  ok('corrupt JSON ⇒ read throws naming the file', cerr.includes(cfile) && /not valid JSON|corrupt/i.test(cerr))
  // missing file ⇒ read throws an error that names the path
  let merr = ''; try { ab.read(join(base, 'nope.json')) } catch (e) { merr = e.message }
  ok('missing file ⇒ read throws naming the path', merr.includes('nope.json'))
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
