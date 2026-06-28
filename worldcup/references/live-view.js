#!/usr/bin/env node
'use strict'
// worldcup — Tier-1 LIVE VIEW consumer.
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
function parseEvents(text, nonce, stats) {
  const events = []
  for (const raw of String(text == null ? '' : text).split('\n')) {
    if (!raw) continue
    // (1) spine journal — trust only the structured top-level result.__wc, AND (when the launcher passed a
    // per-run nonce) the matching result.nonce. An agent can't know the nonce, so it can't forge a beacon
    // even by emitting a real __wc. No expected nonce → accept any (legacy/testing).
    if (raw.indexOf('"__wc"') !== -1) {
      try {
        const rec = JSON.parse(raw)
        const r = rec && (rec.result && typeof rec.result === 'object' ? rec.result : rec)
        if (r && r.__wc === 'EVENT' && r.ev) {
          if (stats) stats.seen++
          if (!nonce || r.nonce === nonce) { events.push(r); continue }
          if (stats) stats.rejected++   // a well-formed beacon with the wrong/absent nonce (config or mis-stamp)
        }
      } catch (e) { /* not a clean json line — fall through */ }
    }
    // (2) legacy RAW WCEVENT line — ONLY when no nonce is expected. Raw lines can't carry the per-run
    // nonce, so on an authenticated channel they aren't trusted; this path is for unauthenticated
    // replay / Tier-0 (and stays no-nested-string-scavenging, the injection guard, see header).
    if (!nonce && raw.indexOf('WCEVENT ') !== -1) {
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
  const st = { field: null, groups: {}, groupOrder: [], dq: [], bracket: null, rounds: [], champion: null, gated: false, seenSeq: false, last: null }
  const ordered = (events || []).map((e, i) => ({ e, i, k: (e && typeof e.seq === 'number') ? e.seq : i })).sort((a, b) => a.k - b.k || a.i - b.i).map(x => x.e)
  for (const e of ordered) {
    if (!e || !e.ev) continue
    if (typeof e.seq === 'number') st.seenSeq = true   // a beacon-fed run (vs a legacy raw stream)
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
  if (t) return t.every(r => r.matches.every(m => m.status === 'done'))
  // No bracket folded. For a BEACON-fed run (some event carried a seq) that means the bracket beacon
  // hasn't landed yet — or failed — and more events are still possible, so this is NOT done: keep
  // polling (the idle safety-exit is the backstop). Only a pure legacy stream (no seq, no bracket) is
  // finished at champion.
  return !st.seenSeq
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

// ── THEMES (3 curated looks). render(st, theme) emits one self-contained HTML snapshot; live snapshots carry
// <meta refresh>, the final does not. Default 'arena' (override with --theme or WORLDCUP_LIVE_THEME).
// ── SHARED bracket skeleton (used by the 2026 scoreboard + concrete). bracketHTML emits the columns + a
// computed SVG connector overlay (CONNECTORS) with clean, non-overlapping rails — clip per gap, path elbows,
// junction dots — so the tree reads at any field size. (arena renders its own bracketSVG variant.)
const STK = { R32: 'r32', R16: 'r16', QF: 'qf', SF: 'sf', FINAL: 'final' }
// Connector engine — the single source of truth for the bracket rails (both bracket variants use it). Per-gap
// clip keeps every stroke off the cards, path elbows (linejoin:round) leave no overshoot nub, a junction dot
// covers the colour seam at each T. Lines coloured by class via the connector vars: cw=winner→--rdone,
// ca=active/playing→--rwin, ce/cp=eliminated/pending→--rail. Returns the SVG inner markup (<defs> + groups);
// the caller supplies the <svg> wrapper (sizing differs). yOff lifts every y by a header band (0 = headerless).
function bracketConn(tree, W, G, H, yOff) {
  const SW2 = 1.5, EDGE = 2, JPAD = 0.4
  const yc = (i, M) => +(yOff + (i + 0.5) * H / M).toFixed(1)
  const L = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${c}"/>`
  const P = (d, c) => `<path d="${d}" class="${c}"/>`
  const feeder = m => (!m || m.winner == null) ? 'cp' : (m.elim ? 'ce' : 'cw')
  let defs = '', groups = ''
  for (let r = 0; r < tree.length - 1; r++) {
    const Mr = tree[r].matches.length, Mn = tree[r + 1].matches.length
    const xR = r * (W + G) + W, xLn = (r + 1) * (W + G), jx = xR + G / 2, cx0 = xR + EDGE, cx1 = xLn - EDGE
    defs += `<clipPath id="bk${r}" clipPathUnits="userSpaceOnUse"><rect x="${cx0}" y="0" width="${(cx1 - cx0).toFixed(1)}" height="${yOff + H}"/></clipPath>`
    let g = ''
    for (let j = 0; j < Mn; j++) {
      const yT = yc(2 * j, Mr), yB = yc(2 * j + 1, Mr), yM = yc(j, Mn)
      const mN = tree[r + 1].matches[j]
      const fwd = mN.status === 'done' ? 'cw' : (mN.status === 'playing' ? 'ca' : 'cp')
      const fT = feeder(tree[r].matches[2 * j]), fB = feeder(tree[r].matches[2 * j + 1])
      g += P(`M${cx0} ${yT}H${jx}V${yM}`, fT) + P(`M${cx0} ${yB}H${jx}V${yM}`, fB)
        + L(jx, yM, cx1, yM, fwd) + `<circle cx="${jx}" cy="${yM}" r="${SW2 + JPAD}" class="${fwd}"/>`
    }
    groups += `<g clip-path="url(#bk${r})">${g}</g>`
  }
  return `<defs>${defs}</defs>${groups}`
}
function bracketHTML(st, champGlyph, seedOf) {
  const tree = bracketTree(st)
  const slot = (name, cls, mg) => `<div class="sl ${cls}">${seedOf && name != null ? `<span class="seed">${he(seedOf(name) || '')}</span>` : ''}<span class="snm">${name == null ? '&mdash;' : he(name)}</span>${mg ? `<span class="mg">${he(mg)}</span>` : ''}</div>`
  const inner = m => {
    if (m.status === 'pending') return slot(null, 'tbd') + slot(null, 'tbd')
    if (m.status === 'playing') return slot(m.a, 'play') + slot(m.b, 'play')
    const aw = m.winner != null && m.winner === m.a
    return slot(m.a, aw ? 'win' : 'lose', aw ? m.margin : '') + slot(m.b, aw ? 'lose' : 'win', aw ? '' : m.margin)
  }
  // winner-path: mark a done match `elim` when its winner LOST in the next round, so themes can dim that
  // outgoing branch to "eliminated" (steel) and keep only the still-alive/champion route lit. Themes that
  // don't style `.elim` are unaffected.
  if (tree) tree.forEach((r, ri) => r.matches.forEach((m, mi) => {
    if (m.winner == null) return
    const nm = tree[ri + 1] && tree[ri + 1].matches[mi >> 1]
    m.elim = !!(nm && nm.winner != null && nm.winner !== m.winner)
  }))
  const matchHtml = m => `<div class="match ${m.status}${m.elim ? ' elim' : ''}"><div class="card">${m.status === 'playing' ? '<span class="lamp"></span>' : ''}${inner(m)}${m.status === 'playing' ? '<span class="liveTag">LIVE</span>' : ''}</div></div>`
  // SVG connector overlay via the shared bracketConn engine. y is offset by the header band HH so the overlay
  // blankets headers+matches and the cards (z1) sit on top; it spans only the KO region (koW) — champ is outside.
  const W = 184, G = 56, ROW = 78, HH = 30
  const koN = tree ? tree.length : 0
  const H = (tree && tree[0] ? tree[0].matches.length : 1) * ROW
  const koW = koN ? koN * W + (koN - 1) * G : 0
  const svg = koN > 1 ? `<svg class="conn" viewBox="0 0 ${koW} ${HH + H}" preserveAspectRatio="none" style="width:${koW}px;height:${HH + H}px">${bracketConn(tree, W, G, H, HH)}</svg>` : ''
  const colHtml = r => `<div class="round ${STK[r.stakes] || ''}"><div class="rh">${he(r.stakes)}</div><div class="matches" style="height:${H}px;padding-top:0">${r.matches.map(matchHtml).join('')}</div></div>`
  const cols = tree ? tree.map(colHtml).join('') : ''
  const champCard = st.champion
    ? `<div class="match done"><div class="card champcard"><span class="cup">${champGlyph}</span><span class="cnm">${he(st.champion.label)}</span><span class="csub">Champion</span></div></div>`
    : `<div class="match pending"><div class="card champcard off"><span class="cup">${champGlyph}</span><span class="cnm">&mdash;</span><span class="csub">awaiting final</span></div></div>`
  const champ = `<div class="round champ"><div class="rh">Champion</div><div class="matches" style="height:${H}px;padding-top:0">${champCard}</div></div>`
  return `<div class="bracketScroll"><div class="bracket">${svg}<div class="cols">${cols}${champ}</div></div></div>`
}
// Shared bracket + connector CSS. Themes override --rail/--rdone/--rwin to colour the rails and style
// .card/.rh/.match per palette. The connector overlay is SVG (one clean engine, same as arena) — NOT
// pseudo-elements: a vertical/horizontal stroke can't protrude onto a card, and junctions never gap.
const CONNECTORS = `
.bracketScroll{overflow-x:auto;padding:16px 6px 8px}
.bracket{position:relative;width:max-content}
.conn{position:absolute;left:0;top:0;z-index:0;pointer-events:none}
.conn line,.conn path{fill:none;stroke-width:3;stroke:var(--rail);stroke-linecap:butt;stroke-linejoin:round}
.conn line.cw,.conn path.cw{stroke:var(--rdone)}
.conn line.ca,.conn path.ca{stroke:var(--rwin)}
.conn circle{stroke:none;fill:var(--rail)}
.conn circle.cw{fill:var(--rdone)}
.conn circle.ca{fill:var(--rwin)}
.cols{display:flex;gap:56px;align-items:stretch;position:relative;z-index:1}
.round{display:flex;flex-direction:column;width:184px;flex:0 0 184px}
.round.champ{flex:0 0 218px;width:218px}
.rh{height:30px;box-sizing:border-box;flex:0 0 30px}
.matches{display:flex;flex-direction:column;justify-content:space-around}
.match{position:relative;display:flex;align-items:center;justify-content:center}
.card{position:relative;width:100%}
`
const hasRecord = t => t && t.w != null && t.d != null && t.l != null
const recordCell = t => hasRecord(t) ? `<td class="rec">${he(t.w)}-${he(t.d)}-${he(t.l)}</td>` : ''
const groupRow = (t, adv, tickClass) => {
  const rank = adv.indexOf(t.label)
  const isAdv = rank !== -1
  const third = rank === 2
  return `<tr class="${isAdv ? `adv${third ? ' third' : ''}` : ''}"><td class="nm">${isAdv ? `<i class="${tickClass}${third ? ' third' : ''}"></i>` : ''}${he(t.label)}</td>${recordCell(t)}<td class="pt">${he(t.pts)}</td></tr>`
}
function groupsHTML(st, tickClass) {
  const adv = G => (st.groups[G] && st.groups[G].advanced) || []
  return st.groupOrder.map(G => {
    const g = st.groups[G]
    const rows = g.table
      ? g.table.map(t => groupRow(t, adv(G), tickClass)).join('')
      : (g.teams || []).map(t => `<tr class="pend"><td class="nm">${he(t.label)}</td><td class="pt">&middot;</td></tr>`).join('')
    return `<div class="bug"><div class="bugL">${he(G)}</div><table>${rows}</table></div>`
  }).join('')
}
// Pill text: live → "LIVE · <status>"; final → "✓ Champion · <label>" (no "FINAL · final · champion" echo).
const pillInner = (st, live) => live
  ? `<span class="dot"></span>LIVE &middot; ${he(statusLine(st))}`
  : `&#10003; Champion &middot; ${he(st.champion ? st.champion.label : '&mdash;')}`

function renderScoreboard(st, T) {
  const live = !complete(st)
  const dq = st.dq.length
    ? `<div class="ticker"><div class="tkH">&#9888; Disqualified at the gate &middot; ${st.dq.length}</div><div class="tkB">${st.dq.map(d => `<span class="dqi"><b>${he(d.category || 'FLAW')}</b> ${he(d.label)}</span>`).join('')}</div></div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${live ? '<meta http-equiv="refresh" content="2">' : ''}<title>World Cup &mdash; ${live ? 'LIVE' : 'FINAL'}</title><style>
:root{${T.vars}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--txt);background:${T.bodyBg};min-height:100vh}
header{padding:30px 22px 8px;text-align:center;position:relative;overflow:hidden}
.yr{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:clamp(120px,20vw,190px);font-weight:900;letter-spacing:-.07em;color:var(--yrwm);line-height:1;pointer-events:none;z-index:0}
.kick{position:relative;z-index:1;font-size:11px;font-weight:900;letter-spacing:.2em;color:var(--accent);text-transform:uppercase}
header h1{position:relative;z-index:1;margin:3px 0 0;font-size:clamp(40px,7vw,66px);font-weight:900;letter-spacing:-.055em;line-height:.9}
.pill{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;margin-top:12px;padding:7px 16px;border-radius:5px;font-size:12px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
.pill.live{background:var(--liveSoft);color:var(--live);box-shadow:inset 0 0 0 1px var(--live)}
.pill.live .dot{width:9px;height:9px;border-radius:50%;background:var(--live);box-shadow:0 0 8px var(--live);animation:blink 1.6s steps(1) infinite}
.pill.done{background:var(--win);color:var(--winInk)}
@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:.25}}
.wrap{max-width:1340px;margin:0 auto;padding:6px 18px 44px}
${CONNECTORS}
.rh{font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:var(--accentInk);background:var(--accent);border-radius:4px 4px 0 0;padding:5px 9px;text-align:center}
.round.champ .rh{background:var(--win);color:var(--winInk)}
.matches{justify-content:space-around;gap:10px;padding-top:12px}
.card{background:var(--card);border-radius:5px;box-shadow:inset 4px 0 0 var(--cardHi)}
.match.pending .card{background:var(--cardDim);box-shadow:inset 4px 0 0 var(--pend)}
.match.done .card{box-shadow:inset 4px 0 0 var(--accent)}
.match.playing .card{box-shadow:inset 4px 0 0 var(--accent),0 0 0 1px var(--accent);border-top:1px solid var(--accent)}
.lamp{position:absolute;top:-4px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--live);box-shadow:0 0 7px var(--live);animation:blink 1.6s steps(1) infinite;z-index:2}
.liveTag{position:absolute;top:-9px;left:8px;font-size:8px;font-weight:900;letter-spacing:.1em;color:var(--live);background:var(--bg);padding:0 4px}
.sl{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;min-height:30px}
.sl+.sl{border-top:1px solid var(--hair)}
.snm{font-size:13px;font-weight:700}
.sl.win .snm{color:var(--win);font-weight:900}
.sl.lose .snm{color:var(--lose);text-decoration:line-through;text-decoration-thickness:1px}
.sl.tbd .snm{color:var(--tbd)}
.mg{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);white-space:nowrap}
.champcard{display:flex;flex-direction:column;align-items:center;gap:3px;padding:20px 16px;border-radius:7px;background:linear-gradient(180deg,var(--winSoft),transparent);box-shadow:inset 0 0 0 1.5px var(--win)!important;overflow:hidden}
.champcard::after{content:'';position:absolute;inset:-30% -10% auto;height:140%;background:radial-gradient(50% 60% at 50% 30%,var(--winGlow),transparent 70%);pointer-events:none}
.champcard.off{background:var(--cardDim);box-shadow:inset 0 0 0 1px var(--pend)!important}
.cup{font-size:42px;line-height:1;filter:drop-shadow(0 4px 12px var(--winGlow));z-index:1}
.champcard.off .cup{filter:grayscale(1);opacity:.4}
.cnm{font-size:clamp(18px,2.2vw,26px);font-weight:900;letter-spacing:-.02em;color:var(--win);text-align:center;line-height:1;z-index:1}
.champcard.off .cnm{color:var(--mut)}
.csub{font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);z-index:1}
.sec{font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin:30px 2px 12px;display:flex;align-items:center;gap:10px}
.sec::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--accent),transparent);opacity:.5}
.groups{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
.bug{background:var(--bg2);border-radius:6px;box-shadow:inset 0 0 0 1px var(--hair);padding:8px 9px;overflow:hidden}
.bugL{font-size:26px;font-weight:900;letter-spacing:-.03em;color:var(--bugL);line-height:.8;margin-bottom:4px}
.bug table{width:100%;border-collapse:collapse;font-size:12px}
.bug td{padding:3px 0}
.bug td.nm{color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px}
.bug td.rec{text-align:right;color:var(--mut);font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 6px 0 4px}
.bug td.pt{text-align:right;font-weight:800;color:var(--txt);font-variant-numeric:tabular-nums}
.bug tr.adv td.nm{color:var(--txt);font-weight:700}
.bug tr.adv td.nm .tk{display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--adv);margin-right:5px;vertical-align:middle}
.bug tr.adv td.nm .tk.third{width:auto;height:auto;min-width:12px;padding:0 3px;border:1px solid var(--adv);background:transparent;color:var(--adv);font-size:8px;font-weight:900;font-style:normal;line-height:1.1;text-align:center}
.bug tr.adv td.nm .tk.third::before{content:'3'}
.bug tr.pend td{color:var(--tbd)}
.ticker{margin-top:26px;border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--dqSoft);background:var(--dqBg)}
.tkH{background:var(--dq);color:var(--dqInk);font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px}
.tkB{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 12px;font-size:12.5px}
.dqi b{color:var(--dq);font-weight:900;letter-spacing:.04em;margin-right:6px}
${T.sig || ''}
@media(max-width:760px){.groups{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<header>${T.year ? `<div class="yr">${T.year}</div>` : ''}<div class="kick">${T.kicker}</div><h1>WORLD CUP</h1>
<div class="pill ${live ? 'live' : 'done'}">${pillInner(st, live)}</div></header>
<div class="wrap">
${bracketHTML(st, T.glyph || '&#127942;')}
<div class="sec">Group stage</div>
<div class="groups">${groupsHTML(st, 'tk') || '<div style="color:var(--mut)">draw pending&hellip;</div>'}</div>
${dq}
</div></body></html>`
}

// 2026 scoreboard config — an original tournament poster palette that fills the scoreboard var contract.
// It keeps the international-tournament energy without claiming official event identity.
const WC2026 = {
    kicker: '2026 &middot; Tournament', year: '26', glyph: '&#127942;',
    bodyBg: 'radial-gradient(125% 78% at 50% -12%,#1b1450 0,#0c1030 40%,var(--bg) 82%) fixed',
    vars: `--bg:#070912;--bg2:#0F1330;--card:#171c3e;--cardHi:#2c2f72;--cardDim:rgba(23,28,62,.55);--accent:#2BE3FF;--accentInk:#03121a;--txt:#F6F8FF;--mut:#98A1CE;--win:#FF2E8B;--winInk:#fff;--winSoft:rgba(255,46,139,.16);--winGlow:rgba(255,46,139,.42);--lose:#5A6298;--pend:#262c5e;--tbd:#3a4072;--adv:#2BE3FF;--hair:rgba(255,255,255,.08);--live:#FF2E8B;--liveSoft:rgba(255,46,139,.14);--dq:#FF8A3D;--dqInk:#1a0d08;--dqSoft:rgba(255,138,61,.3);--dqBg:#19110a;--bugL:#2c2f72;--yrwm:rgba(255,255,255,.05);--rail:#2c2f72;--rdone:#2BE3FF;--rglow:rgba(43,227,255,.45);--rwin:#FF2E8B;--rwinglow:rgba(255,46,139,.5)`,
    sig: `.yr{top:-30px;font-style:italic;letter-spacing:-.09em;opacity:.92;background:linear-gradient(118deg,#FF2E8B 4%,#FF7A2F 26%,#FFD23F 45%,#2BE3FF 68%,#7A6CFF 96%);-webkit-background-clip:text;background-clip:text;color:transparent}
header h1{color:#F6F8FF;text-shadow:0 2px 18px rgba(7,9,18,.7)}
.kick{letter-spacing:.2em;background:linear-gradient(90deg,#FF2E8B,#2BE3FF);-webkit-background-clip:text;background-clip:text;color:transparent}
header::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#FF2E8B,#FF7A2F,#FFD23F,#2BE3FF,#7A6CFF)}`,
}

function bracketSVG(st, seedOf, champGlyph) {
  const tree = bracketTree(st)
  if (!tree || !tree.length) return { html: '<div class="bracketScroll"><div class="ko"></div></div>', css: '' }
  tree.forEach((r, ri) => r.matches.forEach((m, mi) => {
    if (m.winner == null) { m.elim = false; return }
    const nm = tree[ri + 1] && tree[ri + 1].matches[mi >> 1]
    m.elim = !!(nm && nm.winner != null && nm.winner !== m.winner)
  }))
  const W = 184, G = 56, ROW = 78
  const H = tree[0].matches.length * ROW
  const koW = tree.length * W + (tree.length - 1) * G
  const slot = (name, cls, mg) => `<div class="sl ${cls}">${seedOf && name != null ? `<span class="seed">${he(seedOf(name) || '')}</span>` : ''}<span class="snm">${name == null ? '&mdash;' : he(name)}</span>${mg ? `<span class="mg">${he(mg)}</span>` : ''}</div>`
  const inner = m => {
    if (m.status === 'pending') return slot(null, 'tbd') + slot(null, 'tbd')
    if (m.status === 'playing') return slot(m.a, 'play') + slot(m.b, 'play')
    const aw = m.winner != null && m.winner === m.a
    return slot(m.a, aw ? 'win' : 'lose', aw ? m.margin : '') + slot(m.b, aw ? 'lose' : 'win', aw ? '' : m.margin)
  }
  const matchHtml = m => `<div class="match ${m.status}">${m.status === 'playing' ? '<span class="liveTag">LIVE</span>' : ''}<div class="card">${inner(m)}</div></div>`
  const cols = tree.map(r => `<div class="kocol"><div class="matches">${r.matches.map(matchHtml).join('')}</div></div>`).join('')
  // connectors via the shared bracketConn engine; arena has no header band, so yOff = 0.
  const svg = `<svg class="conn" viewBox="0 0 ${koW} ${H}" width="${koW}" height="${H}">${bracketConn(tree, W, G, H, 0)}</svg>`
  const champCard = st.champion
    ? `<div class="match done"><div class="card champcard"><span class="cup">${champGlyph}</span><span class="cnm">${he(st.champion.label)}</span><span class="csub">Champion</span></div></div>`
    : `<div class="match pending"><div class="card champcard off"><span class="cup">${champGlyph}</span><span class="cnm">&mdash;</span><span class="csub">awaiting final</span></div></div>`
  const html = `<div class="bracketScroll"><div class="ko"><div class="koInner">${svg}<div class="kocols">${cols}</div></div><div class="champcol"><div class="matches">${champCard}</div></div></div></div>`
  return { html, css: `.koInner{width:${koW}px;height:${H}px}.kocol .matches{height:${H}px}.champcol{height:${H}px}` }
}

// ════════════════════════════ ARENA — game-UI grammar (console sports HUD, not TV broadcast). Steel base, ONE
// mint system color (selected/live/active route), GOLD reserved for EARNED outcomes (winner row/route/champion).
// A progression-rail HUD ("R16 8/8 · QF 2/4 · SF LOCK"), a SPECTATOR/AUTO-SIM strip, octagon champion item,
// one mint focus-sweep on the live match. 80/15/5 color discipline; names upright; no faked ratings/controls.
function renderArena(st) {
  const live = !complete(st)
  const tree = bracketTree(st) || []
  // honest seed tag: each knockout team's group + finish rank (A1 = won group A). Not a faked OVR/position.
  const seedMap = {}
  for (const G of st.groupOrder) ((st.groups[G] && st.groups[G].advanced) || []).forEach((label, i) => { seedMap[label] = G + (i + 1) })
  const seedOf = label => seedMap[label] || ''
  const bsvg = bracketSVG(st, seedOf, '&#127942;')
  const rail = tree.map(r => {
    const done = r.matches.filter(m => m.status === 'done').length, total = r.matches.length
    const playing = r.matches.some(m => m.status === 'playing')
    return { stakes: r.stakes, done, total, status: done === total && total ? 'cmpl' : (playing || done > 0 ? 'live' : 'lock') }
  })
  const liveStage = (rail.find(r => r.status === 'live') || {}).stakes || (st.champion ? 'FINAL' : 'R16')
  // robust to a missing/late draw beacon: the format is known from st.field OR proven by any group that
  // advanced a third (advanced.length > 2), so a stale "top two" label can't show once thirds qualify.
  const anyThird = st.groupOrder.some(G => (((st.groups[G] || {}).advanced) || []).length > 2)
  const groupRule = (st.field === 48 || anyThird) ? 'top 2 + best thirds advance' : 'top two advance'
  const railHTML = rail.map(r => `<div class="stg ${r.status}"><span class="stgN">${he(r.stakes)}</span><span class="stgC">${r.status === 'lock' ? 'LOCK' : r.done + '/' + r.total}</span></div>`).join('')
  const dq = st.dq.length
    ? `<div class="gate"><div class="gateH"><span class="gx">&#9651;</span> Gate review &mdash; rejected <span class="gn">${st.dq.length}</span></div><div class="gateB">${st.dq.map(d => `<span class="dqi"><span class="dtag">${he(d.category || 'FLAW')}</span> ${he(d.label)}</span>`).join('')}</div></div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${live ? '<meta http-equiv="refresh" content="2">' : ''}<title>World Cup &mdash; ${live ? 'LIVE' : 'FINAL'}</title><style>
:root{--bg0:#05070B;--bg1:#09111A;--s0:#0E1722;--s1:#141F2B;--s2:#192633;--line:#2A3542;--txt:#F4F7FA;--mut:#8491A0;--ui:#37F0C0;--uiDim:#173D36;--uiGlow:rgba(55,240,192,.5);--gold:#F2C44C;--goldHi:#FFF0A3;--win:#F2C44C;--lose:#66717E;--pend:#36414D;--live:#FF3B5C;--dq:#FF683D;
 --rail:#2A3542;--rdone:#F2C44C;--rglow:rgba(242,196,76,.4);--rwin:#F2C44C;--rwinglow:rgba(242,196,76,.5)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--txt);min-height:100vh;background:
 radial-gradient(75% 60% at 50% -10%,#172536 0,var(--bg1) 45%,var(--bg0) 78%) fixed,
 repeating-linear-gradient(115deg,transparent 0 72px,rgba(55,240,192,.025) 73px 74px,transparent 75px 146px)}
.shell{max-width:1360px;margin:0 auto;padding:18px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px}
.brand{display:flex;align-items:center;gap:11px}
.bTrophy{font-size:30px;line-height:1;filter:drop-shadow(0 0 6px rgba(242,196,76,.4))}
.bName{font-size:22px;font-weight:900;font-style:italic;letter-spacing:-.04em;text-transform:uppercase;line-height:.92}
.bMode{font-size:10px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:var(--ui)}
.rail{display:flex;align-items:stretch;gap:6px}
.stg{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 11px;background:var(--s0);box-shadow:inset 0 0 0 1px var(--line);transform:skewX(-9deg)}
.stg>span{transform:skewX(9deg)}
.stgN{font-size:11px;font-weight:900;letter-spacing:.12em}.stgC{font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--mut);font-variant-numeric:tabular-nums}
.stg.live{background:var(--uiDim);box-shadow:inset 0 0 0 1px var(--ui)}.stg.live .stgN{color:var(--ui)}.stg.live .stgC{color:var(--ui)}
.stg.cmpl .stgN{color:var(--gold)}.stg.cmpl{box-shadow:inset 0 0 0 1px rgba(242,196,76,.4),inset 0 -3px 0 var(--gold)}
.stg.lock{opacity:.55}.stg.lock .stgN{color:var(--mut)}
.hud{display:flex;align-items:stretch;gap:0}
.hudSeg{font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;padding:6px 11px;background:var(--s0);box-shadow:inset 0 0 0 1px var(--line);color:var(--mut);transform:skewX(-9deg);display:flex;align-items:center}
.hudSeg>span{transform:skewX(9deg);display:flex;align-items:center;gap:6px}
.hudSeg.spec{color:var(--txt)}
.hudSeg.liveSeg{color:var(--live)}.hudSeg.liveSeg .d{width:7px;height:7px;border-radius:50%;background:var(--live);box-shadow:0 0 7px var(--live);animation:blink 1.6s steps(1) infinite}
.hudSeg.doneSeg{color:var(--gold)}
.hudSeg.stage{color:var(--ui)}
@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:.2}}
/* SVG bracket — connectors are an explicit <svg> overlay (bracketSVG); cards laid out so they align exactly. */
.bracketScroll{overflow-x:auto;padding-bottom:8px}
.ko{display:flex;gap:56px;align-items:center;padding:20px 6px 6px}
.koInner{position:relative;flex:0 0 auto}
.conn{position:absolute;inset:0;z-index:0;pointer-events:none}
/* Connectors decouple three concerns that kept fighting each other (per GPT Pro consult): (1) CARD CLEARANCE — a
   per-gap <clipPath> in bracketSVG hard-clips every stroke to the gutter, so nothing can paint into a card column
   (paint-order is NOT clipping: the card's translucent shadow would otherwise bleed over a flush line); (2) ELBOW
   CORNERS — each feeder+riser is ONE <path> with linejoin:round, so there is no overshoot nub to draw; (3) the
   T-SEAM — a small <circle> at the junction, coloured deliberately. Caps no longer do double duty. */
.conn line,.conn path{fill:none;stroke-width:3;stroke:var(--rail);stroke-linecap:butt;stroke-linejoin:round}
.conn line.cw,.conn path.cw{stroke:var(--rdone)}
.conn line.ca,.conn path.ca{stroke:var(--ui)}
.conn circle{stroke:none;fill:var(--rail)}
.conn circle.cw{fill:var(--rdone)}
.conn circle.ca{fill:var(--ui)}
.kocols{display:flex;gap:56px;height:100%;position:relative;z-index:1}
.kocol{width:184px;flex:0 0 184px;height:100%}
.kocol .matches{display:flex;flex-direction:column;justify-content:space-around}
.champcol{flex:0 0 250px;display:flex;align-items:center}
.champcol .matches{width:100%}
${bsvg.css}
.match{position:relative;display:flex;align-items:center;justify-content:center}
/* downward-only depth shadow (negative spread pulls the penumbra in from the sides) instead of filter:drop-shadow,
   whose wide Gaussian footprint bled a translucent mask over the connectors flanking each card. */
.card{position:relative;width:100%;background:linear-gradient(180deg,var(--s1),var(--s0));border-radius:3px;box-shadow:inset 0 0 0 1px var(--line),0 4px 8px -6px rgba(0,0,0,.55)}
.match.pending .card{background:var(--s0);box-shadow:inset 0 0 0 1px var(--line)}
.match.playing .card{box-shadow:inset 0 0 0 1px var(--ui);border-top:2px solid var(--ui);overflow:hidden}
.match.playing .card::after{content:'';position:absolute;z-index:4;top:0;left:-42%;width:42%;height:2px;background:linear-gradient(90deg,transparent,var(--ui),#fff,transparent);filter:drop-shadow(0 0 5px var(--ui));animation:sweep 2s linear infinite}
@keyframes sweep{to{transform:translateX(340%)}}
.lamp{display:none}
.liveTag{position:absolute;top:-8px;left:9px;font-size:8px;font-weight:900;letter-spacing:.12em;color:var(--live);background:var(--bg0);padding:0 4px;z-index:5}
.sl{display:flex;align-items:center;gap:9px;padding:7px 10px;min-height:32px}
.sl+.sl{border-top:1px solid rgba(255,255,255,.05)}
.match.pending .sl+.sl{border-top:1px dashed var(--line)}
.seed{flex:0 0 auto;font-size:11px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--mut);background:var(--s2);box-shadow:inset 0 0 0 1px var(--line);border-radius:2px;padding:2px 5px;min-width:26px;text-align:center}
.snm{flex:1;font-size:14px;font-weight:700;letter-spacing:-.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl.win{background:linear-gradient(90deg,rgba(242,196,76,.13),rgba(242,196,76,.03) 70%,transparent)}
.sl.win .snm{font-weight:900;color:var(--goldHi)}
.sl.win .seed{color:var(--gold);box-shadow:inset 0 0 0 1px rgba(242,196,76,.4)}
.sl.lose .snm{color:var(--lose);text-decoration:line-through;text-decoration-thickness:1px}
.sl.lose .seed{color:#4a5560}
.sl.play .snm{color:var(--txt)}
.sl.tbd .snm{color:#3a4450}.sl.tbd .seed{color:#3a4450}
.mg{flex:0 0 auto;font-size:8.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);background:var(--bg0);box-shadow:inset 0 0 0 1px rgba(242,196,76,.3);border-radius:2px;padding:2px 6px;white-space:nowrap}
.round.champ{flex:0 0 250px;width:250px}
.champ .matches{padding-top:8px}
.champcard{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:34px 18px;background:var(--gold);box-shadow:none!important;clip-path:polygon(22% 0,78% 0,100% 22%,100% 78%,78% 100%,22% 100%,0 78%,0 22%);filter:drop-shadow(0 6px 16px rgba(0,0,0,.5))}
.champcard::before{content:'';position:absolute;inset:2px;clip-path:polygon(22% 0,78% 0,100% 22%,100% 78%,78% 100%,22% 100%,0 78%,0 22%);background:radial-gradient(70% 70% at 50% 38%,var(--s2),var(--bg0));z-index:0}
.champcard.off{background:var(--line)}
.champcard.off::before{background:var(--s0)}
.cup{position:relative;z-index:1;font-size:42px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.champcard.off .cup{filter:grayscale(1);opacity:.45}
.cnm{position:relative;z-index:1;font-size:clamp(18px,2.2vw,26px);font-weight:900;font-style:italic;letter-spacing:-.03em;text-transform:uppercase;color:var(--goldHi);text-align:center;line-height:.95}
.champcard.off .cnm{color:var(--mut);font-style:normal}
.csub{position:relative;z-index:1;font-size:9px;font-weight:900;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
.champcard.off .csub{color:var(--mut)}
.sec{font-size:10px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:var(--mut);margin:30px 2px 12px;display:flex;align-items:center;gap:10px}
.sec b{color:var(--ui)}.sec::after{content:'';flex:1;height:1px;background:var(--line)}
.groups{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.bug{background:linear-gradient(180deg,var(--s1),var(--s0));box-shadow:inset 0 0 0 1px var(--line);border-radius:3px;padding:9px 11px;position:relative}
.bugT{display:flex;align-items:baseline;gap:7px;margin-bottom:5px}
.bugL{font-size:24px;font-weight:900;font-style:italic;letter-spacing:-.04em;line-height:.8;color:var(--txt)}
.bugLab{font-size:8px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.bug table{width:100%;border-collapse:collapse;font-size:12px}
.bug td{padding:3px 0}
.bug td.nm{color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
.bug td.rec{text-align:right;color:var(--mut);font-size:10px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 6px 0 4px}
.bug td.pt{text-align:right;font-weight:900;color:var(--txt);font-variant-numeric:tabular-nums}
/* advancing indicator: a mint tint across the qualified rows (a horizontal "qualification zone", no left rail) + the Q chip */
.bug tr.adv td{background:rgba(55,240,192,.08)}
.bug tr.adv td.nm{color:var(--txt);font-weight:700}
.bug tr.adv td.pt{color:var(--ui)}
.bug tr.adv td.nm .tk{display:inline-block;font-size:7px;font-weight:900;letter-spacing:.05em;color:#04140f;background:var(--ui);border-radius:2px;padding:1px 4px;margin-right:6px;vertical-align:middle}
.bug tr.adv td.nm .tk::before{content:'Q'}
.bug tr.adv td.nm .tk.third{color:var(--ui);background:transparent;box-shadow:inset 0 0 0 1px var(--ui);font-style:normal}
.bug tr.adv td.nm .tk.third::before{content:'3'}
.bug tr.pend td{color:#3a4450}
.gate{margin-top:26px;background:var(--s0);box-shadow:inset 0 0 0 1px var(--line),inset 0 2px 0 var(--dq);border-radius:3px}
.gateH{font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--dq);padding:8px 12px 4px;display:flex;align-items:center;gap:7px}
.gateH .gx{font-size:9px}.gateH .gn{color:var(--txt);background:var(--s2);box-shadow:inset 0 0 0 1px var(--line);border-radius:2px;padding:0 6px;margin-left:2px}
.gateB{display:flex;flex-wrap:wrap;gap:7px 16px;padding:4px 12px 11px;font-size:12.5px}
.dtag{font-size:9px;font-weight:900;letter-spacing:.05em;color:var(--dq);background:var(--bg0);box-shadow:inset 0 0 0 1px rgba(255,104,61,.4);border-radius:2px;padding:1px 5px;margin-right:5px}
@media(max-width:760px){.groups{grid-template-columns:repeat(2,1fr)}header{justify-content:center}}
</style></head><body>
<div class="shell">
<header>
<div class="brand"><span class="bTrophy">&#127942;</span><div><div class="bName">World Cup</div><div class="bMode">Arena</div></div></div>
<div class="rail">${railHTML || '<div class="stg lock"><span class="stgN">R16</span><span class="stgC">LOCK</span></div>'}</div>
<div class="hud"><span class="hudSeg spec"><span>Spectator</span></span><span class="hudSeg ${live ? 'liveSeg' : 'doneSeg'}"><span>${live ? '<span class="d"></span>Live' : '&#10003; Final'}</span></span><span class="hudSeg stage"><span>${live ? he(liveStage) : 'Champion'}</span></span><span class="hudSeg"><span>Auto 02s</span></span></div>
</header>
${bsvg.html}
  <div class="sec"><b>Group stage</b> &middot; ${groupRule}</div>
<div class="groups">${groupsArena(st) || '<div style="color:var(--mut)">draw pending&hellip;</div>'}</div>
${dq}
</div></body></html>`
}
// arena groups: console-like tiles with a GROUP micro-label + big id + mint Q badges (not gold).
function groupsArena(st) {
  const adv = G => (st.groups[G] && st.groups[G].advanced) || []
  return st.groupOrder.map(G => {
    const g = st.groups[G]
    const rows = g.table
      ? g.table.map(t => groupRow(t, adv(G), 'tk')).join('')
      : (g.teams || []).map(t => `<tr class="pend"><td class="nm">${he(t.label)}</td><td class="pt">&middot;</td></tr>`).join('')
    return `<div class="bug"><div class="bugT"><span class="bugL">${he(G)}</span><span class="bugLab">Group</span></div><table>${rows}</table></div>`
  }).join('')
}

// ════════════════════════════ CONCRETE — brutalist concrete-and-ink match poster. Heavy black borders, hard
// offset shadows, monospace, oversized Arial-Black headline, ONE safety-orange accent tracing the winner's
// road. No radius, no gradients, no glow. Reuses the shared bracket skeleton + connector rails (recoloured).
function renderConcrete(st) {
  const live = !complete(st)
  const dq = st.dq.length
    ? `<div class="ticker"><div class="tkH">&#9888; DISQUALIFIED AT THE GATE &middot; ${st.dq.length}</div><div class="tkB">${st.dq.map(d => `<span class="dqi"><b>${he(d.category || 'FLAW')}</b> ${he(d.label)}</span>`).join('')}</div></div>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${live ? '<meta http-equiv="refresh" content="2">' : ''}<title>WORLD CUP &mdash; ${live ? 'LIVE' : 'FINAL'}</title><style>
:root{--ink:#0B0B0B;--paper:#E8E4D8;--paper2:#DCD7C7;--accent:#FF3B00;--mut:#5B584E;--rail:#0B0B0B;--rdone:#FF3B00;--rglow:transparent;--rwin:#FF3B00;--rwinglow:transparent}
*{box-sizing:border-box}
body{margin:0;font:13px/1.4 ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:var(--ink);background:var(--paper);min-height:100vh;background-image:repeating-linear-gradient(0deg,transparent 0 38px,rgba(11,11,11,.025) 38px 39px)}
header{padding:28px 20px 14px;border-bottom:5px solid var(--ink);position:relative}
.kick{font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;margin-bottom:4px}
header h1{margin:0;font:900 clamp(44px,9vw,100px)/.84 'Arial Black','Helvetica Neue',system-ui,sans-serif;letter-spacing:-.04em;text-transform:uppercase}
header h1 .o{color:var(--accent);-webkit-text-stroke:2px var(--ink)}
.meta{position:absolute;top:28px;right:20px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;line-height:1.7}
.pill{display:inline-block;margin-top:14px;padding:6px 13px;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;border:2px solid var(--ink)}
.pill.live{background:var(--accent);color:var(--paper)}
.pill.done{background:var(--ink);color:var(--paper)}
.pill .dot{display:inline-block;width:8px;height:8px;background:var(--paper);margin-right:7px;vertical-align:middle;animation:blk 1s steps(1) infinite}
@keyframes blk{0%,50%{opacity:1}51%,100%{opacity:0}}
.wrap{max-width:1340px;margin:0 auto;padding:18px 18px 50px}
${CONNECTORS}
.bracket{padding-top:18px}
.rh{font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--paper);background:var(--ink);padding:5px 8px;text-align:center}
.round.champ .rh{background:var(--accent);color:var(--ink)}
.matches{justify-content:space-around;gap:12px;padding-top:14px}
.card{background:var(--paper2);border:2px solid var(--ink);box-shadow:4px 4px 0 var(--ink)}
.match.pending .card{background:transparent;border-style:dashed;box-shadow:none;opacity:.5}
.match.done .card{background:#F1EEE4}
.match.playing .card{box-shadow:4px 4px 0 var(--accent)}
.match.elim .card{box-shadow:2px 2px 0 var(--mut)}
.lamp{position:absolute;top:-2px;right:6px;width:8px;height:8px;background:var(--accent);animation:blk 1s steps(1) infinite;z-index:2}
.liveTag{position:absolute;top:-11px;left:-2px;font-size:9px;font-weight:900;letter-spacing:.08em;color:var(--paper);background:var(--accent);padding:1px 5px;border:2px solid var(--ink)}
.sl{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 9px;min-height:30px}
.sl+.sl{border-top:2px solid var(--ink)}
.snm{font-size:12.5px;font-weight:700;text-transform:uppercase}
.sl.win{background:var(--ink)}
.sl.win .snm{color:var(--paper);font-weight:900}
.sl.lose .snm{color:var(--mut);text-decoration:line-through;text-decoration-thickness:2px}
.sl.tbd .snm{color:var(--mut);opacity:.5}
.sl.play .snm{font-weight:800}
.mg{font-size:9px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;background:var(--accent);color:var(--ink);padding:1px 4px;white-space:nowrap}
.champcard{display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 14px;background:var(--accent);border:2px solid var(--ink);box-shadow:5px 5px 0 var(--ink)}
.champcard.off{background:transparent;border-style:dashed;box-shadow:none;opacity:.55}
.cup{font-size:40px;line-height:1}
.cnm{font-size:clamp(17px,2.1vw,24px);font-weight:900;letter-spacing:-.01em;text-transform:uppercase;text-align:center;line-height:1;color:var(--ink)}
.champcard.off .cnm{color:var(--mut)}
.csub{font-size:9px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--ink)}
.champcard.off .csub{color:var(--mut)}
.sec{font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin:34px 0 12px;padding-bottom:6px;border-bottom:3px solid var(--ink)}
.groups{display:grid;grid-template-columns:repeat(8,1fr);gap:0;border:2px solid var(--ink);border-right:0;border-bottom:0}
.bug{border-right:2px solid var(--ink);border-bottom:2px solid var(--ink);padding:8px 9px;background:var(--paper2);overflow:hidden}
.bugL{font:900 22px/.8 'Arial Black','Helvetica Neue',system-ui,sans-serif;margin-bottom:5px}
.bug table{width:100%;border-collapse:collapse;font-size:11.5px}
.bug td{padding:2px 0}
.bug td.nm{text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px;color:var(--mut)}
.bug td.rec{text-align:right;color:var(--mut);font-size:9.5px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 6px 0 4px}
.bug td.pt{text-align:right;font-weight:900;font-variant-numeric:tabular-nums}
.bug tr.adv td.nm{color:var(--ink);font-weight:700}
.bug tr.adv td.nm .tk{display:inline-block;width:7px;height:7px;background:var(--accent);margin-right:5px;vertical-align:middle}
.bug tr.adv td.nm .tk.third{width:auto;height:auto;min-width:12px;padding:0 2px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-size:8px;font-weight:900;font-style:normal;line-height:1.1;text-align:center}
.bug tr.adv td.nm .tk.third::before{content:'3'}
.bug tr.pend td{color:var(--mut);opacity:.5}
.ticker{margin-top:28px;border:2px solid var(--ink)}
.tkH{background:var(--accent);color:var(--ink);font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;border-bottom:2px solid var(--ink)}
.tkB{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 12px;font-size:12px}
.dqi b{font-weight:900;margin-right:6px;text-transform:uppercase}
@media(max-width:760px){.groups{grid-template-columns:repeat(2,1fr)}.meta{display:none}}
</style></head><body>
<header><div class="meta">${live ? '&#9679; LIVE FEED' : 'FINAL'}<br>${he(statusLine(st))}</div>
<div class="kick">Open Bracket &middot; Live Tournament &middot; Concrete Cut</div>
<h1>W<span class="o">O</span>RLD CUP</h1>
<div class="pill ${live ? 'live' : 'done'}">${live ? '<span class="dot"></span>LIVE' : '&#10003; CHAMPION &middot; ' + he(st.champion ? st.champion.label : '&mdash;')}</div></header>
<div class="wrap">
${bracketHTML(st, '&#127942;')}
<div class="sec">GROUP STAGE</div>
<div class="groups">${groupsHTML(st, 'tk') || '<div style="padding:10px">DRAW PENDING&hellip;</div>'}</div>
${dq}
</div></body></html>`
}

// Theme registry + dispatcher. live-view's tick() calls render(st); the theme is chosen once at startup.
// Three curated looks: arena (game-UI console), concrete (brutalist match poster), 2026 (poster scoreboard).
const THEMES = {
  'arena': renderArena, 'concrete': renderConcrete, '2026': st => renderScoreboard(st, WC2026),
}
let LIVE_THEME = process.env.WORLDCUP_LIVE_THEME || 'arena'
function render(st, theme) { return (THEMES[theme || LIVE_THEME] || renderArena)(st) }

// ─────────────────────────────────────────────────────────── CLI
function parseArgs(argv) {
  const a = { out: 'worldcup-live.html', once: false, nonce: '', nonceProvided: false, theme: '', switcher: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--events') a.events = argv[++i]
    else if (argv[i] === '--out') a.out = argv[++i]
    else if (argv[i] === '--nonce') { a.nonce = argv[++i] || ''; a.nonceProvided = true }   // per-run provenance
    else if (argv[i] === '--theme') a.theme = argv[++i] || ''   // see THEMES keys
    else if (argv[i] === '--switcher') a.switcher = true        // emit every theme + a sticky theme-switcher bar
    else if (argv[i] === '--once') a.once = true
  }
  return a
}
// Theme switcher: render EVERY theme to <stem>-<key>.html, each with a sticky top bar linking to its siblings,
// and make --out the default theme's page. Pure HTML links (no JS) — clicking navigates to that theme's file,
// which carries its own <meta refresh> so the live feed keeps updating after you switch.
function injectNav(html, curKey, keys, base) {
  const tab = k => `<a href="${base}-${k}.html" style="padding:7px 11px;font:700 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.07em;text-transform:uppercase;text-decoration:none;color:${k === curKey ? '#0a0a0a' : '#9aa'};background:${k === curKey ? '#FFD23F' : 'transparent'};border-right:1px solid #2a2a2a">${k}</a>`
  const bar = `<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;flex-wrap:wrap;align-items:center;background:#0a0a0a;border-bottom:1px solid #2a2a2a"><span style="padding:7px 11px;font:900 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#FFD23F">&#127942; THEME &#9656;</span>${keys.map(tab).join('')}</div><div style="height:33px"></div>`
  return html.replace('<body>', '<body>' + bar)
}
function writeSwitcher(a, st) {
  const stem = a.out.replace(/\.html?$/i, ''), base = stem.split('/').pop(), keys = Object.keys(THEMES)
  for (const k of keys) writeAtomic(`${stem}-${k}.html`, injectNav(render(st, k), k, keys, base))
  writeAtomic(a.out, injectNav(render(st, LIVE_THEME), LIVE_THEME, keys, base))   // landing = the chosen theme
}
let warnedNonceMiss = false
function readState(path, nonce) {
  let text = ''
  try { text = fs.readFileSync(path, 'utf8') } catch (e) { /* sink not created yet — render the waiting state */ }
  const stats = { seen: 0, rejected: 0 }
  const st = fold(parseEvents(text, nonce, stats))
  // Finding 1: a silent nonce mismatch looks identical to "not started yet". If beacons are present but
  // none match the expected nonce, say so once — the #1 cause of a mysterious blank live view.
  if (nonce && !warnedNonceMiss && stats.seen > 0 && stats.seen === stats.rejected) {
    warnedNonceMiss = true
    console.error(`live-view: ${stats.seen} beacon(s) present but NONE matched --nonce "${nonce}" — check it equals the run's args.liveNonce`)
  }
  return st
}
function writeAtomic(out, html) {
  const tmp = out + '.tmp'
  fs.writeFileSync(tmp, html)        // temp + rename so a watching browser never reads a half-written file
  fs.renameSync(tmp, out)
}
function sizeOf(p) { try { return fs.statSync(p).size } catch (e) { return -1 } }
function main() {
  const a = parseArgs(process.argv)
  if (!a.events) { console.error(`usage: live-view.js --events <path-to-journal.jsonl> [--out worldcup-live.html] [--nonce <token>] [--theme <${Object.keys(THEMES).join('|')}>] [--switcher] [--once]`); process.exit(2) }
  // Theme: --theme wins over WORLDCUP_LIVE_THEME (set in parseArgs' default via the env). Warn on a typo
  // rather than silently falling back, so a mis-set theme doesn't look like the default was intended.
  if (a.theme) { if (!THEMES[a.theme]) console.error(`live-view: unknown --theme "${a.theme}" — using arena; valid: ${Object.keys(THEMES).join(', ')}`); LIVE_THEME = THEMES[a.theme] ? a.theme : 'arena' }
  // Finding 3: surface the auth posture — otherwise the control this PR adds is off/misconfigured silently.
  if (a.nonceProvided && !a.nonce) console.error('live-view: --nonce was given but is empty — every beacon will be rejected; pass the same token you set as args.liveNonce')
  else if (!a.nonceProvided) console.error('live-view: no --nonce — accepting any beacon (unauthenticated / legacy mode)')
  // The sink is the run's spine journal (subagents/workflows/<runId>/journal.jsonl): one JSON record per
  // workflow agent, appended the moment it completes — so it only GROWS, a handful of times over a run.
  // Gate each re-read on a cheap statSync(size): the steady-state poll is a stat, and we re-read +
  // re-render only when new bytes appear.
  const GRACE_MS = 6000, IDLE_MS = 180000  // finalize 6s after the bracket completes; give up after 3min idle
  let lastSize = -1, idleSince = Date.now()
  const tick = () => { lastSize = sizeOf(a.events); const st = readState(a.events, a.nonce); a.switcher ? writeSwitcher(a, st) : writeAtomic(a.out, render(st)); return st }
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

module.exports = { parseEvents, parseLines, fold, render, statusLine, bracketTree, complete, THEMES }
if (require.main === module) main()
