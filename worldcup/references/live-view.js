#!/usr/bin/env node
'use strict'
// worldcup — Tier-1 LIVE VIEW consumer (PLAN_4 U17).
//
// Renders a self-contained, auto-refreshing worldcup-live.html so you can watch group standings
// form, eliminations land, and the bracket advance WHILE the background Workflow is still running.
// Dependency-free (Node stdlib only), read-only on the event sink, writes one static HTML file.
//
//   node live-view.js --events <path-to-journal.jsonl> --out worldcup-live.html [--once]
//
// THE SINK (U18 finding, 2026-06-20): a sandboxed Workflow's ONLY live-persisted egress is its
// agents' results. The orchestrator's log() lands in workflows/wf_<runId>.json — written ONCE at the
// end, not live. But subagents/workflows/<runId>/journal.jsonl streams one {type:"result",result:…}
// per agent AS IT COMPLETES. So the producer emits each tournament event as a cheap `agent()` whose
// structured result IS the event ({__wc:"EVENT", ev:…}) — a "beacon" — and we tail journal.jsonl.
// parseEvents() also still reads the legacy raw/wrapped `WCEVENT {…}` framing (the end run-file's
// logs[] + Tier-0 /workflows), so one reducer/renderer serves both the live view and post-run replay.
const fs = require('fs')

const STAKES_ORDER = ['R32', 'R16', 'QF', 'SF', 'FINAL']
const he = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// ── parse the event stream. Two framings, both reading only TRUSTED structure — never a marker found
// inside judged text. (The tool JUDGES prose, so an essay or a judge's verdict can contain a literal
// `WCEVENT {…}`; we must not let that forge a live event.)
//   (1) SPINE (live, primary): subagents/workflows/<runId>/journal.jsonl — one JSON record per line; a
//       worldcup "beacon" is a workflow agent `result` whose payload IS the event. We accept ONLY the
//       structured top-level `result.__wc==='EVENT'` — a judge's result text cannot reach this field.
//       {"type":"result","key":"v2:…","agentId":"…","result":{"__wc":"EVENT","ev":"draw",…}}
//   (2) LEGACY raw `WCEVENT {…}` line (Tier-0 framing). Scanned on the RAW line ONLY — we do NOT
//       JSON-parse + recurse into nested string VALUES. An orchestrator-emitted raw line parses; a
//       marker buried (escaped) inside a record's string value does not. This is the injection guard.
// Non-beacon results, narrator lines, and malformed/partial lines skip — never fatal. We re-read from the
// top each tick (events are few), so there's no byte-offset bookkeeping.
function parseEvents(text) {
  const events = []
  for (const raw of String(text == null ? '' : text).split('\n')) {
    if (!raw) continue
    // (1) spine journal — trust only the structured top-level result.__wc
    if (raw.indexOf('"__wc"') !== -1) {
      try {
        const rec = JSON.parse(raw)
        const r = rec && (rec.result && typeof rec.result === 'object' ? rec.result : rec)
        if (r && r.__wc === 'EVENT' && r.ev) { events.push(r); continue }
      } catch (e) { /* not a clean json line — fall through */ }
    }
    // (2) legacy RAW WCEVENT line only — no nested-string scavenging (the injection guard, see header)
    if (raw.indexOf('WCEVENT ') !== -1) {
      const ev = extractEvent(raw)
      if (ev) events.push(ev)
    }
  }
  return events
}
const parseLines = parseEvents   // back-compat alias (legacy call sites + probe)
// Pull a balanced JSON object that follows the `WCEVENT ` marker (robust to trailing record chars).
function extractEvent(s) {
  const i = s.indexOf('WCEVENT ')
  if (i === -1) return null
  const start = s.indexOf('{', i)
  if (start === -1) return null
  const obj = sliceBalanced(s, start)
  if (!obj) return null
  try { return JSON.parse(obj) } catch (e) { return null }
}
// Slice s from `start` to its matching close brace, respecting strings + escapes (so a `}` inside a
// string value doesn't end it early, and trailing content after the object is ignored).
function sliceBalanced(s, start) {
  let depth = 0, inStr = false, esc = false
  for (let j = start; j < s.length; j++) {
    const c = s[j]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (inStr) { if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { if (--depth === 0) return s.slice(start, j + 1) }
  }
  return null
}

// ── fold the event stream into tournament state. Beacons arrive in COMPLETION order, not emit order, so
// we sort by the producer's monotonic `seq` FIRST (legacy raw lines without seq keep file order). Then
// last-write-wins is correct because emit order is restored — a late draw/partial-groups/champion can no
// longer clobber newer state. Idempotent: re-folding the growing file yields the same state.
function fold(events) {
  const st = { field: null, groups: {}, groupOrder: [], dq: [], bracket: null, rounds: [], champion: null, gated: false, last: null }
  const ordered = (events || []).map((e, i) => ({ e, i, k: (e && typeof e.seq === 'number') ? e.seq : i })).sort((a, b) => a.k - b.k || a.i - b.i).map(x => x.e)
  for (const e of ordered) {
    if (!e || !e.ev) continue
    st.last = e.ev
    if (e.ev === 'draw') {
      st.field = e.field
      for (const g of e.groups || []) {
        if (!st.groups[g.group]) st.groupOrder.push(g.group)
        // merge, never wipe an already-folded table/advanced (defensive; seq makes draw precede groups anyway)
        const prev = st.groups[g.group] || {}
        st.groups[g.group] = { teams: g.teams || [], table: prev.table || null, advanced: prev.advanced || null }
      }
    } else if (e.ev === 'gate') {
      st.dq = e.disqualified || []
      st.gated = true   // the gate is emitted FIRST (before the draw), so remember it ran — otherwise a
                        // zero-DQ gate-only state is indistinguishable from an empty sink ("waiting").
    } else if (e.ev === 'groups') {
      for (const s of e.standings || []) {
        if (!st.groups[s.group]) { st.groupOrder.push(s.group); st.groups[s.group] = { teams: [] } }
        st.groups[s.group].table = s.table || []
        // never let an empty advanced (a partial snapshot) erase real advancers (defensive; seq orders these)
        if ((s.advanced && s.advanced.length) || st.groups[s.group].advanced == null) st.groups[s.group].advanced = s.advanced || []
      }
    } else if (e.ev === 'bracket') {
      // the full knockout tree, emitted once after seeding: every round + slot, round-1 matchups known,
      // the rest TBD (a/b null). Winners are advanced into later slots at render time (bracketTree).
      st.bracket = (e.rounds || []).map(r => ({ stakes: r.stakes, matches: (r.matches || []).map(m => ({ a: m.a == null ? null : m.a, b: m.b == null ? null : m.b })) }))
    } else if (e.ev === 'match') {
      // a single knockout result arriving as its game finishes — fill just that slot (the bracket fills
      // in piece by piece; siblings stay "playing"). A later `round` event backfills the full set.
      let r = st.rounds.find(x => x.stakes === e.stakes)
      if (!r) { r = { stakes: e.stakes, matches: [], eliminated: [] }; st.rounds.push(r) }
      r.matches[e.slot] = { winner: e.winner, loser: e.loser, margin: e.margin }
      if (e.loser != null && !r.eliminated.includes(e.loser)) r.eliminated.push(e.loser)
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

// Build the full knockout tree for rendering: every round + every slot, with each winner ADVANCED into
// its next-round slot (so you watch a team move on), and a per-match status — pending (slot TBD),
// playing (both names known, no result yet), or done (a result landed). Standard bracket feed: match i
// of a round flows into match ⌊i/2⌋ of the next (slot a if i even, b if odd).
function bracketTree(st) {
  if (!st.bracket || !st.bracket.length) return null
  const rounds = st.bracket.map(r => ({ stakes: r.stakes, matches: (r.matches || []).map(m => ({ a: m.a, b: m.b, winner: null, margin: null })) }))
  for (let ri = 0; ri < rounds.length; ri++) {
    const res = st.rounds.find(x => x.stakes === rounds[ri].stakes)
    if (!res) continue
    ;(res.matches || []).forEach((rm, mi) => {
      const M = rounds[ri].matches[mi]
      if (!M) return
      M.winner = rm.winner; M.margin = rm.margin
      if (M.a == null) M.a = rm.winner       // backfill if the structure slot was still TBD
      if (M.b == null) M.b = rm.loser
      const nxt = rounds[ri + 1]
      if (nxt) { const nm = nxt.matches[mi >> 1]; if (nm) { if (mi % 2 === 0) nm.a = rm.winner; else nm.b = rm.winner } }
    })
  }
  for (const r of rounds) for (const m of r.matches) m.status = m.winner ? 'done' : (m.a != null && m.b != null ? 'playing' : 'pending')
  return rounds
}

// "complete" = champion crowned AND the bracket has no playing/pending match left. Refresh + exit must
// key off THIS, not bare champion: the tiny champion beacon can land before heavier round/match beacons,
// so champion alone ≠ done (else the view freezes on an incomplete bracket and stops polling).
function complete(st) {
  if (!st.champion) return false
  const t = bracketTree(st)
  return !t || t.every(r => r.matches.every(m => m.status === 'done'))
}

function statusLine(st) {
  if (complete(st)) return `final · champion ${st.champion.label}`
  const tree = bracketTree(st)
  const playing = tree && tree.find(r => r.matches.some(m => m.status === 'playing'))
  if (playing) return `${playing.stakes} in progress`
  if (st.champion) return `champion ${st.champion.label} · awaiting late results…`
  if (st.rounds.length) return `${st.rounds[st.rounds.length - 1].stakes} in progress`
  if (st.bracket) return 'knockout underway'
  if (st.groupOrder.some(g => st.groups[g] && st.groups[g].table != null)) return 'group stage'
  if (st.groupOrder.length) return 'draw done · group stage pending'
  if (st.gated) return `fatal-flaw gate done${st.dq.length ? ` · ${st.dq.length} DQ` : ''} · seeding…`
  return 'waiting for the first event…'
}

// ── render one self-contained HTML snapshot. Mirrors renderReportV2's palette (purple pitch + gold)
// so live and final read as the same artifact. Live snapshots carry <meta refresh>; the final does not.
function render(st) {
  const live = !complete(st)   // keep <meta refresh> until the bracket is actually done, not just champion-present
  const groupCards = st.groupOrder.map(G => {
    const g = st.groups[G]
    const rows = g.table
      ? g.table.map(t => { const adv = (g.advanced || []).includes(t.label); return `<tr class="${adv ? 'adv' : ''}"><td>${adv ? '▸' : '&nbsp;'} ${he(t.label)}</td><td class="pts">${he(t.pts)}</td></tr>` }).join('')
      : (g.teams || []).map(t => `<tr class="pend"><td>${he(t.label)}</td><td class="pts">·</td></tr>`).join('')
    return `<div class="grp"><h4>Group ${he(G)}</h4><table>${rows}</table></div>`
  }).join('')
  // Full knockout TREE: every round + slot, winners advanced into the next round, per-match state.
  const tree = bracketTree(st)
  const slot = (name, cls, mg) => `<div class="slot ${cls}">${name == null ? '&mdash;' : he(name)}${mg ? `<span class="mg">${he(mg)}</span>` : ''}</div>`
  const matchHtml = m => {
    if (m.status === 'pending') return `<div class="match pending">${slot(null, 'tbd')}${slot(null, 'tbd')}</div>`
    if (m.status === 'playing') return `<div class="match playing">${slot(m.a, 'play')}<div class="vs">&#9679; playing</div>${slot(m.b, 'play')}</div>`
    const aw = m.winner != null && m.winner === m.a
    return `<div class="match done">${slot(m.a, aw ? 'win' : 'lose', aw ? m.margin : '')}${slot(m.b, aw ? 'lose' : 'win', aw ? '' : m.margin)}</div>`
  }
  const koCols = tree
    ? tree.map(r => `<div class="kocol"><div class="rnd">${he(r.stakes)}</div>${r.matches.map(matchHtml).join('')}</div>`).join('')
    : st.rounds.map(r => {  // legacy fallback: no `bracket` structure event — show completed rounds only
        const ms = r.matches.filter(m => m && m.winner != null).map(m => `<div class="match done">${slot(m.winner, 'win', m.margin)}${slot(m.loser, 'lose')}</div>`).join('')
        return `<div class="kocol"><div class="rnd">${he(r.stakes)}</div>${ms || `<div class="match pending">${slot(null, 'tbd')}</div>`}</div>`
      }).join('')
  const champCol = st.champion
    ? `<div class="kocol"><div class="rnd">Champion</div><div class="match done"><div class="slot win champ">${he(st.champion.label)} &#127942;</div></div></div>` : ''
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
.bracket{display:flex;gap:14px;overflow-x:auto;padding:14px 6px;align-items:stretch;justify-content:center;min-height:80px}
.kocol{min-width:138px;display:flex;flex-direction:column;justify-content:space-around;gap:8px}
.kocol.muted,.muted{color:#c9b6c4;font-size:12px;justify-content:center}
.rnd{font-weight:700;color:var(--gold);text-align:center;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin-bottom:2px}
.match{background:var(--card);border:1px solid var(--cardbd);border-radius:8px;overflow:hidden}
.match.pending{border-style:dashed;opacity:.4}
.match.playing{border-color:var(--gold);animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 1px rgba(245,197,66,.35)}50%{box-shadow:0 0 0 3px rgba(245,197,66,.85)}}
.slot{padding:5px 9px;font-size:12.5px;display:flex;justify-content:space-between;gap:6px;align-items:center;min-height:27px}
.slot+.slot{border-top:1px solid rgba(255,255,255,.08)}
.slot.win{font-weight:800;color:var(--gold)}
.slot.lose{color:#c9b6c4;text-decoration:line-through}
.slot.play{color:var(--txt)}
.slot.tbd{color:#8f7a8d}
.slot.win.champ{font-size:15px;justify-content:center}
.vs{font-size:8px;font-weight:700;text-align:center;color:var(--gold);letter-spacing:1px;padding:1px 0;background:rgba(245,197,66,.12);text-transform:uppercase}
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
  return fold(parseEvents(text))
}
function writeAtomic(out, html) {
  const tmp = out + '.tmp'
  fs.writeFileSync(tmp, html)        // temp + rename so a watching browser never reads a half-written file
  fs.renameSync(tmp, out)
}
function sizeOf(p) { try { return fs.statSync(p).size } catch (e) { return -1 } }
function main() {
  const a = parseArgs(process.argv)
  if (!a.events) { console.error('usage: live-view.js --events <path-to-journal.jsonl> [--out worldcup-live.html] [--once]'); process.exit(2) }
  // The sink is the run's spine journal (subagents/workflows/<runId>/journal.jsonl): one JSON record per
  // workflow agent, appended the moment it completes — so it only GROWS, a handful of times over a run.
  // Gate each re-read on a cheap statSync(size): the steady-state poll is a stat, and we re-read +
  // re-render only when new bytes appear.
  const GRACE_MS = 6000, IDLE_MS = 180000  // finalize 6s after the bracket completes; give up after 3min idle
  let lastSize = -1, idleSince = Date.now()
  const tick = () => { lastSize = sizeOf(a.events); const st = readState(a.events); writeAtomic(a.out, render(st)); return st }
  let st = tick()
  if (a.once || complete(st)) { console.log(`live view -> ${a.out} (${complete(st) ? 'final' : statusLine(st)})`); return }
  console.log(`live view watching ${a.events} -> ${a.out} (browser auto-refreshes every 2s)`)
  const iv = setInterval(() => {
    if (sizeOf(a.events) > lastSize) { idleSince = Date.now(); st = tick() }   // grew → re-read + re-render
    const idle = Date.now() - idleSince
    // finalize ONLY when the bracket is complete AND the journal has been quiet for the grace window — a
    // late round/match beacon can still arrive after the (tiny) champion beacon.
    if (complete(st) && idle > GRACE_MS) { clearInterval(iv); tick(); console.log('bracket complete; live view final.'); process.exit(0) }
    // safety net: champion never lands (its beacon failed/was capped) — never leak a polling process forever.
    if (idle > IDLE_MS) { clearInterval(iv); tick(); console.log('no new events for 3min; live view stopped (may be incomplete).'); process.exit(0) }
  }, 1000)
  process.on('SIGINT', () => { clearInterval(iv); process.exit(0) })
}

module.exports = { parseEvents, parseLines, fold, render, statusLine }
if (require.main === module) main()
