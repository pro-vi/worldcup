#!/usr/bin/env node
'use strict'
// worldcup — QUALIFY ORCHESTRATOR BRIDGE (PLAN_3 U11b). The fs half the sandboxed Workflow cannot do.
//
// The worldcup Workflow is sandboxed (no fs, no Date, no crypto). So — exactly like live-view.js and
// anchorbank.js — the orchestrator side lives here. This module is a THIN composition over anchorbank.js
// (no new bank primitive): it (1) persists a freshly-built conformance corpus into the durable, committed
// bank (persistAnchors), (2) loads a held-out partition for a run, bound to the LIVE packet so a stale
// ledger can't be scored (loadCorpusForRun), shapes it for the `args.anchorBank` envelope (anchorBankArg),
// and (3) writes the U24 run-assurance card atomically (writeCard). Data crosses the sandbox seam as JSON
// only: items go IN via args; the card comes OUT via the Workflow return. Dependency-free (Node stdlib + anchorbank).
//
//   node qualify.js inspect-card <assurance.json>     # summarize a written assurance card
//   node qualify.js verify       <bank.json>          # delegate to anchorbank verify
const fs = require('fs')
const path = require('path')
const { randomBytes } = require('crypto')
const ab = require('./anchorbank.js')

const HEX16 = /^[0-9a-f]{16}$/                // path-safe content fingerprint (packet_id)
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/  // caller-supplied run id used as a path component — keep it traversal-safe

// Build the corpus into a content-addressed bank and persist it (atomic, via anchorbank.write). The
// orchestrator has Date, so `created` is stamped HERE when not supplied (it is advisory metadata,
// deliberately OUTSIDE the content-address — two builds of the same anchors stay reproducible). Returns
// the written path + the bank. COMMIT the result: reviewed taste-gold is versioned ground truth.
function persistAnchors({ packet, items, provenance = {}, created = null, baseDir }) {
  if (!baseDir) throw new Error('qualify: persistAnchors needs a baseDir (orchestrator-side write root).')
  const bank = ab.buildBank({ packet, items, provenance, created: created || new Date().toISOString() })
  const file = ab.write(bank, baseDir)            // anchorbank.write re-verifies before writing
  return { file, bank }
}

// Load the durable bank for a RUN. readForPacket binds it to the live packet (throws on a stale ledger);
// assertCertifiable refuses a vacuous bank (empty certification partition). Returns the partitions split
// by role: the run SCORES the held-out certification partition (which it did NOT author — the bank was
// built once and committed), uses canary for cross-run drift, and may author dev/selection. anchorbank's
// own tagged errors (corrupt/missing/tampered/forged-manifest) propagate with the file named.
// A MANDATORY gate anchor is a truth MFT spec test (a planted fabrication that must DQ, or an authorized/
// unknown detail that must PASS). These are SPEC TESTS, not a statistical sample — the plan's Architecture
// Decision #2 — so they are NOT held out by family: a single must-DQ family hash-partitions OUT of the
// certification partition ~80% of the time, leaving the noncompensatory floor vacuous. They are scored on
// the FULL corpus EVERY run instead. (The card still names the bank version, so this is reproducible.)
const isMandatoryGateAnchor = it => it && it.kind === 'truth' && it.expected && (it.expected.gate === 'DQ' || it.expected.gate === 'PASS')
function loadCorpusForRun(bankFile, livePacket) {
  const bank = ab.readForPacket(bankFile, livePacket)   // throws (file-tagged) on corrupt/tampered/stale
  ab.assertCertifiable(bank)                             // throws on an empty certification partition
  const items = Array.isArray(bank.items) ? bank.items : []
  return {
    bank, version: bank.version, packet_id: bank.packet_id,
    heldOut: { certification: ab.itemsInPartition(bank, 'certification'), canary: ab.itemsInPartition(bank, 'canary') },
    authored: { dev: ab.itemsInPartition(bank, 'dev'), selection: ab.itemsInPartition(bank, 'selection') },
    mandatory: items.filter(isMandatoryGateAnchor),       // the spec-test floor — scored every run, not held out
    unadjudicated: ab.unadjudicated(bank),                // taste gold the author hasn't signed off (U12 policy)
  }
}

// Shape the scored set for the Workflow's `args.anchorBank` envelope (the Workflow cannot read disk). Only
// JSON crosses the seam. `items` = the FULL mandatory gate floor (always) UNION the held-out certification
// SAMPLE (the non-mandatory conformance draw), deduped by reference; canary is for U24 drift.
function anchorBankArg(loaded) {
  if (!loaded || !loaded.heldOut) throw new Error('qualify: anchorBankArg needs a loadCorpusForRun result.')
  const seen = new Set(), items = []
  for (const it of [...(loaded.mandatory || []), ...loaded.heldOut.certification])
    if (!seen.has(it)) { seen.add(it); items.push(it) }
  return { version: loaded.version, packet_id: loaded.packet_id, items, canary: loaded.heldOut.canary }
}

// Write the U24 run-assurance card to anchors/<packet_id>/assurance-v<run_id>.json — atomic temp+rename
// (mirrors anchorbank.write), so a watcher never reads a half-written card. The card is schema-agnostic
// here (U24 owns the payload), but its two PATH components are validated: packet_id must be 16-hex and
// run_id must be traversal-safe, so a forged id can't escape the anchors dir. Returns the path written.
// Same-(packet_id,run_id) is last-writer-wins (a re-run with the same id overwrites) — effectively
// unreachable in practice because run_id carries the per-run nonce (review P3a: documented, not guarded).
function writeCard(card, baseDir) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error('qualify: writeCard needs a card object.')
  if (!baseDir) throw new Error('qualify: writeCard needs a baseDir.')
  const pid = String(card.packet_id == null ? '' : card.packet_id)
  const rid = String(card.run_id == null ? '' : card.run_id)
  if (!HEX16.test(pid)) throw new Error(`qualify: card.packet_id must be 16 hex chars (it is a path component), got ${JSON.stringify(card.packet_id)}.`)
  if (!SAFE_RUN_ID.test(rid)) throw new Error(`qualify: card.run_id must match ${SAFE_RUN_ID} (it is a path component — no '/' or '..'), got ${JSON.stringify(card.run_id)}.`)
  const dir = path.join(baseDir, 'anchors', pid)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `assurance-v${rid}.json`)
  // WRITER-PRIVATE temp (pid + random) so concurrent writers don't share a temp and the failure-path
  // unlink only ever removes OUR temp — never a peer's staged bytes (same discipline as anchorbank.write).
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(card, null, 2) + '\n')
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* our temp; nothing to clean up */ }
    throw e
  }
  return file
}

// Read back a written card (file-tagged errors, like anchorbank.read — but no integrity recompute: the
// card is a run output, not content-addressed).
function readCard(file) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch (e) { throw new Error(`qualify: cannot read ${file}: ${e.message}`) }
  let card
  try { card = JSON.parse(raw) } catch (e) { throw new Error(`qualify: ${file} is not valid JSON (corrupt assurance card): ${e.message}`) }
  // Shape check (review P3a): fail loud on a malformed/foreign file rather than handing a parse-only value
  // to a consumer that would silently misread it. A card is a plain object naming its run (packet_id+run_id).
  if (!card || typeof card !== 'object' || Array.isArray(card) || typeof card.run_id !== 'string' || typeof card.packet_id !== 'string')
    throw new Error(`qualify: ${file} is not a well-formed assurance card (need an object with string packet_id + run_id).`)
  return card
}

module.exports = { persistAnchors, loadCorpusForRun, anchorBankArg, writeCard, readCard }

if (require.main === module) {
  const [cmd, file] = process.argv.slice(2)
  if (cmd === 'verify' && file) {
    try { const b = ab.read(file); console.log(`OK  packet=${b.packet_id} version=${b.version} items=${b.items.length}`); process.exit(0) }
    catch (e) { console.error('FAIL', e.message); process.exit(1) }
  } else if (cmd === 'inspect-card' && file) {
    try {
      const c = readCard(file)
      console.log(JSON.stringify({ packet_id: c.packet_id, run_id: c.run_id, run_status: c.run_status,
        anchor_bank_version: c.anchor_bank_version, adversarial_audit: c.adversarial_audit }, null, 2)); process.exit(0)
    } catch (e) { console.error('FAIL', e.message); process.exit(1) }
  } else { console.error('usage: qualify.js inspect-card <assurance.json> | verify <bank.json>'); process.exit(2) }
}
