// PLAN_4 U17 probe — exercises live-view.js's parse/fold/render against a captured WCEVENT fixture
// (probes/live-view-fixture.jsonl), with NO harness dependency. Run: node probes/live-view.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import lv from '../worldcup/references/live-view.js'  // CJS default = { parseLines, fold, render, statusLine }

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, 'live-view-fixture.jsonl'), 'utf8')

let pass = 0, fail = 0
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n) } else { fail++; console.log('  XX  ' + n) } }

// ── tolerant parse: 6 valid events; 2 noise lines + 1 malformed trailing WCEVENT all skipped ──
console.log('tolerant parse (raw fixture):')
const events = lv.parseLines(fixture)
ok('parses exactly 6 valid WCEVENT lines', events.length === 6)
ok('skips noise + malformed/partial trailing line', events.every(e => e && e.ev))

console.log('JSONL-WRAPPED records (the REAL sink format — escaped payload inside a log record):')
// (a) a real-shaped log record: WCEVENT payload is a JSON-escaped string in a "message" field
const wrapped = JSON.stringify({ type: 'log', ts: 't', message: 'WCEVENT ' + JSON.stringify({ ev: 'draw', field: 2, groups: [{ group: 'A', teams: [{ label: 'x', seed: 1 }] }] }) })
const pw = lv.parseLines(wrapped)
ok('parses a wrapped/escaped WCEVENT record', pw.length === 1 && pw[0].ev === 'draw' && pw[0].field === 2)
// (b) trailing record chars AFTER the event object must not break the brace-match
const wrapped2 = '{"message":"WCEVENT ' + JSON.stringify({ ev: 'champion', label: 'z', stakes: 'FINAL' }).replace(/"/g, '\\"') + '","ts":123,"x":{"y":1}}'
const pw2 = lv.parseLines(wrapped2)
ok('handles trailing record chars after the object', pw2.length === 1 && pw2[0].label === 'z')
// (c) raw format still parses (Tier-0 / direct framing)
ok('raw format still parses', lv.parseLines('WCEVENT {"ev":"champion","label":"r","stakes":"FINAL"}')[0].label === 'r')
// (d) a } inside a string value does not end the object early
ok('brace inside a string value is respected', lv.parseLines('WCEVENT {"ev":"champion","label":"a}b","stakes":"FINAL"}')[0].label === 'a}b')

// ── fold ──────────────────────────────────────────────────────────────────────────────────
console.log('fold:')
const st = lv.fold(events)
ok('field folded (6)', st.field === 6)
ok('2 groups in draw order', st.groupOrder.join(',') === 'A,B')
ok('1 DQ (plain-hook)', st.dq.length === 1 && st.dq[0].label === 'plain-hook')
ok('2 rounds folded', st.rounds.length === 2)
ok('rounds sorted SF before FINAL', st.rounds[0].stakes === 'SF' && st.rounds[1].stakes === 'FINAL')
ok('champion = cold-hook', !!st.champion && st.champion.label === 'cold-hook')
ok('idempotent: folding twice == once', JSON.stringify(lv.fold(events)) === JSON.stringify(st))

// ── render (final state) ─────────────────────────────────────────────────────────────────
console.log('render (final):')
const html = lv.render(st)
ok('self-contained (no external http(s) refs)', !/https?:\/\//.test(html))
ok('champion present + crowned (trophy)', html.includes('cold-hook') && html.includes('127942'))
ok('eliminated marked as lose slot', /slot lose">sc-mid/.test(html) && /slot lose">warm-hook/.test(html))
ok('group standings rendered (Group A, pts 6)', html.includes('Group A') && html.includes('class="pts">6<'))
ok('advanced row highlighted (adv class on cold-hook)', /tr class="adv"><td>[^<]*cold-hook/.test(html))
ok('DQ panel present', html.includes('Disqualified') && html.includes('plain-hook'))
ok('FINAL: NO meta-refresh', !html.includes('http-equiv="refresh"'))
ok('FINAL header + status pill', html.includes('WORLD CUP') && html.includes('FINAL'))

// ── skeleton-before-results (only the draw seen) ─────────────────────────────────────────
console.log('skeleton (only draw):')
const skel = lv.render(lv.fold(events.filter(e => e.ev === 'draw')))
ok('renders without crashing on draw-only', typeof skel === 'string' && skel.length > 100)
ok('group cards show teams (pending dots)', skel.includes('Group A') && skel.includes('cold-hook'))
ok('knockout shown as pending', skel.includes('knockout pending'))
ok('LIVE: HAS meta-refresh', skel.includes('http-equiv="refresh"'))

// ── empty input (sink not ready) ─────────────────────────────────────────────────────────
console.log('empty input:')
const empty = lv.render(lv.fold(lv.parseLines('')))
ok('renders the waiting state', empty.includes('waiting for the first event'))
ok('still self-contained + has refresh', !/https?:\/\//.test(empty) && empty.includes('http-equiv="refresh"'))

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
