#!/usr/bin/env node
'use strict'
// worldcup — DURABLE ANCHOR BANK (PLAN_3 U21/P3).
//
// "Hidden held-out / leave-one-family-out" certification is meaningless if the anchor bank is
// regenerated each run by the same session being certified — that is a same-run smoke test, not
// held-out validation. This module makes the bank a VERSIONED, ON-DISK artifact: built once (U11
// fills the item cards), persisted, and reused across runs, so the certifying run (U12) reads a
// certification partition it did NOT author.
//
//   node anchorbank.js verify  <bank.json>     # integrity + version check (exit 1 on mismatch)
//   node anchorbank.js inspect <bank.json>     # partition counts + ids
//
// SANDBOX BOUNDARY: the worldcup Workflow is sandboxed (no fs). So this helper runs ORCHESTRATOR-side
// (like live-view.js): the orchestrator builds/persists the bank here, then passes the held-out
// partition INTO the Workflow via `args` (U12 wires that). The bank is content-addressed to the U20
// SOURCE_PACKET, so a changed packet is a different bank — you cannot accidentally certify against a
// ledger the judges no longer read. Dependency-free (Node stdlib only).
const fs = require('fs')
const path = require('path')
const { createHash, randomBytes } = require('crypto')

const SCHEMA = 'worldcup/anchor-bank@1'
// The four partitions (from the review): development (feedback allowed) · selection (hidden tuning) ·
// certification (held out by family, scored once) · canary (drift detection). A FAMILY lands in
// exactly one partition, so "held out by family" is structural, not a random per-item split.
const PARTITIONS = [['dev', 0.5], ['selection', 0.2], ['certification', 0.2], ['canary', 0.1]]
const PARTITION_NAMES = new Set(PARTITIONS.map(([n]) => n))
const HELD_OUT = new Set(['certification', 'canary'])   // partitions the certifying run must NOT author

// ── content addressing. Canonical JSON (sorted keys) so the SAME logical value always hashes
// identically — this is what makes versions reproducible and tampering detectable. Assumes JSON-shaped
// values: undefined/NaN/Infinity all canonicalize to null (a JSON limitation), so don't feed it those.
// The integrity path is safe by construction — verify() runs on JSON.parse'd banks, which cannot
// contain undefined/NaN; the build path's domain (U20 string/array packets, U11 JSON item cards) doesn't either.
const canonical = v => {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  return JSON.stringify(v === undefined ? null : v)
}
const sha = s => createHash('sha256').update(s).digest('hex')
const fingerprint = obj => sha(canonical(obj)).slice(0, 16)

// packetId identifies WHICH SOURCE_PACKET (U20) a bank certifies. Content-addressed: change the packet
// (facts/entities/not_allowed/target) and you get a different id — "changing the packet bumps the bank".
const packetId = packet => fingerprint(packet == null ? {} : packet)

// Deterministic, stable family → partition. Keyed by (packetId, family) so it's reproducible across
// runs and machines, splits by whole family, and re-partitions only when the packet itself changes.
const partitionFor = (family, pid) => {
  const h = parseInt(sha(pid + '|' + String(family)).slice(0, 8), 16) / 0x100000000   // [0,1)
  let acc = 0
  for (const [name, w] of PARTITIONS) { acc += w; if (h < acc) return name }
  return PARTITIONS[PARTITIONS.length - 1][0]
}

const HEX16 = /^[0-9a-f]{16}$/   // shape of every fingerprint — also keeps packet_id/version safe as path components

// Every item MUST carry a non-empty STRING family — held-out partitioning is BY family, so a missing,
// numeric, or object family would be unpartitionable (invisible to certification) or collapse distinct
// families to one key. Enforced at BOTH buildBank AND verify, so a hand-edited bank can't smuggle one in.
function assertItems(items) {
  if (!Array.isArray(items)) throw new Error('anchorbank: items must be an array')
  for (const it of items)
    if (it == null || typeof it.family !== 'string' || it.family === '')
      throw new Error(`anchorbank: every item must carry a non-empty string family (got ${JSON.stringify(it && it.family)}); held-out partitioning is BY family.`)
}
// Order-INDEPENDENT content checksum: the anchor set is unordered, so reordering the cards must NOT
// mint a new version (version is the on-disk filename AND the U12 calibration-card handle). Sort the
// canonical item strings before hashing, so the version content-addresses the SET, not the ordering.
const checksumItems = items => fingerprint([...items].map(canonical).sort())

// The family→partition manifest is fully DERIVABLE from (packet_id, item families) — the single source
// of truth, recomputable and verifiable (see verify). Built on a NULL-prototype object so a family
// literally named `toString`/`constructor`/`__proto__` can't collide with Object.prototype and silently
// escape partitioning (the exact "invisible held-out family" failure this module exists to prevent).
function buildManifest(items, pid) {
  const m = Object.create(null)
  for (const it of items) { const fam = String(it.family); if (!(fam in m)) m[fam] = partitionFor(fam, pid) }
  return m
}

// Assemble a bank from item cards (U11's shape; only `.family` / `.kind` / `.human_adjudicated` are
// read here — the rest is carried through verbatim). created/provenance are caller-supplied (build
// metadata, deliberately OUTSIDE the content-address so two builds of the same anchors are reproducible).
function buildBank({ packet, items = [], provenance = {}, created = null }) {
  assertItems(items)
  const pid = packetId(packet)
  const checksum = checksumItems(items)
  const version = fingerprint({ packet_id: pid, checksum })   // depends on packet AND the anchor SET (order-independent)
  return { schema: SCHEMA, packet_id: pid, version, created, provenance, manifest: buildManifest(items, pid), checksum, items }
}

// Integrity + consistency — a hand-edited or corrupted bank cannot silently certify. Checks, in order:
// fingerprint shape (also path-safety for packet_id/version), item checksum, version, AND the manifest
// RECOMPUTED from (packet_id, items): the held-out partition is the load-bearing security property, and
// it is NOT in the checksum/version — so without this recompute, a forged manifest (move a certification
// family to dev) would pass. The manifest is derivable, so recompute-and-compare is the canonical check.
function verify(bank) {
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) throw new Error('anchorbank: not an object')
  if (bank.schema !== SCHEMA) throw new Error(`anchorbank: unknown schema ${JSON.stringify(bank.schema)} (want ${SCHEMA})`)
  assertItems(bank.items)   // re-enforce the build precondition — a hand-edit can't smuggle in an unpartitionable item
  if (!HEX16.test(bank.packet_id)) throw new Error(`anchorbank: packet_id must be 16 hex chars, got ${JSON.stringify(bank.packet_id)}`)
  if (!HEX16.test(bank.version)) throw new Error(`anchorbank: version must be 16 hex chars, got ${JSON.stringify(bank.version)}`)
  const cs = checksumItems(bank.items)
  if (cs !== bank.checksum) throw new Error(`anchorbank: checksum mismatch (items tampered) — stored ${bank.checksum}, computed ${cs}`)
  const ver = fingerprint({ packet_id: bank.packet_id, checksum: bank.checksum })
  if (ver !== bank.version) throw new Error(`anchorbank: version mismatch — stored ${bank.version}, computed ${ver}`)
  const manifest = canonical(bank.manifest || {}), recomputed = canonical(buildManifest(bank.items, bank.packet_id))
  if (manifest !== recomputed) throw new Error('anchorbank: manifest mismatch — the stored family→partition split is not the canonical one for this (packet, items); a held-out family may have been reassigned.')
  return bank
}

// Atomic write to anchors/<packet_id>/bank-v<version>.json (temp-file + rename), so a concurrent
// reader never sees a half-written bank. Returns the path written.
function write(bank, baseDir) {
  verify(bank)
  const dir = path.join(baseDir, 'anchors', bank.packet_id)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `bank-v${bank.version}.json`)
  // WRITER-PRIVATE temp (pid + random) so concurrent writers of the same version don't share a temp
  // path, and the failure-path unlink only ever removes OUR temp — never a peer's staged bytes.
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(bank, null, 2) + '\n')
    fs.renameSync(tmp, file)   // rename is atomic for readers; same dir ⇒ no EXDEV
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* our temp; nothing to clean up */ }
    throw e
  }
  return file
}

// Load + verify. Tags the failure with the file path so a corrupt/missing bank is diagnosable (a bare
// JSON SyntaxError or ENOENT doesn't say WHICH bank); verify()'s own errors already carry stored-vs-computed.
function read(file) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch (e) { throw new Error(`anchorbank: cannot read ${file}: ${e.message}`) }
  let bank
  try { bank = JSON.parse(raw) } catch (e) { throw new Error(`anchorbank: ${file} is not valid JSON (corrupt/truncated bank): ${e.message}`) }
  // Tag verify() failures with the file too — the common surviving corruption (a byte-flip inside valid
  // JSON) surfaces as a checksum mismatch that otherwise names neither the file nor the bank.
  try { return verify(bank) } catch (e) { throw new Error(`anchorbank: ${file} failed integrity — ${e.message}`) }
}

// The bank was built for a DIFFERENT packet than the one about to run → it cannot be used (stale).
const isStaleFor = (bank, packet) => !bank || bank.packet_id !== packetId(packet)
// hasOwnProperty-guarded so an ABSENT family named e.g. "toString" returns null, not Object.prototype's
// inherited function (which would corrupt counts and partition queries).
const partitionOf = (bank, family) => {
  const m = bank && bank.manifest
  return (m && Object.prototype.hasOwnProperty.call(m, String(family))) ? m[String(family)] : null
}
const itemsInPartition = (bank, name) => (bank && bank.items || []).filter(it => partitionOf(bank, it && it.family) === name)
const familiesIn = (bank, pred) => Object.entries((bank && bank.manifest) || {}).filter(([, p]) => pred(p)).map(([f]) => f)
// Families the certifying run must NOT author (read from the persisted bank) vs the families it MAY
// (re)build this run. Disjoint by construction (one family → one partition).
const heldOutFamilies = bank => familiesIn(bank, p => HELD_OUT.has(p))
const authoredFamilies = bank => familiesIn(bank, p => PARTITION_NAMES.has(p) && !HELD_OUT.has(p))
const certificationFamilies = bank => familiesIn(bank, p => p === 'certification')
// Taste anchors awaiting human adjudication (U11 stamps item.kind/human_adjudicated; U12 must not
// certify on un-adjudicated taste gold). Carried here; consumers decide policy.
const unadjudicated = bank => (bank && bank.items || []).filter(it => it && it.kind === 'taste' && !it.human_adjudicated)

function partitionCounts(bank) {
  const c = { dev: 0, selection: 0, certification: 0, canary: 0, unpartitioned: 0 }
  for (const it of (bank && bank.items) || []) { const p = partitionOf(bank, it && it.family); c[PARTITION_NAMES.has(p) ? p : 'unpartitioned']++ }
  return c
}

// A bank with an EMPTY certification partition certifies vacuously (nothing held out to score). U11/U12
// call this before certifying; NOT enforced at build (a partial bank may legitimately be empty mid-construction).
function assertCertifiable(bank) {
  if (!certificationFamilies(bank).length)
    throw new Error('anchorbank: certification partition is empty — nothing is held out to score (too few anchor families). Add more families before certifying.')
  return bank
}

// Composed read that BINDS the bank to the active packet, so the staleness check can't be skipped by
// forgetting to call isStaleFor. The recommended entry point for U12's certifying run.
function readForPacket(file, packet) {
  const bank = read(file)
  if (isStaleFor(bank, packet))
    throw new Error(`anchorbank: ${file} was built for packet ${bank.packet_id}, not the active packet ${packetId(packet)} — refusing to certify against a stale ledger.`)
  return bank
}

module.exports = {
  SCHEMA, PARTITIONS, PARTITION_NAMES, HELD_OUT, canonical, fingerprint, packetId, partitionFor,
  assertItems, checksumItems, buildBank, verify, write, read, readForPacket, isStaleFor,
  partitionOf, itemsInPartition, heldOutFamilies, authoredFamilies, certificationFamilies,
  unadjudicated, partitionCounts, assertCertifiable,
}

if (require.main === module) {
  const [cmd, file] = process.argv.slice(2)
  if ((cmd !== 'verify' && cmd !== 'inspect') || !file) {
    console.error('usage: anchorbank.js verify|inspect <bank.json>'); process.exit(2)
  }
  try {
    const bank = read(file)
    if (cmd === 'verify') { console.log(`OK  packet=${bank.packet_id} version=${bank.version} items=${bank.items.length}`); process.exit(0) }
    console.log(JSON.stringify({ packet_id: bank.packet_id, version: bank.version, items: bank.items.length,
      partitions: partitionCounts(bank), held_out_families: heldOutFamilies(bank), unadjudicated: unadjudicated(bank).length }, null, 2))
  } catch (e) { console.error('FAIL', e.message); process.exit(1) }
}
