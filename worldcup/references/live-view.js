#!/usr/bin/env node
'use strict'
// worldcup — Tier-1 LIVE VIEW consumer (PLAN_4 U17).
//
// Tails a running worldcup's WCEVENT log and renders a self-contained, auto-refreshing
// worldcup-live.html so you can watch group standings form, eliminations land, and the bracket
// advance WHILE the background Workflow is still running. Dependency-free (Node stdlib only),
// read-only on the event sink, writes one static HTML file.
//
//   node live-view.js --events <path-to-run-jsonl> --out worldcup-live.html [--once]
//
// The PRODUCER half (emit() in workflow-template.js) is already on main; this is the consumer.
// The event sink path is injected by the launcher (PLAN_4 U18) — never hardcoded here. The parser
// is tolerant: it greps `WCEVENT {…}` out of any line and ignores the surrounding log/jsonl
// envelope, so a harness format change degrades to "stale view", never a crash.
const fs = require('fs')

const STAKES_ORDER = ['R32', 'R16', 'QF', 'SF', 'FINAL']
const he = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// ── tolerant parse: pull WCEVENT {…} out of any line; a malformed or partial trailing line is
// skipped, never fatal. Re-run from the top each read (events are < ~100, so no offset bookkeeping).
function parseLines(text) {
  const events = []
  for (const line of String(text == null ? '' : text).split('\n')) {
    const m = line.match(/WCEVENT\s+(\{.*\})\s*$/)
    if (!m) continue
    try { events.push(JSON.parse(m[1])) } catch (e) { /* malformed / partial line — skip */ }
  }
  return events
}

// ── fold the monotonic event stream into tournament state. Idempotent: folding the same prefix
// twice yields the same state (round de-dupes by stakes), so re-reading the growing file is safe.
function fold(events) {
  const st = { field: null, groups: {}, groupOrder: [], dq: [], rounds: [], champion: null, last: null }
  for (const e of events || []) {
    if (!e || !e.ev) continue
    st.last = e.ev
    if (e.ev === 'draw') {
      st.field = e.field
      for (const g of e.groups || []) {
        if (!st.groups[g.group]) st.groupOrder.push(g.group)
        st.groups[g.group] = { teams: g.teams || [], table: null, advanced: null }
      }
    } else if (e.ev === 'gate') {
      st.dq = e.disqualified || []
    } else if (e.ev === 'groups') {
      for (const s of e.standings || []) {
        if (!st.groups[s.group]) { st.groupOrder.push(s.group); st.groups[s.group] = { teams: [] } }
        st.groups[s.group].table = s.table || []
        st.groups[s.group].advanced = s.advanced || []
      }
    } else if (e.ev === 'round') {
      st.rounds = st.rounds.filter(r => r.stakes !== e.stakes)
      st.rounds.push({ stakes: e.stakes, matches: e.matches || [], eliminated: e.eliminated || [] })
    } else if (e.ev === 'champion') {
      st.champion = { label: e.label, stakes: e.stakes }
    }
  }
  st.rounds.sort((a, b) => STAKES_ORDER.indexOf(a.stakes) - STAKES_ORDER.indexOf(b.stakes))
  return st
}

function statusLine(st) {
  if (st.champion) return `final · champion ${st.champion.label}`
  if (st.rounds.length) return `${st.rounds[st.rounds.length - 1].stakes} in progress`
  if (Object.keys(st.groups).some(g => st.groups[g].table)) return 'group stage'
  if (st.groupOrder.length) return 'draw done · group stage pending'
  return 'waiting for the first event…'
}

// ── render one self-contained HTML snapshot. Mirrors renderReportV2's palette (purple pitch + gold)
// so live and final read as the same artifact. Live snapshots carry <meta refresh>; the final does not.
function render(st) {
  const live = !st.champion
  const groupCards = st.groupOrder.map(G => {
    const g = st.groups[G]
    const rows = g.table
      ? g.table.map(t => { const adv = (g.advanced || []).includes(t.label); return `<tr class="${adv ? 'adv' : ''}"><td>${adv ? '▸' : '&nbsp;'} ${he(t.label)}</td><td class="pts">${he(t.pts)}</td></tr>` }).join('')
      : (g.teams || []).map(t => `<tr class="pend"><td>${he(t.label)}</td><td class="pts">·</td></tr>`).join('')
    return `<div class="grp"><h4>Group ${he(G)}</h4><table>${rows}</table></div>`
  }).join('')
  const koCols = st.rounds.map(r => {
    const ms = r.matches.map(m => `<div class="match"><div class="slot win">${he(m.winner)}<span class="mg">${he(m.margin || '')}</span></div><div class="slot lose">${he(m.loser)}</div></div>`).join('')
    return `<div class="kocol"><div class="rnd">${he(r.stakes)}</div>${ms || '<div class="match empty"></div>'}</div>`
  }).join('')
  const champCol = st.champion
    ? `<div class="kocol"><div class="rnd">Champion</div><div class="match"><div class="slot win champ">${he(st.champion.label)} &#127942;</div></div></div>` : ''
  const dqHtml = st.dq.length
    ? `<div class="panel"><h3>Disqualified at the gate (${st.dq.length})</h3>${st.dq.map(d => `<div class="dq">${he(d.label)} <span>${he(d.category || '')}</span></div>`).join('')}</div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${live ? '<meta http-equiv="refresh" content="2">' : ''}<title>World Cup &mdash; ${live ? 'LIVE' : 'FINAL'}</title><style>
:root{--bg1:#2b0a26;--bg2:#4a1140;--bg3:#5e1650;--gold:#f5c542;--txt:#f3e9f0;--card:rgba(255,255,255,.06);--cardbd:rgba(255,255,255,.14)}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--txt);background:radial-gradient(120% 80% at 50% 0%,var(--bg3),var(--bg2) 45%,var(--bg1));min-height:100vh}
header{text-align:center;padding:22px 18px 6px}
header h1{margin:0;font-size:19px;letter-spacing:1px;font-weight:800}
.pill{display:inline-block;margin-top:9px;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700}
.pill.live{background:linear-gradient(180deg,#ff7a3c,#e8551f);color:#fff;box-shadow:0 3px 12px rgba(232,85,31,.4)}
.pill.done{background:var(--gold);color:#2b0a26}
.wrap{max-width:1200px;margin:0 auto;padding:10px 18px 40px}
.sec{color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:22px 0 8px}
.bracket{display:flex;gap:12px;overflow-x:auto;padding:14px 0;align-items:flex-start;justify-content:center;min-height:60px}
.kocol{min-width:150px;display:flex;flex-direction:column;gap:10px}
.kocol.muted,.muted{color:#c9b6c4;font-size:12px}
.rnd{font-weight:700;color:var(--gold);text-align:center;text-transform:uppercase;font-size:11px;letter-spacing:1px}
.match{background:var(--card);border:1px solid var(--cardbd);border-radius:8px;overflow:hidden}
.match.empty{border-style:dashed;min-height:42px;background:transparent}
.slot{padding:5px 9px;font-size:12.5px;display:flex;justify-content:space-between;gap:6px}
.slot.win{font-weight:800;color:var(--gold)}.slot.lose{color:#c9b6c4;text-decoration:line-through;border-top:1px solid rgba(255,255,255,.08)}
.slot.win.champ{font-size:15px}
.mg{font-size:9px;color:#b9a7b4;font-weight:600;text-transform:uppercase}
.groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.grp{background:rgba(0,0,0,.18);border:1px solid var(--cardbd);border-radius:8px;padding:7px 9px}
.grp h4{margin:0 0 5px;color:var(--gold);font-size:12px}
.grp table{width:100%;border-collapse:collapse;font-size:12px}
.grp td{padding:2px 3px;border-bottom:1px dotted rgba(255,255,255,.1)}
.grp td.pts{text-align:right;font-weight:700}
.grp tr.adv td{background:rgba(245,197,66,.16)}
.grp tr.pend td{color:#b79fb1}
.panel{background:var(--card);border:1px solid var(--cardbd);border-radius:10px;padding:12px 14px;margin-top:18px}
.panel h3{margin:.1em 0 .5em;color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:1px}
.dq{font-size:12.5px;padding:2px 0}.dq span{color:#e58ab0}
</style></head><body>
<header><h1>&#127942; WORLD CUP &mdash; ${live ? 'LIVE' : 'FINAL'}</h1>
<div class="pill ${live ? 'live' : 'done'}">${live ? '&#9679; LIVE' : '&#10003; FINAL'} &middot; ${he(statusLine(st))}</div></header>
<div class="wrap">
<div class="bracket">${koCols}${champCol || (koCols ? '' : '<div class="kocol muted">knockout pending&hellip;</div>')}</div>
<div class="sec">Group stage</div><div class="groups">${groupCards || '<div class="muted">draw pending&hellip;</div>'}</div>
${dqHtml}
</div></body></html>`
}

// ─────────────────────────────────────────────────────────── CLI
function parseArgs(argv) {
  const a = { out: 'worldcup-live.html', once: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--events') a.events = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--once') a.once = true
  }
  return a
}
function readState(path) {
  let text = ''
  try { text = fs.readFileSync(path, 'utf8') } catch (e) { /* sink not created yet — render the waiting state */ }
  return fold(parseLines(text))
}
function writeAtomic(out, html) {
  const tmp = out + '.tmp'
  fs.writeFileSync(tmp, html)        // temp + rename so a watching browser never reads a half-written file
  fs.renameSync(tmp, out)
}
function sizeOf(p) { try { return fs.statSync(p).size } catch (e) { return -1 } }
function main() {
  const a = parseArgs(process.argv)
  if (!a.events) { console.error('usage: live-view.js --events <path-to-run-jsonl> [--out worldcup-live.html] [--once]'); process.exit(2) }
  // The sink is the run's persisted jsonl — potentially MBs (the whole transcript), not just events.
  // It only GROWS, and only on new events (tens of times over a run), so gate each re-read on a cheap
  // statSync(size): the steady-state poll is a stat, and we re-read + re-render only when bytes appear.
  let lastSize = -1
  const tick = () => { lastSize = sizeOf(a.events); const st = readState(a.events); writeAtomic(a.out, render(st)); return st }
  let st = tick()
  if (a.once || st.champion) { console.log(`live view -> ${a.out} (${st.champion ? 'final' : statusLine(st)})`); return }
  console.log(`live view watching ${a.events} -> ${a.out} (browser auto-refreshes every 2s)`)
  const iv = setInterval(() => {
    if (sizeOf(a.events) === lastSize) return  // no new bytes — skip the full re-read + re-render
    st = tick()
    if (st.champion) { clearInterval(iv); console.log('champion crowned; live view final.'); process.exit(0) }
  }, 1000)
  process.on('SIGINT', () => { clearInterval(iv); process.exit(0) })
}

module.exports = { parseLines, fold, render, statusLine }
if (require.main === module) main()
