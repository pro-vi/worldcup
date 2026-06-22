// WORLD CUP — ultracode Workflow template.
// Copy this into a Workflow({ script }) call and fill the four FILL blocks:
//   (1) meta, (2) CONFIG, (3) CRITERIA + INCUMBENT + TARGET, (4) the contestant source.
// Everything else (seeding, groups, knockout crossings, the judge pipeline, Elo,
// trust report) is done. See references/judging.md and references/brackets.md for
// the why. Workflow scripts are plain JS: no Date.now / Math.random / new Date.

// ─────────────────────────────────────────────────────────────── (1) META
export const meta = {
  name: 'worldcup',
  description: 'FILL: e.g. "Stage 32 essay variants as a World Cup and crown a winner"',
  phases: [
    { title: 'Generate' },   // drop this phase entry if contestants are GIVEN
    { title: 'Seed' },
    { title: 'Groups' },
    { title: 'Knockout' },
  ],
}

// ─────────────────────────────────────────────────────────────── (2) CONFIG
const FIELD = 32                // 32 or 48
const GROUPS = FIELD === 48 ? 12 : 8
const SOURCE = 'generate'      // 'generate' | 'given'
const USE_INCUMBENT = true     // is there a reference original to beat? (enables the reference challenge)
const SCREENERS = 3            // fabrication-gate judges per entry: 1 = MVP, 3 = maximal (DQ needs same-category majority)
const BANS = {                 // FILL: deterministic preflight bans (cheap, run before any agent)
  emDash: true,                // em dash is an auto-DQ for Provi prose
  vocab: ['delve', 'harness', 'unlock', 'realm', 'seamless', 'ultimately', 'furthermore', 'profound', 'tapestry', 'testament'],
}
const LETTERS = 'ABCDEFGHIJKL'.split('')

// ─── DESIGN — how candidates are created (see references/design-pass.md).
// kind:'flat' = the classic FLAVORS list (one nominal axis). kind:'axes' = a factorial
// grid: candidates are points in a coordinate system, the field is a (possibly fractional)
// cross-product of orthogonal axes. kind:'sections' = a compositional design: the artifact
// is S slots (positions), each with its own candidates (players); a candidate is a chosen
// LINEUP (one variant per slot), assembled deterministically and judged with a coherence lens.
const DESIGN = {
  kind: 'flat',                 // 'flat' | 'axes' | 'sections'
  // --- kind:'flat' (FILL: FIELD distinct angle seeds) ---
  flavors: [ /* { name, brief }, ... length === FIELD */ ],
  // --- kind:'axes' ---
  mode: 'forced',               // 'forced' (axes given) | 'dynamic' (axis-finder proposes them)
  axes: [ /* { name, values: { valueLabel: 'prompt fragment', ... } }, ...; product reconciled to FIELD */ ],
  // --- kind:'sections' (FILL the slots; ∏ survivors is reconciled to FIELD like axes) ---
  // Each slot is a CONTEST: count>=2. The output is exactly the declared slots joined in order
  // (BASE is reference context, not output), so every output section must be a contested slot.
  // Size it so ∏(min(keepPerSlot,count)) is >= FIELD/4 (hard floor) and ideally >= FIELD, else the
  // field is mostly replicated clones — e.g. keepPerSlot:2 needs >=5 slots to reach 32 distinct.
  sections: {
    keepPerSlot: 2,             // top-k variants kept per slot — the squad depth at each position
    slots: [ /* { slot: 'hook', count: 4, brief: 'how to open the piece' }, ...; >=2 slots, count>=2 */ ],
  },
}

// ──────────────────────────────────────────── (3) CRITERIA + INCUMBENT + TARGET (FILL)
// The taste spec + hard disqualifiers, pasted into every juror prompt. For Provi
// prose, distill the /provi-voice hard rules here. Be specific; vagueness = no taste.
//
// CRITIQUE / RESPONSE RUNS: if the field critiques, responds to, or makes factual claims
// about a NAMED EXTERNAL WORK, do not trust the draft's summary of that work. FETCH it
// first (WebFetch the original as the spine; WebSearch/exa/grep/context7 to locate +
// corroborate by domain; second-source it) and paste its real claims/scope/quotes — with
// SOURCES + FETCHED date — into TARGET below. The draft's characterization of the target is
// a claim to verify, not ground truth. Put target material ONLY in TARGET, never inline in
// the rubric. Leave TARGET='' for runs with no external target (the default). For headless /
// no-operator runs, a phase-0 fetch agent using built-in WebFetch/WebSearch is the fallback.
const TARGET_RAW = ''  // FILL for critique/response runs only; '' otherwise (see note above)
const TARGET = TARGET_RAW.trim()  // whitespace-only is NOT a target — activation requires a real anchor, not just a truthy string

// ─────────────────────────── (U20/P2) STRUCTURED SOURCE PACKET + the mechanical fact-ledger proof
// PLAN_3 U20: the fact ledger today is PROSE inside CRITERIA_BASE — checking a planted specific
// against prose is itself prompt-parsing, not a proof. This makes the ledger a STRUCTURED object,
// the SINGLE SOURCE OF TRUTH: the prose the judges read is RENDERED from it (renderLedger), and
// ledgerLookup(span) is a real set-membership/substring check returning SUPPORTED|UNSUPPORTED with
// provenance and NO LLM call — the mechanical proof U11's truth anchors stand on. The DEFAULT packet
// is the unfilled template, so its render reproduces today's CRITERIA_BASE byte-for-byte (the
// qualifier is opt-in; nothing changes until an operator fills the packet or U12 certifies one).
const DEFAULT_NOT_ALLOWED = ['invented line numbers', 'class/file names', 'stack traces',
  'error messages', 'dates', 'names', 'places', 'quotes', 'scenes']
// The exact hand-authored ledger block for the UNFILLED template packet — the byte-identity anchor.
// renderLedger returns THIS verbatim for the default packet; once facts/entities are added it renders
// STRUCTURED prose. (The default short-circuit is why a no-packet run is byte-for-byte unchanged.)
const FILL_LEDGER_PROSE =
`- FACT LEDGER (what is actually true; everything concrete must trace here): FILL.
- NOT ALLOWED unless in the ledger: invented line numbers, class/file names, stack
  traces, error messages, dates, names, places, quotes, scenes, or any concrete detail
  presented as lived fact. Manufactured specificity is a flaw, not a strength.`
// The structured fact ledger. supported_facts = concrete things that ARE true (variants may use
// them); allowed_entities = the named specifics permitted, bucketed by kind; not_allowed = entity
// classes barred unless they trace to the ledger; target = the structured twin of TARGET, a forward-
// declaration for U11/U12 target-truth — NOT consumed by U20 (ledgerLookup checks author-truth only;
// target-truth stays the prose MISREPRESENTS_TARGET gate). Default = the unfilled template (FILL).
const SOURCE_PACKET = {
  supported_facts: [],                                                            // strings: true, supported facts
  allowed_entities: { dates: [], names: [], files: [], quotes: [], places: [] }, // permitted specifics, by kind
  not_allowed: DEFAULT_NOT_ALLOWED,                                              // entity classes barred unless in the ledger
  target: TARGET ? { raw: TARGET, claims: [], scope: '', quotes: [], sources: [] } : null,
}
// True only for the UNFILLED template: no facts and no allowed entities of any kind.
const packetUnfilled = p => !((p && p.supported_facts) || []).length &&
  Object.values((p && p.allowed_entities) || {}).every(v => !(v || []).length)
// Render the prose fact-ledger lines FROM the structured packet (one source of truth). The unfilled
// default reproduces FILL_LEDGER_PROSE byte-for-byte; a populated packet lists each fact + allowed
// entity ON ITS OWN LINE so the prose the judges read can never be re-parsed differently from what
// ledgerLookup checks. Guards are defensive: a raw (un-validated) packet must not throw here.
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
const renderLedger = (packet = SOURCE_PACKET) => {
  const p = packet || {}
  // Respect an EXPLICIT not_allowed (even []); substitute the default ONLY when it is absent/non-array.
  // An empty list means the operator cleared the class-level bans — rendering the default 9 classes
  // would tell judges to enforce bans the structured packet doesn't carry (single-source-of-truth leak).
  const na = Array.isArray(p.not_allowed) ? p.not_allowed : DEFAULT_NOT_ALLOWED
  // The unfilled default renders today's prose byte-for-byte. Compare not_allowed BY VALUE (not
  // reference) so a JSON-roundtripped / U12-rebuilt default still reproduces it (no silent drift).
  if (packetUnfilled(p) && sameList(na, DEFAULT_NOT_ALLOWED)) return FILL_LEDGER_PROSE
  const lines = []
  for (const f of (Array.isArray(p.supported_facts) ? p.supported_facts : [])) lines.push(`  - ${f}`)
  const ents = p.allowed_entities
  if (ents && typeof ents === 'object' && !Array.isArray(ents))
    for (const [k, vals] of Object.entries(ents))
      if (Array.isArray(vals)) for (const v of vals) lines.push(`  - ${k}: ${v}`)
  const body = lines.join('\n') || '  FILL.'
  const banned = na.length ? `${na.join(', ')}, or any` : 'any'   // empty list ⇒ drop the leading enumeration
  return `- FACT LEDGER (what is actually true; everything concrete must trace here):
${body}
- NOT ALLOWED unless in the ledger: ${banned} concrete detail presented as lived fact. Manufactured specificity is a flaw, not a strength.`
}
// Mechanical fact-ledger lookup — NO LLM CALL. A span is SUPPORTED iff it traces to the structured
// packet, matched WHOLE-TOKEN (punctuation stays in-token, so a compound value is atomic and its
// fragments are NOT forgeable):
//   • a supported_fact contains the span as a contiguous run of whitespace tokens
//     ('three days' ⊂ 'took three days'; '417' ⊄ 'ran 4170 iterations'; 'test.ts' ⊄ 'config.test.ts'), OR
//   • an allowed_entities member EQUALS the span as a whole value ('Parser.ts' matches 'Parser.ts',
//     but 'Parser', '15' from '2024-03-15', 'users' from '/api/v2/users' do NOT).
// Else UNSUPPORTED. Provenance names the source on a hit. NOTE: not_allowed is ADVISORY prose for the
// judges; support is fact/entity membership only — ledgerLookup never consults not_allowed or the
// target twin (target-truth stays the MISREPRESENTS_TARGET gate). This is the deterministic proof
// U11 stands on, so it errs UNSUPPORTED: a fragment of a compound value never excuses a fabrication.
const normLedger = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim()
const hasAlnum = s => /[\p{L}\p{N}]/u.test(s)   // Unicode-aware: an all-punctuation span (',', '...') is never support
const toksLedger = s => s.split(' ').filter(Boolean)
// needle's tokens appear as an unbroken run in hay's tokens, matched whole-token (exact equality).
const tokenRun = (hay, needle) => {
  if (!needle.length) return false
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let m = true
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { m = false; break }
    if (m) return true
  }
  return false
}
const ledgerLookup = (span, packet) => {
  // Resolve the packet at CALL time: an explicit arg wins; else the ACTIVE evaluator's packet; else an
  // EMPTY packet — never the module template. Once U12 reassigns EVALUATOR, lookup follows the same
  // packet the prompts render from. If the active evaluator is a prose-only config (no sourcePacket,
  // which validation allows), nothing is mechanically supported (errs UNSUPPORTED) rather than leaking
  // facts from a stale/filled module SOURCE_PACKET the active judges never see.
  const p = packet || (EVALUATOR && EVALUATOR.sourcePacket) || {}
  const needle = normLedger(span)
  if (!needle || !hasAlnum(needle)) return { status: 'UNSUPPORTED', provenance: null }
  const nToks = toksLedger(needle)
  for (const fact of (Array.isArray(p.supported_facts) ? p.supported_facts : []))
    if (typeof fact === 'string' && tokenRun(toksLedger(normLedger(fact)), nToks))
      return { status: 'SUPPORTED', provenance: { kind: 'fact', value: fact } }
  const ents = p.allowed_entities
  if (ents && typeof ents === 'object' && !Array.isArray(ents))
    for (const [bucket, vals] of Object.entries(ents))
      if (Array.isArray(vals)) for (const v of vals)
        if (typeof v === 'string' && normLedger(v) === needle)
          return { status: 'SUPPORTED', provenance: { kind: bucket, value: v } }
  return { status: 'UNSUPPORTED', provenance: null }
}

const CRITERIA_BASE = `FILL: the source packet — rubric, fact ledger, disqualifiers.
Example for Provi prose:
- Voice: follow-the-thought, affirmative not question-led, cross-domain without
  signposting, deflating close, varied sentence length, non-native texture is fine.
${renderLedger(SOURCE_PACKET)}
- HARD DISQUALIFIERS: any em dash; banned LLM vocab (delve, harness, unlock,
  navigate-metaphorical, realm, seamless, ultimately, furthermore, profound, ...);
  an announced thesis; a swelling uplift closer; AND fabricated specifics presented
  as lived fact. For a personal essay that is a lie and an automatic disqualification.
- TASTE IS EARNEDNESS: concrete detail counts only if source-supported and necessary;
  rhythm only if it clarifies thought; an ending only if it lands without inflating.`

// TARGET feeds the criteria/packet channel (reaches generation, seed, gate, and lenses via
// CRITERIA_BLOCK), and the gate clause is CO-DERIVED from the same TARGET const, so the
// packet material and its enforcement cannot desync. All separators live inside the truthy
// branch: TARGET='' contributes literally zero bytes (construction invariant asserted below).
const TARGET_BLOCK = TARGET ? `\n\nTARGET (the external work this field critiques/responds to — verify every candidate claim ABOUT it against this; do not inherit the draft's characterization):\n${TARGET}` : ''
const CRITERIA_BLOCK = CRITERIA_BASE + TARGET_BLOCK
const targetGateClause = TARGET ? `\n\nTARGET FIDELITY: if the entry attributes to the TARGET any claim, concession, or scope its source above does not support (including broadening the target's claim into a strawman), disqualify with category MISREPRESENTS_TARGET.` : ''
// Construction invariant (not a full byte-identity proof): with no target, the target layer
// adds nothing on top of the base. It cannot police target material pasted into CRITERIA_BASE
// — that is doctrine's job (keep target material in TARGET only).
if (!TARGET && (TARGET_BLOCK !== '' || targetGateClause !== '' || CRITERIA_BLOCK !== CRITERIA_BASE))
  throw new Error('TARGET empty but the target layer leaked text — construction invariant violated')

// Hard-DQ category vocabulary — the SINGLE source of truth for the schema enum, the gate
// prompt, and the tally. MISREPRESENTS_TARGET is present ONLY when a TARGET exists, so a
// non-target run cannot offer it, cannot return it (schema forbids), and the tally ignores it
// even if a screener invents it — inert by construction, not just by doctrine.
const HARD_DQ_CATEGORIES = ['FABRICATED_CONCRETE_DETAIL', 'FAKE_AUTHORITY_SIGNAL',
  'FALSE_AUTHORIAL_EXPERIENCE', 'CONTRADICTS_SOURCE',
  ...(TARGET ? ['MISREPRESENTS_TARGET'] : []),
  'GENRE_BREACH', 'HOUSE_STYLE_HARD_BAN', 'PLAGIARISTIC_OR_NON_RESPONSIVE']
// Violation FAMILIES for the gate tally. A real fabrication is usually several overlapping
// subtypes at once (an invented first-person stack trace is FABRICATED_CONCRETE_DETAIL AND
// FAKE_AUTHORITY_SIGNAL AND FALSE_AUTHORIAL_EXPERIENCE), so requiring the same SUBTYPE would let
// three screeners who all correctly see fabrication — but name it differently — wrongly PASS it.
// The overlapping fabrication subtypes share one family; distinct failure modes (genre, style,
// responsiveness) stay separate so two unrelated hallucinations can't combine to DQ a clean entry.
const DQ_FAMILY = {
  FABRICATED_CONCRETE_DETAIL: 'fabrication', FAKE_AUTHORITY_SIGNAL: 'fabrication',
  FALSE_AUTHORIAL_EXPERIENCE: 'fabrication', CONTRADICTS_SOURCE: 'fabrication',
  MISREPRESENTS_TARGET: 'fabrication', GENRE_BREACH: 'genre',
  HOUSE_STYLE_HARD_BAN: 'style', PLAGIARISTIC_OR_NON_RESPONSIVE: 'responsiveness',
}

const INCUMBENT = USE_INCUMBENT ? `FILL: the author's true original essay/artifact.` : ''
const INCUMBENT_CLAUSE = USE_INCUMBENT ? `
There is a REFERENCE ORIGINAL (the incumbent the field is trying to beat):
---
${INCUMBENT}
---
An entry deserves to win only if it is genuinely better than this incumbent AND keeps
what makes it honest. Flashier-but-fabricated, or flashier-but-less-honest, loses.` : ''

// ─────────────────────────────────────────────────────── SCHEMAS
const GEN_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['markdown'],
  properties: { title: { type: 'string' }, oneLineAngle: { type: 'string' }, markdown: { type: 'string' } } }
// The flaw schema's category enum MUST track the hard-DQ vocabulary, or the gate prompts/tallies for
// one category set while the schema permits another. Derive it from a category list (not a captured
// constant) so a certified EVALUATOR with a custom hardDqCategories gets a matching schema via
// makeFlawSchema(ev.hardDqCategories) — validateEvaluatorConfig enforces they agree.
const makeFlawSchema = categories => ({ type: 'object', additionalProperties: false,
  required: ['disqualified', 'category'],
  properties: { disqualified: { type: 'boolean' }, flaw: { type: 'string' },
    // The named hard-DQ category. Same-FAMILY majority across screeners is what disqualifies
    // (see screenAll), so this must be one canonical value, not free text. NONE when not DQ'ing.
    category: { type: 'string', enum: ['NONE', ...categories] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] }, note: { type: 'string' } } })
const FLAW_SCHEMA = makeFlawSchema(HARD_DQ_CATEGORIES)
const LENS_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['winner', 'reason'],
  properties: { winner: { type: 'string', enum: ['X', 'Y'] },
    margin: { type: 'string', enum: ['narrow', 'clear', 'decisive'] }, reason: { type: 'string' } } }
const SEED_SCHEMA = { type: 'object', additionalProperties: false,
  required: ['winner'],
  properties: { winner: { type: 'string', enum: ['X', 'Y'] },
    confidence: { type: 'string', enum: ['toss-up', 'lean', 'strong'] } } }

// ─────────────────────────────────────────────────────── LENSES
const LENSES = {
  voice:     'Does this sound like the author actually wrote it, or like a machine performing the author. Flag voice tells, performed vulnerability, imitation over authorship.',
  substance: 'Strip the style. Is there a real claim earned by real reasoning, or vibes and momentum. Does the argument advance and land.',
  taste:     'You are a discerning editor who has read ten thousand of these. Fresh or formulaic. Earned or performed. Would you publish it.',
  integrity: 'Is the concrete detail honest or manufactured. For nonfiction, does it buy vividness with invented fact. Penalize performed authenticity; reward earned, plausibly-true specifics and honest understatement.',
  coherence: 'Does this read as one continuous piece, or a stapled lineup of mismatched parts? Penalize tonal breaks, a dropped throughline, and seams where one section\'s voice or stance clashes with the next. Reward a single argument carried across every section in one register — a team that plays together, not eleven soloists.',
}
// Assembled (kind:'sections') candidates are stapled from independently-judged slots, so a
// coherence juror rides in every panel to catch Frankenstein seams a whole-generated piece
// never has. Whole-generated fields (flat/axes) are coherent by construction and skip it.
const COHERENCE_ON = DESIGN.kind === 'sections'
const panelFor = stakes => {
  const base = {
    R32: ['voice', 'substance', 'taste'], R16: ['voice', 'substance', 'taste'],
    QF: ['voice', 'substance', 'taste', 'integrity'],
    SF: ['voice', 'substance', 'taste', 'integrity'],
    FINAL: ['voice', 'substance', 'taste', 'integrity'],
  }[stakes] || ['voice', 'substance', 'taste']
  return COHERENCE_ON ? [...base, 'coherence'] : base
}

// ─────────────────────────────────────── EVALUATOR_CONFIG (PLAN_3 U19/P1: the judge as one object)
// Every judge surface — the fabrication gate, the seed pre-pass, the lens panel, the panel policy,
// the schemas, the agent model/options, the family-DQ vocabulary, and the vote aggregation — reads
// from THIS object instead of scattered constants. The DEFAULT below references today's exact
// constants, so a run with the default EVALUATOR is byte-identical to before this extraction (the
// qualifier is opt-in; nothing changes until a certified config is assigned). PLAN_3 U12 produces a
// CERTIFIED EvaluatorConfig and reassigns EVALUATOR here, so the config that was certified is
// provably the one the tournament runs (probe: probes/p1-eval-config.mjs). Consumers default to the
// module EVALUATOR but accept an explicit `ev` for testing and per-call overrides.
let EVALUATOR = {
  criteriaBlock:    CRITERIA_BLOCK,      // taste spec + fact ledger + disqualifiers the judges read
  sourcePacket:     SOURCE_PACKET,       // structured fact ledger (U20/P2) — mechanical twin of the prose ledger; ledgerLookup reads it
  incumbentClause:  INCUMBENT_CLAUSE,    // the "must beat the incumbent" clause seated in lens prompts
  targetGateClause: targetGateClause,    // the MISREPRESENTS_TARGET gate clause ('' when no TARGET)
  hardDqCategories: HARD_DQ_CATEGORIES,  // canonical hard-DQ vocabulary (gate prompt + enum + tally)
  dqFamily:         DQ_FAMILY,           // category -> violation family, for the same-family gate tally
  preflightHardDqCategory: 'HOUSE_STYLE_HARD_BAN', // category a DETERMINISTIC hard-ban DQ emits — must be in hardDqCategories
  lenses:           LENSES,              // lens name -> its one-axis mandate (the panel's seats)
  panelFor,                              // stakes -> [lens, ...]  (the per-stakes panel policy)
  tiebreakLens:     'integrity',         // the extra juror seated on an even split (was hardcoded)
  screeners:        SCREENERS,           // independent fabrication-gate judges per entry
  bans:             BANS,                // deterministic preflight policy (em dash, banned vocab) — part of the gate, so certified too
  schemas:          { flaw: FLAW_SCHEMA, lens: LENS_SCHEMA, seed: SEED_SCHEMA },
  agentOptions:     {},                  // merged into every judge agent() call (e.g. { model }); {} = inherit. NEVER overrides label/phase/schema (spread FIRST at call sites)
  lensWeight:       () => 1,             // (lens) -> weight in the tally; ()=>1 is today's 1:1 (PLAN_3 U13 fills this in)
}
// Guarded weight read: a config's lensWeight is untrusted (could return undefined/NaN/negative/zero,
// which would silently flip the tally or collapse an all-zero panel to the rating fallback). Coerce
// anything non-finite or non-positive back to 1 — intentional lens removal is panelFor's job, not weight 0.
const lensW = (ev, lens) => { const w = ev.lensWeight(lens); return (Number.isFinite(w) && w > 0) ? w : 1 }
// Reserved-key-safe judge agent options. Spread the config's agentOptions FIRST so it can set model/
// effort but can NEVER override the protected per-call fields (label, phase, schema). Centralized here
// so the invariant lives in ONE place — every judge call site (gate, lens panel, tiebreak, seed
// pre-pass, slot judge) routes through this and can't drift.
const judgeOpts = (ev, schemaKey, label, phase) => ({ ...ev.agentOptions, label, phase, schema: ev.schemas[schemaKey] })
// Integrity check for a (default or certified) config — the contract that a certified config has NO
// hole a fabrication can slip through. PLAN_3 U12 MUST run this on every config it emits.
const EVAL_STAKES = ['R32', 'R16', 'QF', 'SF', 'FINAL']
function validateEvaluatorConfig(ev) {
  // (0) PRESENCE/SHAPE: every runtime-required field must be present and the right type, or a certified
  // config that OMITS one passes here and explodes later (playMatch -> ev.schemas.lens / ev.lensWeight,
  // the seed pre-pass -> ev.schemas.seed). Reject incomplete configs up front.
  for (const k of ['criteriaBlock', 'incumbentClause', 'targetGateClause', 'preflightHardDqCategory', 'tiebreakLens'])
    if (typeof ev[k] !== 'string') throw new Error(`EVALUATOR.${k} must be a string (incomplete config).`)
  for (const k of ['dqFamily', 'lenses', 'bans', 'agentOptions'])
    if (!ev[k] || typeof ev[k] !== 'object') throw new Error(`EVALUATOR.${k} must be an object (incomplete config).`)
  if (!Array.isArray(ev.hardDqCategories)) throw new Error('EVALUATOR.hardDqCategories must be an array.')
  if (typeof ev.panelFor !== 'function') throw new Error('EVALUATOR.panelFor must be a function.')
  if (typeof ev.lensWeight !== 'function') throw new Error('EVALUATOR.lensWeight must be a callable function (tally calls it every vote).')
  if (!ev.schemas || typeof ev.schemas !== 'object') throw new Error('EVALUATOR.schemas must be an object.')
  for (const k of ['flaw', 'lens', 'seed']) if (!ev.schemas[k] || typeof ev.schemas[k] !== 'object')
    throw new Error(`EVALUATOR.schemas.${k} must be present (a JSON schema) — the ${k} judge path needs it (e.g. playMatch reads schemas.lens, seeding reads schemas.seed).`)
  // lens + seed schemas must REQUIRE winner ∈ ['X','Y'], or the match/seed paths (which key on
  // v.winner==='X') silently miscount an out-of-enum or missing winner from a custom schema.
  for (const k of ['lens', 'seed']) {
    const s = ev.schemas[k], we = s.properties && s.properties.winner && s.properties.winner.enum
    if (!Array.isArray(s.required) || !s.required.includes('winner') || !Array.isArray(we) || we.length !== 2 || !we.includes('X') || !we.includes('Y'))
      throw new Error(`EVALUATOR.schemas.${k} must require winner ∈ ['X','Y'] — the ${k} judge path keys on v.winner==='X', so an unconstrained winner silently miscounts.`)
  }
  const cats = ev.hardDqCategories
  // (a) screeners must be a positive integer, or the gate schedules no judges and fabrication passes.
  if (!Number.isInteger(ev.screeners) || ev.screeners < 1)
    throw new Error(`EVALUATOR.screeners must be a positive integer (got ${JSON.stringify(ev.screeners)}); 0/NaN/negative schedules no gate judges and lets fabrication through.`)
  // (b) flaw schema enum must EXACTLY equal ['NONE', ...hardDqCategories]: no missing categories (the
  // gate can't return them) AND no EXTRA ones (a screener could return a schema-valid category that
  // screenAll's hardDqCategories filter then drops, silently voiding that DQ vote).
  const want = ['NONE', ...cats]
  const enumv = (ev.schemas && ev.schemas.flaw && ev.schemas.flaw.properties && ev.schemas.flaw.properties.category && ev.schemas.flaw.properties.category.enum) || []
  if (enumv.length !== want.length || want.some(c => !enumv.includes(c)) || enumv.some(c => !want.includes(c)))
    throw new Error(`EVALUATOR.schemas.flaw enum must equal ['NONE', ...hardDqCategories] exactly (extra or missing categories leak DQ votes). Build it with makeFlawSchema(ev.hardDqCategories).`)
  // flaw schema must REQUIRE disqualified + category, or screenAll (which only counts
  // s.disqualified && s.category) drops a schema-valid verdict that omits either — letting a fatal
  // flaw pass under a custom evaluator.
  const freq = ev.schemas.flaw.required
  if (!Array.isArray(freq) || !freq.includes('disqualified') || !freq.includes('category'))
    throw new Error(`EVALUATOR.schemas.flaw must require ['disqualified','category'] — screenAll voids a verdict missing either, letting a fatal flaw pass.`)
  // (c) every hard-DQ category needs a violation-family mapping (else same-family votes split).
  for (const c of cats) if (!ev.dqFamily || !ev.dqFamily[c])
    throw new Error(`EVALUATOR.dqFamily has no family for hard-DQ category "${c}" — same-family gate tally would split its votes.`)
  // (d) the deterministic preflight DQ category must itself be a real, mapped hard-DQ category.
  if (!cats.includes(ev.preflightHardDqCategory))
    throw new Error(`EVALUATOR.preflightHardDqCategory "${ev.preflightHardDqCategory}" is not in hardDqCategories — preflight would emit a category the rest of the gate doesn't recognize.`)
  // (e) every seated lens (per-stakes panel + tiebreak) must exist in ev.lenses, or lensPrompt
  // renders "YOUR LENS: ghost — undefined".
  if (!ev.lenses || !ev.lenses[ev.tiebreakLens])
    throw new Error(`EVALUATOR.tiebreakLens "${ev.tiebreakLens}" is not a defined lens.`)
  for (const st of EVAL_STAKES) {
    const panel = ev.panelFor(st)
    if (!Array.isArray(panel)) throw new Error(`EVALUATOR.panelFor("${st}") must return an ARRAY (got ${typeof panel}); a bare string is iterable-by-char and playMatch calls .map on it.`)
    if (!panel.length) throw new Error(`EVALUATOR.panelFor("${st}") returned an empty panel.`)
    for (const ln of panel) if (!ev.lenses[ln]) throw new Error(`EVALUATOR.panelFor("${st}") seats undefined lens "${ln}".`)
  }
  // (f) sourcePacket (U20/P2) is OPTIONAL — a config can carry only a prose criteriaBlock — but if
  // present it must be the structured shape ledgerLookup reads AND the single source of truth the
  // judges read. Without these, the mechanical proof silently degrades (a non-array bucket throws in
  // renderLedger; a non-string member renders 'null'/'[object Object]' and inverts support) or, worse,
  // jurors read one ledger while lookup checks another.
  if (ev.sourcePacket !== undefined) {
    const p = ev.sourcePacket
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('EVALUATOR.sourcePacket must be a plain object when present.')
    if (!Array.isArray(p.supported_facts)) throw new Error('EVALUATOR.sourcePacket.supported_facts must be an array.')
    if (!Array.isArray(p.not_allowed)) throw new Error('EVALUATOR.sourcePacket.not_allowed must be an array.')
    if (!p.allowed_entities || typeof p.allowed_entities !== 'object' || Array.isArray(p.allowed_entities))
      throw new Error('EVALUATOR.sourcePacket.allowed_entities must be a plain object (not an array — Object.entries on an array yields numeric "bucket" keys).')
    // Every member must be a non-empty string, or render emits null/[object Object] and the mechanical
    // lookup inverts (a real entity becomes un-provable; a phantom '[object Object]' becomes SUPPORTED).
    const str = (where, x) => { if (typeof x !== 'string' || !x.trim()) throw new Error(`EVALUATOR.sourcePacket.${where} must be non-empty strings.`) }
    for (const f of p.supported_facts) str('supported_facts[]', f)
    for (const n of p.not_allowed) str('not_allowed[]', n)
    for (const [k, vals] of Object.entries(p.allowed_entities)) {
      if (!Array.isArray(vals)) throw new Error(`EVALUATOR.sourcePacket.allowed_entities.${k} must be an array.`)
      for (const v of vals) str(`allowed_entities.${k}[]`, v)
    }
    // Single source of truth: the prose jurors read MUST contain the ledger rendered from THIS packet,
    // or a certified config can have judges reading stale prose while ledgerLookup checks a fact they
    // never see (support inverted across the two channels).
    if (typeof ev.criteriaBlock === 'string' && !ev.criteriaBlock.includes(renderLedger(p)))
      throw new Error('EVALUATOR.criteriaBlock must contain renderLedger(sourcePacket) — the prose jurors read and the mechanical ledger must be the same source (single source of truth).')
  }
  return ev
}
validateEvaluatorConfig(EVALUATOR)  // the default config must be self-consistent (catches drift at load)

// ─────────────────────────────────────────────────────── PROMPTS
const flawPrompt = (e, ev = EVALUATOR) => `You are screening ONE entry for FATAL FLAWS before it competes. Not judging quality; checking for disqualification.

CRITERIA AND HARD DISQUALIFIERS:
${ev.criteriaBlock}

Disqualify (name the rule) only if the entry: presents invented specifics as lived fact (suspiciously perfect, load-bearing, almost certainly fabricated to manufacture authenticity — treat manufactured specificity as a flaw, not a strength), OR breaks a hard disqualifier above. Do not disqualify for being merely weak.${ev.targetGateClause}

When you disqualify, name the single best-fitting hard-DQ category: ${ev.hardDqCategories.join(', ')}. Use NONE when not disqualifying.

ENTRY:
---
${e.markdown}
---
Return JSON { disqualified, category, flaw, confidence, note }. Default disqualified=false and category="NONE" unless you can name the specific rule broken.`

const lensPrompt = (lens, X, Y, ev = EVALUATOR) => `Two entries compete head to head. Pick the better. No ties — choose and give a margin. You wear ONE lens and judge on it ruthlessly; ignore other axes.

YOUR LENS: ${lens} — ${ev.lenses[lens]}

CRITERIA (context; judge through your lens):
${ev.criteriaBlock}
${ev.incumbentClause}

Do NOT reward length, density, or more concrete detail for its own sake. A short honest entry beats a long performed one. Suspiciously perfect specificity is a warning sign.

ENTRY X:
---
${X.markdown}
---
ENTRY Y:
---
${Y.markdown}
---
Return JSON { winner:"X"|"Y", margin, reason (two sentences, the deciding factor through your lens) }.`

const seedPrompt = (X, Y, ev = EVALUATOR) => `Quick calibrated comparison for seeding. Which entry is stronger overall against the criteria. Choose; no ties.

CRITERIA:
${ev.criteriaBlock}

ENTRY X:
---
${X.markdown}
---
ENTRY Y:
---
${Y.markdown}
---
Return JSON { winner:"X"|"Y", confidence }.`

// ─────────────────────────────────────────────────────── JUDGE PIPELINE
// Deterministic preflight: cheap regex gate, runs before any agent. Reads the ban policy from the
// config (ev.bans), so the deterministic half of the gate is certified alongside the LLM half — not
// an uncertified global side-channel. Default ev = EVALUATOR (whose bans default to the module BANS).
function preflight(text, ev = EVALUATOR) {
  const bans = ev.bans || {}
  const hard = [], soft = []
  if (bans.emDash && text.includes('—')) hard.push('em dash')
  for (const w of (bans.vocab || [])) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) soft.push(`banned:${w}`)
  if (/\b(this essay|in this piece|what i want to explore)\b/i.test(text)) soft.push('announced thesis')
  if (/\b(ultimately|in the end|at the end of the day|what it means to be)\b/i.test(text.slice(-600))) soft.push('uplift closer')
  return { hardDQ: hard.length > 0, hard, soft }
}
// Fabrication gate: preflight, then SCREENERS independent judges; DQ needs majority.
// Computed ONCE per entry and cached. The most important call in the system.
async function screenAll(entries, phase, ev = EVALUATOR) {
  // De-dup by markdown BEFORE screening. When sections has meta.M < FIELD, reconcile replicates
  // lineups, so the pool holds multiple entries with IDENTICAL markdown under #n labels. Screening
  // each clone independently would let the SAME text be disqualified for one copy and allowed for
  // another (LLM nondeterminism), undermining the truth gate. Screen each distinct text ONCE and
  // share one verdict across its replicas (also fewer gate calls on replicated fields).
  const byText = new Map()
  for (const e of entries) { if (!byText.has(e.markdown)) byText.set(e.markdown, []); byText.get(e.markdown).push(e) }
  const reps = [...byText.keys()]
  const verdicts = await parallel(reps.map(text => async () => {
    const e0 = byText.get(text)[0]
    const pf = preflight(text, ev)
    if (pf.hardDQ) return { disqualified: true, category: ev.preflightHardDqCategory, flaw: pf.hard.join(', '), soft: pf.soft, votes: ev.screeners }
    const screens = (await parallel(Array.from({ length: ev.screeners }, (_, i) => () =>
      agent(flawPrompt(e0, ev), judgeOpts(ev, 'flaw', `flaw${i + 1}:${e0.label}`, phase))))).filter(Boolean)
    // Same-FAMILY majority: DQ when a STRICT majority of screeners (votes > SCREENERS/2) flag the
    // same violation FAMILY (see DQ_FAMILY). This still stops ONE hallucinating judge from killing a
    // clean entry (1 vote is never a majority) AND stops a fabricator from slipping through when three
    // judges all see fabrication but name different subtypes — requiring the same SUBTYPE would wrongly
    // PASS that. Label the DQ with the most-cited subtype inside the winning family.
    const byFam = {}
    for (const s of screens) {
      if (!(s.disqualified && s.category && s.category !== 'NONE' && ev.hardDqCategories.includes(s.category))) continue
      const fam = ev.dqFamily[s.category] || s.category
      const f = byFam[fam] || (byFam[fam] = { votes: 0, cats: {} })
      f.votes++; f.cats[s.category] = (f.cats[s.category] || 0) + 1
    }
    const top = Object.entries(byFam).sort((a, b) => b[1].votes - a[1].votes)[0]
    const disqualified = !!top && top[1].votes > ev.screeners / 2
    const topCat = disqualified ? Object.entries(top[1].cats).sort((a, b) => b[1] - a[1])[0][0] : null
    const topVotes = top ? top[1].votes : 0
    return { disqualified, category: topCat,
      flaw: disqualified ? ((screens.find(s => s.disqualified && s.category === topCat) || {}).flaw || topCat) : '',
      soft: pf.soft, votes: topVotes }
  }))
  reps.forEach((text, i) => {
    const v = verdicts[i] || { disqualified: false, category: null, flaw: '', soft: [], votes: 0 }
    for (const e of byText.get(text)) e.flaw = { ...v }  // own copy per entry, no aliasing
  })
  return entries
}

// One head-to-head. orderIdx parity flips X/Y to cancel position bias.
async function playMatch(a, b, orderIdx, stakes, phase, decided, ev = EVALUATOR) {
  // Stage 0 — fatal-flaw veto (uses cached screens)
  const da = a.flaw?.disqualified, db = b.flaw?.disqualified
  if (da && !db) return record(b, a, 'decisive', `opponent DQ'd: ${a.flaw.flaw}`, decided)
  if (db && !da) return record(a, b, 'decisive', `opponent DQ'd: ${b.flaw.flaw}`, decided)

  // Stage 1 — lens panel (order flipped per lens index to debias)
  const lenses = ev.panelFor(stakes)
  const votes = (await parallel(lenses.map((lens, i) => () => {
    const flip = (orderIdx + i) % 2 === 1
    const [X, Y] = flip ? [b, a] : [a, b]
    return agent(lensPrompt(lens, X, Y, ev), judgeOpts(ev, 'lens', `${stakes}:${lens}:${a.label}>${b.label}`, phase))
      .then(v => v && ({ lens, winner: v.winner === 'X' ? (flip ? b : a) : (flip ? a : b), margin: v.margin, reason: v.reason }))
  }))).filter(Boolean)

  // Stage 2 — majority. Stage 3 — break/escalate ties.
  let winner = tally(votes, a, b, ev)
  if (!winner) { // even split: seat one more juror (the configured tiebreak lens)
    const extra = await agent(lensPrompt(ev.tiebreakLens, a, b, ev), judgeOpts(ev, 'lens', `${stakes}:tiebreak:${a.label}`, phase))
    if (extra) votes.push({ lens: ev.tiebreakLens, winner: extra.winner === 'X' ? a : b, margin: extra.margin, reason: extra.reason })
    winner = tally(votes, a, b, ev) || (a.rating >= b.rating ? a : b)
  }
  const loser = winner.id === a.id ? b : a
  const reason = (votes.find(v => v.winner.id === winner.id) || {}).reason || 'panel majority'
  const margin = marginOf(votes, winner, ev)
  return record(winner, loser, margin, reason, decided)
}
function tally(votes, a, b, ev = EVALUATOR) {
  let av = 0, bv = 0
  // Per-lens weight from the config (lensW guards against undefined/NaN/negative). The default
  // lensWeight is ()=>1, so av/bv are integer vote counts identical to the unweighted tally
  // (PLAN_3 U13 supplies real per-lens reliability weights).
  votes.forEach(v => { const w = lensW(ev, v.lens); if (v.winner.id === a.id) av += w; else bv += w })
  if (av === bv) return null
  return av > bv ? a : b
}
// Margin is computed on the SAME weighted totals tally uses, so a weighted winner can't be reported
// with a misleading raw-count margin. With the default ()=>1 weights this is byte-identical to the
// old raw-count margin. ⚠️ U13: the `>= 2` clear/narrow threshold is in vote-weight units (correct at
// weight 1); when U13 introduces real weights it should define weighted-margin semantics (normalize
// by winner share, or make the threshold configurable) so labels don't depend on weight scale.
function marginOf(votes, w, ev = EVALUATOR) {
  const total = votes.reduce((s, v) => s + lensW(ev, v.lens), 0)
  const for_ = votes.filter(v => v.winner.id === w.id).reduce((s, v) => s + lensW(ev, v.lens), 0)
  return for_ === total ? 'decisive' : (for_ - (total - for_) >= 2 ? 'clear' : 'narrow')
}
function record(winner, loser, margin, reason, decided) {
  decided.push({ winnerId: winner.id, loserId: loser.id })
  return { winner, loser, margin, reason }
}

// ════════════════════════════════ (PLAN_3 U11a/U12/U23/U24) QUALIFY — opt-in run assurance ════════
// OFF by default ⇒ the tournament path NEVER calls any of these and EVALUATOR is byte-identical to
// before this block (probes/p1 73/73 is the guard). When on, the run additionally: builds a falsifier
// CONFORMANCE CORPUS (U11a), runs exact pass/fail conformance against a held-out partition (U12),
// builds FRESH ECOLOGICAL PROBES in the live regime (U23), and emits a 4-state run-status ASSURANCE
// CARD (U24). NONE of this asserts a portable "certified judge" — it qualifies THIS run within a stated
// operating envelope. See docs/plans/qualifiers-run-assurance.md (Architecture Decision: falsifier-not-
// verifier, spec-tests-not-statistical-samples, authorization-not-truth — there is no Wilson/CI math here).
const QUALIFY = false

// ── U11a — conformance-corpus generation (the FALSIFIER, not a statistical sample) ─────────────────
// DETERMINISTIC, ZERO agent() calls: a card is a mutation SPECIFICATION + expected outcome + provenance
// (the card shape carries no realized text — realization into prose is downstream/stochastic in U23/U12).
// The load-bearing property is ANTI-LAUNDERING: authority_status is DERIVED from the mechanical
// ledgerLookup, never asserted by a caller over a contradicting span — you cannot mint a SUPPORTED-backed
// status (ASSERTED_TRUE/AUTHORIZED) for a span the packet does not authorize, nor a FORBIDDEN status for
// one it does. UNKNOWN/EXTERNALLY_VERIFIED are DECLARATIVE (proof:null): "absent ≠ false", never an accusation.
const AUTHORITY = { ASSERTED_TRUE: 'ASSERTED_TRUE', AUTHORIZED: 'AUTHORIZED', UNKNOWN: 'UNKNOWN', FORBIDDEN: 'FORBIDDEN', EXTERNALLY_VERIFIED: 'EXTERNALLY_VERIFIED' }
// Statuses with a real mechanical backing (a ledgerLookup result in proof) vs declarative (proof:null).
const MECHANICAL_AUTHORITY = new Set([AUTHORITY.ASSERTED_TRUE, AUTHORITY.AUTHORIZED, AUTHORITY.FORBIDDEN])
// Derive an honest (authority_status, proof) from the packet via ledgerLookup. Throws on a contradiction
// rather than silently emitting a laundered card — the analog of U20/U21's punctuation/manifest leaks.
function authorityFor(span, packet, intent) {
  if (intent === 'unknown') return { authority_status: AUTHORITY.UNKNOWN, proof: null }            // absent, non-load-bearing — declarative
  if (intent === 'external') return { authority_status: AUTHORITY.EXTERNALLY_VERIFIED, proof: null } // cited source / target packet — declarative (ledgerLookup does author-truth only)
  const lk = ledgerLookup(span, packet)
  if (intent === 'authorized') {
    if (lk.status !== 'SUPPORTED') throw new Error(`buildAnchors: cannot mint a SUPPORTED-backed authority for span ${JSON.stringify(span)} — ledgerLookup says ${lk.status} (authority laundering).`)
    return { authority_status: lk.provenance && lk.provenance.kind === 'fact' ? AUTHORITY.ASSERTED_TRUE : AUTHORITY.AUTHORIZED, proof: { ledger_lookup: lk } }
  }
  if (intent === 'forbidden') {
    if (lk.status !== 'UNSUPPORTED') throw new Error(`buildAnchors: span ${JSON.stringify(span)} IS authorized by the packet — it cannot be a FORBIDDEN fabrication anchor.`)
    return { authority_status: AUTHORITY.FORBIDDEN, proof: { ledger_lookup: lk } }   // the UNSUPPORTED result is the mechanical basis for the DQ
  }
  throw new Error(`buildAnchors: unknown intent ${JSON.stringify(intent)}`)
}
// The five MANDATORY DIR positive controls (winner-role ≻ loser-role). Role CODES only — never the
// literal Original/Fabricated/Bland answer-key words a juror could read off (labels are stripped at
// presentation; these specs only name roles). Semantics are this plan's interpretation of the shorthand.
const DIR_CONTROLS = [
  { id: 'I>O',  winner: 'improved', loser: 'baseline', confounds: [] },                 // a genuine improvement beats the untouched source
  { id: 'T>B',  winner: 'tight',    loser: 'bloated',  confounds: ['length'] },         // earned concision beats padded performance
  { id: 'I>L',  winner: 'improved', loser: 'lazy',     confounds: [] },                 // a real rewrite beats a low-effort one
  { id: 'O>C',  winner: 'baseline', loser: 'hollow',   confounds: ['fluency'] },        // honest source beats a fluent-but-empty rewrite (fluency ≠ quality)
  { id: 'I2>I1', winner: 'iter2',   loser: 'iter1',    confounds: [] },                 // a second improvement pass beats the first
]
// Synthetic load-bearing fabrications (concrete specifics no real packet authorizes — verified
// UNSUPPORTED at build, else authorityFor throws loud). And vague, hedged, non-load-bearing absences
// (UNKNOWN) that the gate must NOT DQ — the false-fabrication-accusation guard.
const FAB_SPANS = ['at 3:47am that Tuesday', 'commit 9f3a2b1', 'my editor Priya said', 'on line 417 of the parser', 'the 2019 Lisbon workshop']
const HEDGED_ABSENT_SPANS = ['some afternoon years back', 'a friend once mentioned', 'somewhere along the way']
function buildAnchors({ incumbent = INCUMBENT, packet = SOURCE_PACKET, packetId = null, ev = EVALUATOR } = {}) {
  // No incumbent ⇒ nothing to mutate ⇒ an empty corpus (NOT a throw): the corpus is single-span
  // mutations OF the reference artifact, and a run without one simply has no truth-anchor base.
  if (!incumbent || typeof incumbent !== 'string' || !incumbent.trim()) return []
  const constructs = Object.keys(ev.lenses || {})
  const tasteJurors = (Array.isArray(ev.tasteJurors) && ev.tasteJurors.length) ? ev.tasteJurors.map(String) : ['juror-1', 'juror-2', 'juror-3']
  // editor_votes is DISAGGREGATED by construction — one entry per named juror, vote null until the
  // blinded-juror run fills it; the AUTHOR adjudicates out-of-band (sets human_adjudicated/author_veto
  // when reviewing the committed bank). Never a single collapsed "known answer" score.
  const votesSlate = () => tasteJurors.map(j => ({ juror: j, vote: null }))
  const cards = []
  const card = o => { cards.push({
    construct: o.construct, test_type: o.test_type, kind: o.kind, authority_status: o.authority_status,
    source_packet_id: packetId, base_id: 'incumbent', mutation: o.mutation, expected: o.expected,
    proof: o.proof || null, editor_votes: o.kind === 'taste' ? votesSlate() : [], author_veto: false,
    known_confounds: o.known_confounds || [], difficulty: o.difficulty || 'medium',
    provenance: { generator: 'buildAnchors@U11a', deterministic: true }, human_adjudicated: false,
    family: o.family,
  }) }
  // (1) TRUTH MFT — authorized details (gate must PASS): every supported fact / allowed entity.
  for (const f of (Array.isArray(packet && packet.supported_facts) ? packet.supported_facts : [])) {
    const a = authorityFor(f, packet, 'authorized')
    card({ construct: 'integrity', test_type: 'MFT', kind: 'truth', ...a, mutation: { span: f, operator: 'use_supported' }, expected: { gate: 'PASS', taste_comparison: null }, family: `truth/integrity/MFT-${a.authority_status === AUTHORITY.ASSERTED_TRUE ? 'fact' : 'entity'}` })
  }
  const ents = packet && packet.allowed_entities
  if (ents && typeof ents === 'object' && !Array.isArray(ents))
    for (const [bucket, vals] of Object.entries(ents))
      if (Array.isArray(vals)) for (const v of vals) {
        const a = authorityFor(v, packet, 'authorized')
        // Family is keyed on the RESOLVED authority, not the source bucket: ledgerLookup is fact-first, so
        // an allowed-entity that also appears in a supported_fact resolves ASSERTED_TRUE → file it with the
        // fact family (matching the supported_facts branch), or one logical family splits across partitions.
        card({ construct: 'integrity', test_type: 'MFT', kind: 'truth', ...a, mutation: { span: v, operator: 'use_supported', bucket }, expected: { gate: 'PASS', taste_comparison: null }, family: `truth/integrity/MFT-${a.authority_status === AUTHORITY.ASSERTED_TRUE ? 'fact' : 'entity'}` })
      }
  // (2) TRUTH MFT — planted load-bearing fabrications (gate must DQ): FORBIDDEN, proof is the UNSUPPORTED result.
  for (const span of FAB_SPANS) {
    // A planted fabrication that COLLIDES with the live packet (a supported_fact happens to contain the
    // span) is not UNSUPPORTED — SKIP it rather than throwing and bricking the whole opt-in corpus build.
    // (The floor-coverage guard backstops the pathological all-collide case → HUMAN_REVIEW, never a false pass.)
    if (ledgerLookup(span, packet).status !== 'UNSUPPORTED') continue
    card({ construct: 'integrity', test_type: 'MFT', kind: 'truth', ...authorityFor(span, packet, 'forbidden'), mutation: { span, operator: 'plant_lived_fact' }, expected: { gate: 'DQ', taste_comparison: null }, difficulty: 'easy', family: 'truth/integrity/MFT-fabrication' })
  }
  // (3) TRUTH MFT — UNKNOWN, hedged & non-load-bearing (gate must NOT DQ): the false-accusation guard.
  for (const span of HEDGED_ABSENT_SPANS)
    card({ construct: 'integrity', test_type: 'MFT', kind: 'truth', ...authorityFor(span, packet, 'unknown'), mutation: { span, operator: 'hedge_absent' }, expected: { gate: 'PASS', taste_comparison: null }, known_confounds: ['absent ≠ false'], family: 'truth/integrity/MFT-unknown' })
  // (4) TRUTH INV — paraphrase/reorder invariance: the gate verdict must NOT CHANGE (an invariance
  // obligation, not a single PASS/DQ — gate:null so U12 defers it to U23's live two-presentation check).
  for (const c of constructs)
    card({ construct: c, test_type: 'INV', kind: 'truth', authority_status: AUTHORITY.UNKNOWN, proof: null, mutation: { span: null, operator: 'paraphrase' }, expected: { gate: null, taste_comparison: { invariant: true } }, family: `truth/${c}/INV` })
  // (5) TASTE DIR — a directional quality anchor for EVERY construct (a clear improvement should win).
  for (const c of constructs)
    card({ construct: c, test_type: 'DIR', kind: 'taste', authority_status: AUTHORITY.UNKNOWN, proof: null, mutation: { span: null, operator: 'compare' }, expected: { gate: null, taste_comparison: { direction: 'I>O', winner: 'improved', loser: 'baseline' } }, family: `taste/${c}/DIR` })
  // (6) TASTE DIR — the 5 mandatory positive controls (the noncompensatory direction set).
  for (const d of DIR_CONTROLS)
    card({ construct: 'positive_control', test_type: 'DIR', kind: 'taste', authority_status: AUTHORITY.UNKNOWN, proof: null, mutation: { span: null, operator: 'compare' }, expected: { gate: null, taste_comparison: { direction: d.id, winner: d.winner, loser: d.loser } }, known_confounds: d.confounds, family: `taste/positive_control/${d.id}` })
  return cards
}

// ── U12 — conformance qualification (EXACT pass/fail; the noncompensatory spec-test GATE) ──────────
// Scores a config (`ev`, the config under test) against the held-out corpus with EXACT pass/fail —
// NO Wilson/Bernoulli/CI math anywhere (a curated obligation set is not a random sample; see
// Architecture Decision #2). The load-bearing, deterministically-realizable obligations are the GATE
// anchors (truth MFT): a planted FORBIDDEN fabrication MUST be DQ'd; an AUTHORIZED/UNKNOWN detail must
// NOT be (a false accusation is just as fatal). Realization is a non-leaking splice — the planted span
// IS the input, the judge must catch it, no answer key reaches the judge. DIRECTIONAL (DIR/INV) anchors
// need live-generated comparison texts (an honest "improved vs baseline" pair can't be synthesized
// deterministically without leaking the answer) — so they are DEFERRED to U23's fresh probes here, never
// silently passed. Noncompensatory: ANY mandatory gate failure ⇒ BLOCKED (no averaging rescues it).
const baseText = incumbent => (typeof incumbent === 'string' && incumbent.trim()) ? incumbent : 'A short honest passage in the author\'s own voice.'
// Realize a gate anchor into ONE entry by splicing its span as a lived-fact sentence. Returns null when
// the test can't be constructed (a must-DQ anchor with no span) ⇒ ABSTAIN, not a fabricated pass/fail.
function realizeGate(a, incumbent) {
  const span = a.mutation && a.mutation.span
  if (a.expected && a.expected.gate === 'DQ' && !span) return null
  return span ? `${baseText(incumbent)}\n\n${span}.` : baseText(incumbent)
}
// A gate anchor is a truth MFT anchor with a binary gate expectation — every one is MANDATORY (both the
// must-DQ fabrications and the must-PASS authorized/unknown details: a false accusation is noncompensatory too).
const isGateAnchor = a => a && a.kind === 'truth' && a.expected && (a.expected.gate === 'DQ' || a.expected.gate === 'PASS')
async function qualifyConformance(corpus, { ev = EVALUATOR, incumbent = INCUMBENT, phase = 'qualify' } = {}) {
  const items = Array.isArray(corpus) ? corpus : (corpus && corpus.items) || []
  const gate = items.filter(isGateAnchor)
  const deferred = items.filter(a => a && !isGateAnchor(a))   // DIR/INV directional — NOT scored yet (counted, honestly, as a gap)
  // Realize every scorable gate anchor; the unrealizable ones ABSTAIN (escalate), excluded from pass/total.
  const realized = gate.map((a, i) => ({ a, md: realizeGate(a, incumbent), id: `gate${i}`, label: `gate${i}` }))
  const abstained = realized.filter(r => r.md == null).map(r => r.a.family)
  const scored = realized.filter(r => r.md != null)
  const entries = scored.map(r => ({ id: r.id, label: r.label, markdown: r.md }))
  if (entries.length) await screenAll(entries, phase, ev)   // the CONFIG UNDER TEST runs the real gate
  const byId = new Map(entries.map(e => [e.id, e]))
  const failedFamilies = new Set(), mandatoryFailed = new Set(), scoredFamilies = new Set(), byConstruct = {}
  let passed = 0, scoredDQ = 0, scoredPASS = 0
  for (const r of scored) {
    scoredFamilies.add(r.a.family)
    if (r.a.expected.gate === 'DQ') scoredDQ++; else if (r.a.expected.gate === 'PASS') scoredPASS++
    const v = byId.get(r.id).flaw || { disqualified: false }
    const pass = (!!v.disqualified) === (r.a.expected.gate === 'DQ')   // exact: caught a fab iff it should, passed a clean iff it should
    const bc = byConstruct[r.a.construct] || (byConstruct[r.a.construct] = { passed: 0, total: 0, failed: [] })
    bc.total++
    if (pass) { passed++; bc.passed++ }
    else { failedFamilies.add(r.a.family); bc.failed.push(r.a.family); if (isGateAnchor(r.a)) mandatoryFailed.add(r.a.family) }
  }
  // A mandatory family that ONLY abstained (zero scored anchors) was never actually tested — surface it so
  // the run gates to HUMAN_REVIEW rather than passing the floor vacuously. (A family that scored ≥1 anchor
  // AND abstained another is fine — it was tested.)
  const unscored_families = [...new Set(abstained)].filter(f => !scoredFamilies.has(f))
  // FLOOR COVERAGE (the P0 guard): the noncompensatory floor is only meaningful if BOTH a must-DQ
  // (catch a fabrication) AND a must-PASS (don't false-accuse) anchor were actually scored this run. If
  // either class scored zero, the floor was never tested ⇒ insufficient evidence (qualifyRun escalates).
  const floor = { scored_must_dq: scoredDQ, scored_must_pass: scoredPASS,
    untested: scoredDQ === 0 ? 'no_scored_must_dq' : (scoredPASS === 0 ? 'no_scored_must_pass' : null) }
  const verdict = mandatoryFailed.size ? 'BLOCKED' : 'PASS'   // noncompensatory: any mandatory gate failure dominates
  // NOTE: directional DIR/INV anchors are NOT scored anywhere yet — U23 generates its own fixed probe set
  // and does not consume these corpus anchors. `directional_not_scored` is an honest COUNT of that gap, not
  // a coverage claim (do not read it as "scored by U23"). Wiring them into judgeProbes is a follow-up.
  return { verdict, passed, total: scored.length, failed_families: [...failedFamilies],
    mandatory_failed: [...mandatoryFailed], abstained, unscored_families, floor,
    directional_not_scored: deferred.length, by_construct: byConstruct }
}
// Adopt a (default or qualified) config as THE module evaluator — every judge surface reads the module
// `let EVALUATOR`, so this is what makes "the config we qualified is the config the tournament runs" true.
// validateEvaluatorConfig FIRST (a hole-free config is the contract); it throws BEFORE reassigning, so a
// rejected config never half-adopts. ONLY called under QUALIFY when conformance + probes both pass (U24).
function adoptEvaluator(E) { validateEvaluatorConfig(E); EVALUATOR = E; return EVALUATOR }

// ── U23 — fresh, run-scoped ecological probes (DRIFT detection, NOT the adversarial audit) ─────────
// The structural upgrade the durable single-span corpus structurally cannot give: probes generated
// INSIDE THE LIVE regime (this packet / context length / incumbent / generator), covering the multi-edit
// interactions a single-span mutation misses — distributed persona-drift (unauthorized lived fact spread
// across sentences, no single forgeable span), load-bearing omission, a genuine structural improvement,
// earned/supported vividness, A/B order reversal, a harmless length/format change, and 1–2 judge-bait
// smoke tests. They are RUN-SCOPED: regenerated every run and NEVER written to the durable bank (a probe
// carries no `family`, so anchorbank can't even ingest one) — that is what keeps them un-gameable. This
// detects DRIFT, NOT adaptive exploitation: judge_bait is a smoke test for obvious gaming, not the
// freeze-rubric → red-team → 16–32-attempt exploit-rate audit (that is U12b, deferred; the card flags
// adversarial_audit:'not_run'). Do not read U23's drift coverage as exploitation robustness.
const PROBE_TYPES = [
  { type: 'persona_drift',       kind: 'gate', construct: 'integrity', expected: { gate: 'DQ' } },     // distributed unauthorized lived fact — must be caught with no single span
  { type: 'omission',            kind: 'dir',  construct: 'substance', expected: { winner: 'a' } },     // the complete piece beats one with a load-bearing omission
  { type: 'structural_improve',  kind: 'dir',  construct: 'substance', expected: { winner: 'a' } },     // a genuine structural improvement should win
  { type: 'supported_vividness', kind: 'dir',  construct: 'integrity', expected: { winner: 'a' } },     // earned, source-supported vividness should win
  { type: 'ab_reversal',         kind: 'inv',  construct: 'overall',   expected: { invariant: true } }, // same pair, order reversed — verdict must not flip
  { type: 'harmless_format',     kind: 'inv',  construct: 'overall',   expected: { invariant: true } }, // a harmless length/format change must not move the verdict
  { type: 'judge_bait',          kind: 'dir',  construct: 'taste',     expected: { winner: 'a' } },      // honest beats an obvious gaming attempt (smoke test, not the audit)
]
// gate probes need only `a` (the passage to screen); dir/inv probes are A/B pairs and MUST carry both —
// an empty `b` would make judgeProbes compare against an empty entry, so it can't be optional for them.
const PROBE_GEN_SCHEMA = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string' } } }
const PROBE_PAIR_SCHEMA = { type: 'object', additionalProperties: false, required: ['a', 'b'], properties: { a: { type: 'string' }, b: { type: 'string' } } }
const probeGenPrompt = (t, ctx, ev) => `Generate ONE fresh probe of type "${t.type}" in the LIVE regime, against this rubric. ${t.kind === 'gate' ? 'Return only "a": a passage that exhibits the failure to test.' : 'Return "a" (the entry that SHOULD prevail / be invariant) and "b" (its counterpart).'}

CRITERIA:
${ev.criteriaBlock}

REFERENCE (live incumbent):
---
${ctx.incumbent}
---
Return JSON { a${t.kind === 'gate' ? '' : ', b'} }.`
const defaultProbeGenerate = (ev, phase) => async (t, ctx) => {
  const r = await agent(probeGenPrompt(t, ctx, ev), { ...ev.agentOptions, label: `gen:${t.type}`, phase, schema: t.kind === 'gate' ? PROBE_GEN_SCHEMA : PROBE_PAIR_SCHEMA })
  return { a: (r && r.a) || '', b: (r && r.b) || '' }
}
// Build the fresh probe set (content generated live; never persisted). `generate` is injectable for tests.
async function buildProbes({ incumbent = INCUMBENT, packet = SOURCE_PACKET, ev = EVALUATOR, phase = 'probes', generate } = {}) {
  const gen = generate || defaultProbeGenerate(ev, phase)
  const probes = []
  for (const t of PROBE_TYPES) {
    const c = await gen(t, { incumbent, packet })
    probes.push({ type: t.type, kind: t.kind, construct: t.construct, expected: t.expected,
      a: (c && c.a) || '', b: (c && c.b) || '', run_scoped: true })   // run_scoped + no `family` ⇒ cannot enter the durable bank
  }
  return probes
}
// Judge the fresh probes THROUGH the live config and report DRIFT per probe (not validity). gate probes
// screen; dir probes must pick `a`; inv probes must hold the verdict stable across reversed order.
async function judgeProbes(probes, { ev = EVALUATOR, phase = 'probes' } = {}) {
  const mkEntry = (id, md) => ({ id, label: id, markdown: md, rating: 1500 })
  const drift = [], byType = {}
  let passed = 0
  for (const p of probes) {
    let pass
    if (p.kind === 'gate') {
      const e = mkEntry('probe', p.a)
      await screenAll([e], phase, ev)
      pass = (!!(e.flaw && e.flaw.disqualified)) === (p.expected.gate === 'DQ')
    } else if (p.kind === 'inv') {
      const A = mkEntry('A', p.a), B = mkEntry('B', p.b)
      // A/B reversal SWAPS which entry is presented first (the a/b arguments), not the internal orderIdx
      // — playMatch already counterbalances orderIdx + breaks ties toward `a`, so an orderIdx flip cancels
      // out and would hide real position bias. Swapping the arguments is the genuine order-reversal test.
      const r1 = await playMatch(A, B, 0, 'FINAL', phase, [], ev)
      const r2 = await playMatch(B, A, 0, 'FINAL', phase, [], ev)
      pass = !!r1 && !!r2 && r1.winner.id === r2.winner.id   // a position-biased judge flips; a faithful one holds
    } else {   // dir — the live config must pick `a` (the entry that should prevail)
      const A = mkEntry('A', p.a), B = mkEntry('B', p.b)
      const r = await playMatch(A, B, 0, 'FINAL', phase, [], ev)
      pass = !!r && r.winner.id === 'A'
    }
    const bt = byType[p.type] || (byType[p.type] = { passed: 0, total: 0 }); bt.total++
    if (pass) { passed++; bt.passed++ } else drift.push({ type: p.type, construct: p.construct })
  }
  // scope:'drift' + adversarial_audit:'not_run' are FIRST-CLASS — this is drift detection, and it does
  // NOT stand in for the deferred adaptive-exploitation audit (U12b). Never reported as "robust".
  return { scope: 'drift', adversarial_audit: 'not_run', passed, total: probes.length, drift, by_type: byType }
}

// ── U24 — run envelope + 4-state run status + assurance card (the headline output) ─────────────────
// A STATE MACHINE, not a score. Perturbations run on the CHAMPION (final pair) ONLY — O(perturbations),
// not O(matches) — and UNSTABLE is a precise, narrow claim: the champion flips under a JUDGE-side
// perturbation AND the flip crosses a MARGIN BAND (both directions were clear, not a near-tie). A flip
// INSIDE the near-tie band is a close call, NOT UNSTABLE. Bracket-reseed is NOT a judge-side perturbation
// (reseed flips are inherent knockout variance) — it is recorded in operating_envelope.bracket_seed_
// sensitivity, never the headline status. alt-judge-model is OPTIONAL: absent ⇒ 'not_run' (NEVER read as
// stability). UNSTABLE is a claim about the champion the author acts on, NOT about evaluator validity.
const RUN_STATUS = { BLOCKED: 'BLOCKED', QUALIFIED: 'QUALIFIED_FOR_THIS_RUN', UNSTABLE: 'UNSTABLE', HUMAN: 'HUMAN_REVIEW_REQUIRED' }
const JUDGE_PERTURBATIONS = ['mirrored_order', 'paraphrase', 'alt_model']   // bracket_reseed is deliberately NOT here
// A flip is "across" the band only when BOTH directions were decisive/clear; any near-tie ('narrow') ⇒ "within".
const bandOf = (m1, m2) => ([m1, m2].every(m => m === 'clear' || m === 'decisive') ? 'across' : 'within')
// Champion-only judge-side perturbations (the cost-bounded set). mirrored_order swaps the entry arguments
// (playMatch already counterbalances orderIdx); paraphrase re-judges under a paraphrased rubric; alt_model
// re-judges under a second model IFF one is configured (else 'not_run' — not silent stability).
async function runPerturbations(a, b, { ev = EVALUATOR, phase = 'perturb', altModel = null, paraphrase = true } = {}) {
  const base = await playMatch(a, b, 0, 'FINAL', phase, [], ev)
  const win = r => r && r.winner && r.winner.id
  const mir = await playMatch(b, a, 0, 'FINAL', phase, [], ev)
  const out = { mirrored_order: { flipped: win(mir) !== win(base), band: bandOf(base.margin, mir.margin) }, paraphrase: 'not_run', alt_model: 'not_run' }
  if (paraphrase) {
    const par = await playMatch(a, b, 0, 'FINAL', phase, [], { ...ev, criteriaBlock: ev.criteriaBlock + '\n\n(Rubric paraphrased; same meaning.)' })
    out.paraphrase = { flipped: win(par) !== win(base), band: bandOf(base.margin, par.margin) }
  }
  if (altModel) {
    const alt = await playMatch(a, b, 0, 'FINAL', phase, [], { ...ev, agentOptions: { ...ev.agentOptions, model: altModel } })
    out.alt_model = { flipped: win(alt) !== win(base), band: bandOf(base.margin, alt.margin) }
  }
  return out
}
// Assemble the run status + assurance card from the conformance verdict (U12), the fresh-probe drift
// report (U23), the champion perturbation outcomes (runPerturbations), and run/envelope metadata. Pure —
// no agent calls; the card is handed to qualify.writeCard (orchestrator-side) for atomic persistence.
function qualifyRun(input = {}) {
  const _v = v => (v === undefined ? null : v)
  // FAIL CLOSED: a MISSING conformance verdict is insufficient evidence, NOT a pass — never default to
  // {verdict:'PASS'} (that "silently certifies" a run with zero evidence, the one thing the plan forbids).
  const conformance = input.conformance || null
  const probes = input.probes || { passed: 0, drift: [] }
  const pert = input.perturbations || {}
  const env = input.envelope || {}
  const taste = input.taste || {}
  const crossesBand = p => p && p !== 'not_run' && p.flipped && p.band === 'across'
  // ALLOWLIST, not denylist: decide() must gate the QUALIFIED branch on EVERY piece of evidence the card
  // collects — conformance verdict, the floor coverage, fresh-probe drift, author veto, and a recognized
  // perturbation band. The prior denylist ("anything not BLOCKED qualifies") let drifting probes, a vetoed
  // champion, an untested floor, and a malformed verdict all reach QUALIFIED with a hardcoded "passed"
  // reason. Every non-QUALIFIED branch derives its reason from the actual evidence (no lying status_reason).
  const arr = x => (Array.isArray(x) ? x : [])
  const decide = () => {
    // (1) conformance must be a recognized verdict — absent/malformed is insufficient evidence, not a pass.
    if (!conformance || typeof conformance.verdict !== 'string') return [RUN_STATUS.HUMAN, 'insufficient_evidence:no_conformance']
    // (2) BLOCKED dominates — incl. a DESYNCED verdict whose failure arrays are non-empty (don't trust the string alone).
    if (conformance.verdict === 'BLOCKED' || arr(conformance.mandatory_failed).length || arr(conformance.failed_families).length)
      return [RUN_STATUS.BLOCKED, 'mandatory_obligation_failed']
    // (3) only an explicit PASS may proceed — any other string ('pass'/'OK'/typo/future enum/'') fails closed.
    if (conformance.verdict !== 'PASS') return [RUN_STATUS.HUMAN, 'insufficient_evidence:unrecognized_verdict']
    // (4) the noncompensatory floor must have actually been SCORED: a must-DQ/must-PASS class that scored
    // zero, or a mandatory family that entirely abstained, means the floor was never tested (the P0).
    const floorUntested = (conformance.floor && conformance.floor.untested) || (arr(conformance.unscored_families).length ? 'mandatory_family_abstained' : null)
    if (floorUntested) return [RUN_STATUS.HUMAN, 'insufficient_evidence:' + floorUntested]
    if (!(Number(conformance.passed) > 0)) return [RUN_STATUS.HUMAN, 'insufficient_evidence:floor_scored_nothing']
    if (input.evidence_sufficient === false) return [RUN_STATUS.HUMAN, 'insufficient_evidence']
    // (5) fresh-probe DRIFT gates QUALIFIED (the plan defines QUALIFIED as "conformance + fresh probes
    // passed"). A persona-drift miss is a live fabrication breach ⇒ BLOCKED; any other drift ⇒ HUMAN_REVIEW.
    const drift = arr(probes.drift)
    if (drift.some(d => d && d.type === 'persona_drift')) return [RUN_STATUS.BLOCKED, 'fresh_probe_fabrication_breach']
    if (drift.length || (Number.isFinite(probes.total) && Number(probes.passed) < probes.total)) return [RUN_STATUS.HUMAN, 'fresh_probe_drift']
    // (6) the author is the principal — a non-empty veto (or an explicit disagreement) decides the champion.
    if (input.author_disagreement === true || arr(taste.author_vetoes).length) return [RUN_STATUS.HUMAN, 'material_author_disagreement']
    // (7) stability: a flip with an UNRECOGNIZED band can't be classified ⇒ fail closed, never silent-stable.
    if (JUDGE_PERTURBATIONS.some(k => { const p = pert[k]; return p && p !== 'not_run' && p.flipped && p.band !== 'within' && p.band !== 'across' }))
      return [RUN_STATUS.HUMAN, 'insufficient_evidence:unrecognized_perturbation_band']
    if (JUDGE_PERTURBATIONS.some(k => crossesBand(pert[k]))) return [RUN_STATUS.UNSTABLE, 'champion_flips_across_band']
    return [RUN_STATUS.QUALIFIED, 'conformance_probes_perturbations_passed']
  }
  const [run_status, status_reason] = decide()
  return {
    packet_id: input.packet_id, run_id: input.run_id, run_status, status_reason,
    operating_envelope: {
      packet_completeness: _v(env.packet_completeness), packet_provenance: _v(env.packet_provenance),
      field_diversity: _v(env.field_diversity), generator_identity: _v(env.generator_identity),
      evaluator_config_id: _v(env.evaluator_config_id), gate_false_dq_behavior: _v(env.gate_false_dq_behavior),
      pair_order_stability: pert.mirrored_order || 'not_run', paraphrase_stability: pert.paraphrase || 'not_run',
      preference_cycles: _v(env.preference_cycles),
      bracket_seed_sensitivity: pert.bracket_reseed || 'not_run',   // reseed flips live HERE, never in run_status
      alt_model: pert.alt_model || 'not_run',                       // absent ⇒ 'not_run', NOT silent stability
      escalation: _v(env.escalation),
    },
    conformance: { passed: _v(conformance && conformance.passed), failed_families: (conformance && conformance.failed_families) || [], abstained: (conformance && conformance.abstained) || [], floor: (conformance && conformance.floor) || null },
    fresh_probes: { passed: _v(probes.passed), drift: probes.drift || [] },
    adversarial_audit: 'not_run',   // first-class: QUALIFIED_FOR_THIS_RUN is NOT "robust against gaming" (U12b deferred)
    taste: { agreement_with_named_adjudicators: _v(taste.agreement_with_named_adjudicators), author_vetoes: taste.author_vetoes || [] },
    known_blind_spots: input.known_blind_spots || [],
    anchor_bank_version: _v(input.anchor_bank_version), judge_models: input.judge_models || [],
    perturbation_count: JUDGE_PERTURBATIONS.filter(k => pert[k] && pert[k] !== 'not_run').length,   // cost legibility
    expires_on: { model_or_prompt_change: true },
    top_set: null,   // inert forward-compat until the deferred robust-top-set unit lands (Scope Boundaries)
  }
}

// ─────────────────────────────────────────────────────── BRACKET HELPERS (see brackets.md)
function snakeGroups(teams, G) { // teams sorted best-first; keeps strongest apart
  return Array.from({ length: G }, (_, g) => [teams[g], teams[2 * G - 1 - g], teams[2 * G + g], teams[4 * G - 1 - g]])
}
function roundRobin(group) {
  const pairs = []
  for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) pairs.push([group[a], group[b]])
  return pairs
}
function standings(group, gi, results) {
  const pts = new Map(group.map(t => [t.id, 0])), beat = new Map(group.map(t => [t.id, new Set()]))
  results.filter(r => r.gi === gi).forEach(r => { pts.set(r.winner.id, pts.get(r.winner.id) + 3); beat.get(r.winner.id).add(r.loser.id) })
  const ranked = [...group].sort((p, q) =>
    (pts.get(q.id) - pts.get(p.id)) || (beat.get(p.id).has(q.id) ? -1 : beat.get(q.id).has(p.id) ? 1 : q.rating - p.rating))
  return { ranked, pts }
}
function nextRoundPairs(winners) { const p = []; for (let i = 0; i < winners.length; i += 2) p.push([winners[i], winners[i + 1]]); return p }
function seedSlotOrder(n) { let s = [1, 2]; while (s.length < n) { const sum = s.length * 2 + 1, x = []; for (const v of s) { x.push(v); x.push(sum - v) } s = x } return s }
function eloRatings(entries, decided, K = 24, base = 1500) {
  const R = new Map(entries.map(e => [e.id, base]))
  for (let pass = 0; pass < 3; pass++) for (const m of decided) {
    const rw = R.get(m.winnerId), rl = R.get(m.loserId), ew = 1 / (1 + Math.pow(10, (rl - rw) / 400))
    R.set(m.winnerId, rw + K * (1 - ew)); R.set(m.loserId, rl - K * (1 - ew))
  }
  return [...R.entries()].sort((a, b) => b[1] - a[1])
}

// ─────────────────────────────────────────────── LIVE EVENT STREAM (realtime view hook)
// The workflow is sandboxed (no fs, no sockets). Two egress channels carry tournament events:
//   • Tier-0: log('WCEVENT …') — structured progress readable in /workflows, folded into the run
//     file's logs[] — but that file is written ONCE at completion, so log() is NOT live (U18 finding).
//   • Tier-1 (LIVE): the only egress that persists INCREMENTALLY during a run is an AGENT's result —
//     it streams into subagents/workflows/<runId>/journal.jsonl the moment the agent completes. So each
//     event is ALSO emitted as a cheap "beacon" agent() whose tight-schema result IS the event
//     ({__wc:'EVENT',…}); references/live-view.js tails that journal and renders the live bracket.
// Determinism: the beacon result is DISCARDED (never read back) — the bracket is unaffected. Beacons
// fire-and-forget (collected in `beacons`, awaited once before return); any failure is swallowed — a
// beacon must NEVER break or alter a run. Set LIVE_BEACONS=false for Tier-0 only.
const LIVE_BEACONS = true
const beacons = []
let beaconSeq = 0
// `args` carries two things that must NOT collide: the GIVEN-mode entrant array, and (when Tier-1 live
// view is on) the per-run nonce. Canonical shapes: a bare array (legacy entrants, no nonce), or an object
// { items?: [...entrants], liveNonce?: "…" } — so a bring-your-own run can ALSO enable Tier-1. Parse once.
const ARGS = (() => { try { if (typeof args === 'undefined' || args == null) return undefined; return typeof args === 'string' ? JSON.parse(args) : args } catch (e) { return undefined } })()
// Per-run provenance nonce: the LAUNCHER passes it via args.liveNonce AND hands the same one to
// live-view.js (--nonce). Judges never see it, so even an agent that emits a structured {__wc:'EVENT'}
// can't forge a beacon. Absent → '' → the consumer runs unauthenticated (legacy).
const LIVE_NONCE = (ARGS && !Array.isArray(ARGS) && ARGS.liveNonce != null) ? String(ARGS.liveNonce) : ''  // coerce: a non-string would fail the {type:'string'} schema → every beacon silently dropped
// GIVEN-mode entrants: a bare array, or `args.items` when wrapped alongside a nonce.
const GIVEN_ITEMS = Array.isArray(ARGS) ? ARGS : ((ARGS && ARGS.items) || [])
const BEACON_PROMPT = 'Output this exact JSON object as your structured result, preserving nested arrays/objects and numbers EXACTLY — do not stringify, reorder, or alter any field:\n'
const bkStr = { type: 'string' }, bkNum = { type: 'number' }, bkEither = { type: ['string', 'number'] }, bkNullStr = { type: ['string', 'null'] }
const bkObj = props => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props })
const bkArr = items => ({ type: 'array', items })
// Tight per-event schemas — a LOOSE schema makes the model stringify nested arrays; a tight one forces
// faithful nesting (verified). Shapes MUST match live-view.js fold().
const EVENT_SCHEMAS = {
  draw: bkObj({ __wc: bkStr, ev: bkStr, field: bkNum, groups: bkArr(bkObj({ group: bkStr, teams: bkArr(bkObj({ label: bkStr, seed: bkNum })) })) }),
  bracket: bkObj({ __wc: bkStr, ev: bkStr, rounds: bkArr(bkObj({ stakes: bkStr, matches: bkArr(bkObj({ slot: bkNum, a: bkNullStr, b: bkNullStr })) })) }),
  gate: bkObj({ __wc: bkStr, ev: bkStr, field: bkNum, disqualified: bkArr(bkObj({ label: bkStr, category: bkStr })) }),
  groups: bkObj({ __wc: bkStr, ev: bkStr, standings: bkArr(bkObj({ group: bkStr, table: bkArr(bkObj({ label: bkStr, pts: bkNum })), advanced: bkArr(bkStr) })) }),
  round: bkObj({ __wc: bkStr, ev: bkStr, stakes: bkStr, matches: bkArr(bkObj({ winner: bkStr, loser: bkStr, margin: bkEither })), eliminated: bkArr(bkStr) }),
  match: bkObj({ __wc: bkStr, ev: bkStr, stakes: bkStr, slot: bkNum, winner: bkStr, loser: bkStr, margin: bkEither }),
  champion: bkObj({ __wc: bkStr, ev: bkStr, label: bkStr, stakes: bkStr }),
}
// Every event carries a monotonic emit `seq` — beacons land in COMPLETION order, so the consumer sorts
// by seq to recover emit order (additionalProperties:false means the schema must allow seq explicitly).
for (const __s of Object.values(EVENT_SCHEMAS)) { __s.properties.seq = bkNum; __s.properties.nonce = bkStr; __s.required.push('seq', 'nonce') }
// emit stays SYNC (no call-site churn): logs the Tier-0 line, then fires the live beacon fire-and-forget.
const emit = ev => {
  ev.seq = ++beaconSeq   // logical EMIT order; the consumer folds by seq since beacons arrive out of order
  try { log('WCEVENT ' + JSON.stringify(ev)) } catch (e) { /* logging must never break a run */ }
  try {
    const schema = LIVE_BEACONS ? EVENT_SCHEMAS[ev.ev] : null
    if (schema) beacons.push(agent(BEACON_PROMPT + JSON.stringify({ __wc: 'EVENT', nonce: LIVE_NONCE, ...ev }), { label: 'wc-live:' + ev.ev, schema, effort: 'low' })
      .catch(() => { try { log('WCEVENT-BEACON-FAIL ' + ev.ev + ' #' + ev.seq) } catch (e) {} }))  // observable, not a silent hole
  } catch (e) { /* a beacon must NEVER break a run */ }
}
// Compact monospace standings for the free Tier-0 watch-in-/workflows view (no artifact needed).
// 'Q' marks a qualifier (top 2), '.' an eliminated team. ASCII only so it survives any log sink.
function standingsBlock(groups, adv) {
  return groups.map((g, gi) => {
    const rows = adv[gi].ranked.map((t, i) =>
      `  ${i < 2 ? 'Q' : '.'} ${String(adv[gi].pts.get(t.id)).padStart(2)}pt  ${t.label}`).join('\n')
    return `Group ${LETTERS[gi]}\n${rows}`
  }).join('\n')
}

// ─────────────────────────────────────────────────────── DESIGN COMBINATORICS
// Deterministic (no RNG). Axes here are { name, values: [label, ...] } (value labels only;
// the DESIGN value->fragment map is applied separately when assembling prompts in U3).
// See references/design-pass.md.
function isPow2(n) { return n >= 1 && (n & (n - 1)) === 0 }

function crossProduct(axes) { // -> [{ axisName: value, ... }, ...]
  return axes.reduce((cells, ax) => {
    const next = []
    for (const cell of cells) for (const v of ax.values) next.push({ ...cell, [ax.name]: v })
    return next
  }, [{}])
}

// Binary fractional factorial: k binary axes -> 2^p runs. Base = first p axes (full 2^p);
// each generated axis = product of a fixed subset of base-axis signs (deterministic).
function binaryFraction(axes, p) {
  const base = axes.slice(0, p), gen = axes.slice(p)
  const fromSign = (ax, s) => s < 0 ? ax.values[0] : ax.values[1]
  const baseSubset = j => { const idx = base.map((_, i) => i); return (j === 0 || p <= 3) ? idx : idx.filter((_, i) => i !== ((j - 1) % p)) }
  const generators = gen.map((_, j) => baseSubset(j))
  const cells = []
  for (let m = 0; m < (1 << p); m++) {
    const signs = base.map((_, i) => ((m >> i) & 1) ? 1 : -1)
    const coord = {}
    base.forEach((ax, i) => { coord[ax.name] = fromSign(ax, signs[i]) })
    gen.forEach((ax, j) => { const s = generators[j].reduce((acc, bi) => acc * signs[bi], 1); coord[ax.name] = fromSign(ax, s) })
    cells.push(coord)
  }
  return cells
}

// Are main effects estimable from these cells? (orthogonal, non-degenerate contrast columns.)
function mainEffectsEstimable(cells, axes) {
  const cols = []
  for (const ax of axes) for (let li = 1; li < ax.values.length; li++)
    cols.push(cells.map(c => c[ax.name] === ax.values[li] ? 1 : (c[ax.name] === ax.values[0] ? -1 : 0)))
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++)
    if (Math.abs(cols[i].reduce((a, _, t) => a + cols[i][t] * cols[j][t], 0)) > 1e-9) return false
  return cols.length > 0 && cols.every(col => col.some(v => v !== 0))
}

// Reconcile axes (product M) to exactly N cells. estimable is probe-backed (not theory-claimed).
function reconcile(axes, N) {
  const radices = axes.map(a => a.values.length)
  const M = radices.reduce((a, b) => a * b, 1)
  const full = crossProduct(axes)
  if (M === N) return { cells: full, strategy: 'full', estimable: 'all-2way', meta: { M, N } }
  if (M < N) {
    const r = Math.ceil(N / M), cells = []
    for (let k = 0; cells.length < N; k++) for (const c of full) if (cells.length < N) cells.push({ ...c, __rep: k })
    // A balanced replicate (N a multiple of M) stays orthogonal -> all-2way. A partial
    // replicate (N % M !== 0) concentrates extra runs in early coordinate levels, so its
    // estimability must be probed, not assumed.
    const balanced = N % M === 0
    const estimable = balanced ? 'all-2way' : (mainEffectsEstimable(cells, axes) ? 'main-effects' : 'none')
    return { cells, strategy: balanced ? 'replicate' : 'partial-replicate', estimable, meta: { M, N, replicas: r, balanced } }
  }
  let cells, strategy
  if (radices.every(rd => rd === 2) && isPow2(N) && Math.log2(N) < radices.length) {
    cells = binaryFraction(axes, Math.round(Math.log2(N))); strategy = `fractional 2^(${radices.length}-${Math.round(radices.length - Math.log2(N))})`
  } else {
    // coprime stride avoids the row-major aliasing that can strand a low-order axis on one level
    const cgcd = (a, b) => b ? cgcd(b, a % b) : a
    let step = Math.max(1, Math.round(M / N)); while (step < M && cgcd(step, M) !== 1) step++
    if (cgcd(step, M) !== 1) step = 1
    cells = []; for (let i = 0; i < N; i++) cells.push(full[(i * step) % M]); strategy = 'subsample'
  }
  return { cells, strategy, estimable: mainEffectsEstimable(cells, axes) ? 'main-effects' : 'none', meta: { M, N } }
}

// ─── axis-finder + prompt derivation (U3)
const AXIS_SCHEMA = { type: 'object', additionalProperties: false, required: ['axes'],
  properties: { axes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'values'],
    properties: { name: { type: 'string' },
      values: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['value', 'fragment'],
        properties: { value: { type: 'string' }, fragment: { type: 'string' } } } } } } } } }

const shortVal = s => { s = String(s); return s.length <= 10 ? s : s.slice(0, 10) }

// deriveAxes: forced (axes given) or dynamic (axis-finder agent) -> coord-stamped specs.
async function deriveAxes(design, BASE, SPEC) {
  let rawAxes
  if (design.mode === 'dynamic') {
    const finderPrompt = `Propose orthogonal DESIGN AXES for generating diverse variants of the artifact below.
Each axis is an independent knob with 2 or 3 discrete VALUES; each value is a short prompt FRAGMENT telling the generator how to realize that setting. Axes must be genuinely independent: changing one must not force another. Aim for about ${Math.max(2, Math.round(Math.log2(FIELD)))} axes so the cross-product is near FIELD=${FIELD}. Keep fragments concrete and mutually exclusive within an axis.
WHAT THE ARTIFACT IS / CRITERIA:
${SPEC}
BASE ARTIFACT:
---
${BASE}
---
Return JSON { axes: [ { name, values: [ { value, fragment } ] } ] }.`
    const found = await agent(finderPrompt, { label: 'axis-finder', phase: 'Generate', schema: AXIS_SCHEMA })
    rawAxes = (found && found.axes && found.axes.length)
      ? found.axes.map(a => ({ name: a.name, valuesObj: Object.fromEntries(a.values.map(v => [v.value, v.fragment])) }))
      : [{ name: 'variant', valuesObj: { a: 'one strong take', b: 'a different strong take' } }]
  } else {
    rawAxes = design.axes.map(a => ({ name: a.name, valuesObj: a.values }))
  }
  const seen = new Set()
  rawAxes = rawAxes.filter(a => Object.keys(a.valuesObj || {}).length >= 2 && !seen.has(a.name) && seen.add(a.name))
  if (!rawAxes.length) {
    // Every proposed axis was unusable (single-value, or all duplicate names). In DYNAMIC
    // mode the binary fallback is the documented graceful degradation. In FORCED mode the
    // author specified the axes, so fail fast and surface the mistake rather than silently
    // running a whole tournament on a generic design.
    if (design.mode === 'dynamic') {
      log('No usable axes from the finder (each needs >=2 distinct values); using a single binary fallback axis.')
      rawAxes = [{ name: 'variant', valuesObj: { a: 'one strong take', b: 'a different strong take' } }]
    } else {
      throw new Error('DESIGN.kind=axes mode=forced but no usable axes (each needs a name and >=2 distinct values). Fix DESIGN.axes, or use mode:dynamic.')
    }
  }
  const comboAxes = rawAxes.map(a => ({ name: a.name, values: Object.keys(a.valuesObj) }))
  const frag = {}; rawAxes.forEach(a => { frag[a.name] = a.valuesObj })
  const { cells, strategy, estimable, meta } = reconcile(comboAxes, FIELD)
  design.resolved = { axes: comboAxes, frag, strategy, estimable, meta }
  log(`Design: ${comboAxes.length} axes (${comboAxes.map(a => a.values.length).join('x')}=${meta.M}) -> ${strategy} -> ${FIELD} cells; effects estimable: ${estimable}.`)
  const used = new Set()
  return cells.map((coord, i) => {
    const clean = {}; for (const k of Object.keys(coord)) if (k !== '__rep') clean[k] = coord[k]
    let baseLabel = comboAxes.map(a => shortVal(clean[a.name])).join('-'), label = baseLabel, n = 1
    while (used.has(label)) label = `${baseLabel}#${++n}`
    used.add(label)
    const fragments = comboAxes.map(a => `- ${a.name} = ${clean[a.name]}: ${frag[a.name][clean[a.name]]}`).join('\n')
    const prompt = `Produce a VARIANT of the artifact below at this exact design point:
${fragments}
Realize every setting above faithfully. Constraints / criteria:
${SPEC}
BASE ARTIFACT:
---
${BASE}
---
Return JSON { title, oneLineAngle, markdown (the full artifact) }.`
    return { id: i, label, coords: clean, prompt }
  })
}

// ─────────────────────────────────────────────────── SECTION ROUTE (U4/U5)
// Compositional design (see references/design-pass.md). STAGE 1: per slot, generate `count`
// candidates and judge them IN ISOLATION — fit to the rest of the piece, not the slot in a
// vacuum — keeping the top `keepPerSlot`. STAGE 2: treat slot survivors as categorical axes,
// reconcile the assembly cross-product to FIELD (reusing the axes machinery, so effects + the
// coordinate view come for free), and staple each chosen LINEUP into one markdown. The engine
// is untouched: an assembly enters the pool as a normal candidate with coords = slot->survivor.
const slotGenPrompt = (s, k, BASE, SPEC) => `Produce ONE candidate for the "${s.slot}" section of the artifact below — variant #${k + 1}. ${s.brief || ''}
Write ONLY this section, but make it fit the WHOLE piece (given as fixed context): it must hand off cleanly to the sections around it, in one consistent voice. Do not rewrite the rest.
Constraints / criteria:
${SPEC}
THE WHOLE PIECE (fixed context — the rest of the squad this section plays with):
---
${BASE}
---
Return JSON { markdown (just the "${s.slot}" section) }.`

const slotJudgePrompt = (s, X, Y, BASE, SPEC) => `Two candidates for the "${s.slot}" section compete. Pick the one that better serves THIS piece — judge FIT with the surrounding sections and the throughline, plus intrinsic quality. Not the section in a vacuum. No ties.
Criteria:
${SPEC}
THE WHOLE PIECE (fixed context):
---
${BASE}
---
CANDIDATE X (a "${s.slot}"):
---
${X.markdown}
---
CANDIDATE Y (a "${s.slot}"):
---
${Y.markdown}
---
Return JSON { winner:"X"|"Y", confidence }.`

// deriveSections: DESIGN -> [{ id, label, coords, markdown }], length === FIELD. Markdown is
// ASSEMBLED here (no per-candidate generation agent in the outer loop).
async function deriveSections(design, BASE, SPEC) {
  const cfg = design.sections || {}
  const declared = cfg.slots || []
  if (declared.length < 2) throw new Error(`DESIGN.kind=sections needs >=2 slots, each { slot, count>=2, brief }. Got ${declared.length}.`)
  // Validate EVERY declared slot and fail fast — never silently drop a malformed slot, because
  // each slot is a load-bearing section of the final artifact (dropping one assembles an
  // incomplete piece). A slot is a CONTEST, so count>=2; the assembled artifact is exactly the
  // declared slots joined in order (BASE is reference context, not output), so every output
  // section must be a contested slot — a fixed section cannot be carried via BASE. Mirrors
  // deriveAxes's fail-fast on unusable forced axes.
  declared.forEach((s, i) => {
    if (!s || typeof s.slot !== 'string' || !s.slot) throw new Error(`DESIGN.sections.slots[${i}] has no 'slot' name.`)
    if (!Number.isInteger(s.count) || s.count < 2) throw new Error(`DESIGN.sections slot "${s.slot || i}" needs an integer count>=2 (a slot is a contest). The section route assembles ONLY the declared slots, joined in order; BASE is reference context for generation/judging and is NOT part of the output, so a fixed section cannot be "baked into BASE" and still appear — every output section must be a contested slot. Got count=${s.count}.`)
  })
  const slots = declared
  const names = slots.map(s => s.slot)
  // Each slot is a distinct coordinate dimension; coords/effects/the lineup view key by slot
  // name, so a duplicate name would silently collapse two positions into one. Fail fast.
  if (new Set(names).size !== names.length) throw new Error(`DESIGN.sections has duplicate slot names (${names.join(', ')}); each slot must be a distinct position. Rename the duplicates.`)
  // Validate keepPerSlot like count: a truthy non-integer would make Math.max/Math.min produce NaN,
  // the survivor slice() keep zero per slot, and reconcile() see length-0 axes and spin forever in
  // its M < N replication loop. Fail fast instead of hanging.
  if (cfg.keepPerSlot !== undefined && (!Number.isInteger(cfg.keepPerSlot) || cfg.keepPerSlot < 1))
    throw new Error(`DESIGN.sections.keepPerSlot must be a positive integer (got ${JSON.stringify(cfg.keepPerSlot)}); a non-integer empties every slot's survivors and reconcile would loop forever.`)
  const keepPerSlot = cfg.keepPerSlot || 2
  phase('Generate')
  // STAGE 1 — per-slot squads. Slots are independent, so generation AND judging are FLATTENED
  // across all slots into two big parallels (slots overlap; wall-clock = the slowest slot, not
  // the sum). Generation retries transient failures up to 3x, parity with the flat/axes path.
  const gen = {}; slots.forEach(s => { gen[s.slot] = [] })
  for (let attempt = 0; attempt < 3; attempt++) {
    const need = []
    slots.forEach(s => { for (let k = 0; k < s.count; k++) if (!gen[s.slot].some(v => v.id === k)) need.push({ s, k }) })
    if (!need.length) break
    const got = (await parallel(need.map(({ s, k }) => () =>
      agent(slotGenPrompt(s, k, BASE, SPEC), { label: `slot:${s.slot}:v${k + 1}`, phase: 'Generate', schema: GEN_SCHEMA })
        .then(x => x && { id: k, slot: s.slot, label: `${s.slot}${k + 1}`, markdown: x.markdown, rating: 1500 })))).filter(Boolean)
    got.forEach(v => gen[v.slot].push(v))
  }
  for (const s of slots) if (gen[s.slot].length < 2) throw new Error(`Slot "${s.slot}" produced only ${gen[s.slot].length} variant(s) after 3 attempts (need >=2 to hold a contest); rerun, or check the generator.`)
  // Run the cheap DETERMINISTIC gate on slot variants BEFORE judging/keeping. screenAll only
  // runs after assembly, so a hard-preflight violation (e.g. the em-dash ban) that wins its slot
  // gets stapled into every lineup that uses it and auto-DQs the assembled field — the whole
  // field when keepPerSlot=1. Restrict each slot to its CLEAN variants and NEVER retain a hard-DQ
  // one as a survivor: >=2 clean hold the contest; exactly 1 clean auto-advances (the slot judge
  // is blind to preflight, so a lone clean candidate must not be made to "lose" to a hard-DQ one,
  // which under keepPerSlot=1 would staple the bad section into the whole field); 0 clean fails
  // the slot. (The full LLM fatal-flaw gate is intentionally NOT run per slot variant — that would
  // multiply Stage 1 cost; the deterministic preflight catches the cited auto-DQ case here.)
  for (const s of slots) {
    const clean = gen[s.slot].filter(v => !preflight(v.markdown).hardDQ)
    if (clean.length === 0) throw new Error(`Slot "${s.slot}": all ${gen[s.slot].length} variant(s) fail the deterministic gate (e.g. em dash); no eligible section to field. Rerun, or fix the generator/bans.`)
    if (clean.length < gen[s.slot].length) {
      log(`Slot "${s.slot}": ${gen[s.slot].length - clean.length} hard-DQ variant(s) dropped${clean.length === 1 ? '; the single clean candidate auto-advances (no contest)' : ' before judging'}.`)
      gen[s.slot] = clean
    }
  }
  // Judge each slot IN ISOLATION (fit to the rest of the piece, not the slot in a vacuum),
  // flattened across slots; per-slot results feed a per-slot Elo. Retry failed/incomplete judge
  // calls (parity with generation): a silently-dropped decision would leave variants tied at the
  // base rating, and with keepPerSlot<count the first-generated variant could be kept without ever
  // winning a contest. Re-run only undecided pairs each attempt; fail the slot if still incomplete.
  const sd = {}; slots.forEach(s => { sd[s.slot] = [] })
  const pairKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`
  const slotPairs = {}; slots.forEach(s => { slotPairs[s.slot] = roundRobin(gen[s.slot]) })
  for (let attempt = 0; attempt < 3; attempt++) {
    const decided = {}; slots.forEach(s => { decided[s.slot] = new Set(sd[s.slot].map(d => pairKey(d.winnerId, d.loserId))) })
    const todo = []
    slots.forEach(s => slotPairs[s.slot].forEach(([X, Y], idx) => { if (!decided[s.slot].has(pairKey(X.id, Y.id))) todo.push({ s, X, Y, idx }) }))
    if (!todo.length) break
    // RETURN each decision (don't push from inside the thunk): parallel() resolves in input order,
    // so appending its results is deterministic, whereas pushing as agents resolve would order sd
    // by agent latency — and eloRatings applies matches sequentially, so latency-ordering would
    // make the SAME judge winners yield different slot ratings/survivors run to run.
    const results = await parallel(todo.map(({ s, X, Y, idx }) => () => {
      const flip = idx % 2 === 1, [A, B] = flip ? [Y, X] : [X, Y]
      // The slot judge IS a judge surface (it narrows the field before the bracket), so it reads the
      // certified EVALUATOR end-to-end: criteriaBlock, model/options, AND seed schema — same contract
      // as lensPrompt/seedPrompt. (The qualifier runs before generation, so EVALUATOR is already
      // certified here.) Byte-identical at default (ev.criteriaBlock === SPEC === CRITERIA_BLOCK). Slot
      // GENERATION (slotGenPrompt) keeps SPEC — that is the real generation-vs-certified-criteria fork
      // left to U12, since generation is not a judge surface.
      return agent(slotJudgePrompt(s, A, B, BASE, EVALUATOR.criteriaBlock), judgeOpts(EVALUATOR, 'seed', `slotjudge:${s.slot}:${A.label}>${B.label}`, 'Generate'))
        .then(v => v && ({ slot: s.slot, winnerId: v.winner === 'X' ? A.id : B.id, loserId: v.winner === 'X' ? B.id : A.id }))
    }))
    results.forEach(r => { if (r) sd[r.slot].push({ winnerId: r.winnerId, loserId: r.loserId }) })
  }
  // Canonical pair-id order so eloRatings is independent of completion AND retry ordering.
  for (const s of slots) sd[s.slot].sort((a, b) => Math.min(a.winnerId, a.loserId) - Math.min(b.winnerId, b.loserId) || Math.max(a.winnerId, a.loserId) - Math.max(b.winnerId, b.loserId))
  for (const s of slots) if (sd[s.slot].length < slotPairs[s.slot].length)
    throw new Error(`Slot "${s.slot}" round-robin incomplete: ${sd[s.slot].length}/${slotPairs[s.slot].length} judge decisions after 3 attempts; survivors would be picked from unjudged ties. Rerun, or check the judge.`)
  const survivors = {}
  for (const s of slots) {
    const variants = gen[s.slot]
    const r = new Map(eloRatings(variants, sd[s.slot]))
    variants.forEach(v => { v.rating = r.get(v.id) })
    survivors[s.slot] = [...variants].sort((a, b) => b.rating - a.rating).slice(0, Math.min(keepPerSlot, variants.length))
    log(`Slot "${s.slot}": ${variants.length} tried -> kept ${survivors[s.slot].length} (${survivors[s.slot].map(t => t.label).join(', ')}).`)
  }
  // STAGE 2 — survivors are categorical axes; reconcile the assembly cross-product to FIELD.
  const sectionAxes = slots.map(s => ({ name: s.slot, values: survivors[s.slot].map(v => v.label) }))
  const md = {}; slots.forEach(s => { md[s.slot] = Object.fromEntries(survivors[s.slot].map(v => [v.label, v.markdown])) })
  const { cells, strategy, estimable, meta } = reconcile(sectionAxes, FIELD)
  // A slot that collapsed to a single clean survivor (deterministic-gate auto-advance) is a
  // CONSTANT, not a factor: it never varies across lineups, so no effect for it can be estimated.
  // Exclude collapsed slots from the effects/estimability axes so the report does not claim
  // 'all-2way' evidence for a dimension that never moved (M can still == FIELD via the varying
  // slots). They stay in the assembled markdown — every lineup carries them — just not as factors.
  const effectAxes = sectionAxes.filter(a => a.values.length >= 2)
  const collapsed = sectionAxes.filter(a => a.values.length < 2).map(a => a.name)
  if (collapsed.length) log(`Sections: slot(s) ${collapsed.join(', ')} collapsed to a single survivor — constant, excluded from effects/estimability (carried in every lineup, but they estimate no effect).`)
  design.resolved = { axes: effectAxes, frag: null, strategy, estimable, meta: { ...meta, collapsed: collapsed.length } }
  // Distinctness floor: if the survivor product M is far below FIELD the field is mostly
  // replicated clones, the bracket is clone-vs-clone (forced coin flips), and the trust verdict
  // would certify a coin-flip champion as "robust". Fail fast (parity with deriveAxes) rather
  // than burn the agent budget on a meaningless tournament. M in [floor, FIELD) is allowed but
  // warned. Raise keepPerSlot or add slots so the field is genuinely diverse.
  const floor = Math.max(2, Math.floor(FIELD / 4))
  if (meta.M < floor) throw new Error(`Sections produced only ${meta.M} distinct lineup(s) (< floor ${floor} for FIELD=${FIELD}); the field would be mostly duplicates and the trust verdict meaningless. Add slots or raise keepPerSlot so ∏ survivors >= ${floor} (ideally >= ${FIELD}).`)
  if (meta.M < FIELD) log(`Sections: ${meta.M} distinct lineups for FIELD=${FIELD} — ${FIELD - meta.M} bracket slots are replicated duplicates; raise keepPerSlot or slot counts to fill the field with distinct lineups.`)
  log(`Sections: ${slots.length} slots (${sectionAxes.map(a => a.values.length).join('x')}=${meta.M}) -> ${strategy} -> ${FIELD} lineups; effects estimable: ${estimable}.`)
  const used = new Set()
  return cells.map((coord, i) => {
    const clean = {}; for (const k of Object.keys(coord)) if (k !== '__rep') clean[k] = coord[k]
    let baseLabel = slots.map(s => clean[s.slot]).join('+'), label = baseLabel, n = 1
    while (used.has(label)) label = `${baseLabel}#${++n}`
    used.add(label)
    // The artifact IS the declared slots joined in order. BASE is reference context for
    // generation/judging and is deliberately NOT spliced in here, so anything you want in the
    // output must be a contested slot (see the count>=2 guard). A fixed section left in BASE
    // would be silently dropped — the count guard's message states this contract.
    const markdown = slots.map(s => md[s.slot][clean[s.slot]]).join('\n\n')
    return { id: i, label, coords: clean, markdown }
  })
}

// ─────────────────────────────────────────────────────── (4) CONTESTANTS (FILL)
// Candidates come from DESIGN (see references/design-pass.md). kind:'flat' is the
// degenerate single-axis design (the old FLAVORS list); kind:'axes' is a factorial grid.
// Every candidate carries `coords` (its point in the design space) for the report + effects.
const decided = []  // every decided head-to-head, for Elo

const BASE = `FILL: the base artifact being varied (essay, brief, spec, design, prompt...).`
// GENERATION criteria. Bound to CRITERIA_BLOCK (the operator's brief), NOT EVALUATOR.criteriaBlock.
// At default these are identical. ⚠️ U12 DECISION (deferred): once the qualifier reassigns
// EVALUATOR.criteriaBlock to a CERTIFIED judging rubric, decide whether generation should track it
// (so candidates are generated for the same target they're judged by) or keep the operator brief
// (candidates = faithful distillations of the user's stated criteria, judged by the certified rubric).
// This is a real design fork, not a bug — left to U12 because the answer depends on the certification model.
const SPEC = CRITERIA_BLOCK
const flatGenPrompt = (name, brief) => `Produce a distinct VARIANT of the artifact below. ANGLE: ${name}: ${brief}.
Realize the angle fully; keep what the brief says must stay true. Constraints / criteria:
${SPEC}
BASE ARTIFACT:
---
${BASE}
---
Return JSON { title, oneLineAngle, markdown (the full artifact) }.`

// deriveCandidates: DESIGN -> [{ id, label, coords, prompt }], length must === FIELD.
async function deriveCandidates(design) {
  if (design.kind === 'flat') {
    return design.flavors.map((f, i) => ({ id: i, label: f.name, coords: { flavor: f.name }, prompt: flatGenPrompt(f.name, f.brief) }))
  }
  if (design.kind === 'axes') {
    return await deriveAxes(design, BASE, SPEC)   // U3
  }
  if (design.kind === 'sections') {
    return await deriveSections(design, BASE, SPEC)   // U4/U5 — specs carry assembled markdown
  }
  throw new Error(`DESIGN.kind '${design.kind}' unsupported`)
}

let pool
if (SOURCE === 'generate') {
  const specs = await deriveCandidates(DESIGN)
  if (specs.length !== FIELD) return { error: `design produced ${specs.length} candidates, need FIELD=${FIELD}` }
  phase('Generate')
  if (specs.every(s => s.markdown != null)) {
    // sections: candidates are deterministically ASSEMBLED from slot survivors (no per-candidate
    // generation agent) — Stage 1 already spent its agent calls generating + judging the slots.
    log(`Assembled ${specs.length} lineups from slot survivors (DESIGN.kind=sections)..`)
    pool = specs.map(s => ({ id: s.id, label: s.label, coords: s.coords, markdown: s.markdown, title: '', oneLineAngle: '' }))
  } else {
    log(`Generating ${specs.length} variants (DESIGN.kind=${DESIGN.kind})..`)
    let got = []
    for (let attempt = 0; got.length < specs.length && attempt < 3; attempt++) {
      const todo = specs.filter(s => !got.some(g => g.id === s.id))
      const r = (await parallel(todo.map(s => () =>
        agent(s.prompt, { label: `gen:${s.label}`, phase: 'Generate', schema: GEN_SCHEMA })
          .then(x => x && ({ id: s.id, label: s.label, coords: s.coords, ...x }))))).filter(Boolean)
      got = got.concat(r)
    }
    if (got.length < FIELD) return { error: `generated ${got.length}/${FIELD}; rerun` }
    pool = got.sort((a, b) => a.id - b.id)
  }
} else {
  // GIVEN: the entrant array (bare `args`, or `args.items` when wrapped with a live nonce). Normalize.
  pool = GIVEN_ITEMS.slice(0, FIELD).map((it, i) => ({
    id: i, label: it.label || `entry-${i + 1}`, coords: { entry: it.label || `entry-${i + 1}` }, markdown: it.markdown || it.text || String(it) }))
  if (pool.length !== FIELD) return { error: `expected ${FIELD} items, got ${pool.length}` }
}

// ─────────────────────────────────────────────────────── SEED (calibrated pairwise)
phase('Seed')
log('Fatal-flaw screening every entry (cached for the whole tournament)..')
await screenAll(pool, 'Seed')
const dqd = pool.filter(t => t.flaw && t.flaw.disqualified)
if (dqd.length) log(`Fatal-flaw gate: ${dqd.length} disqualified (${dqd.map(t => `${t.label}:${t.flaw.category || ''}`).join(', ')}).`)
emit({ ev: 'gate', field: FIELD, disqualified: dqd.map(t => ({ label: t.label, category: t.flaw.category || '' })) })
log('Calibrated pairwise seeding pre-pass..')
// Swiss-like two rounds of pairwise comparisons, then Elo for a rating with real spread.
const seedDecided = []
const seedPairs = []
for (let i = 0; i < pool.length; i += 2) if (pool[i + 1]) seedPairs.push([pool[i], pool[i + 1]])           // round 1: adjacent
for (let i = 0; i < pool.length; i++) seedPairs.push([pool[i], pool[(i + Math.floor(pool.length / 2)) % pool.length]]) // round 2: spread
await parallel(seedPairs.map(([X, Y], idx) => () => {
  const flip = idx % 2 === 1, [A, B] = flip ? [Y, X] : [X, Y]
  return agent(seedPrompt(A, B), judgeOpts(EVALUATOR, 'seed', `seed:${X.label}>${Y.label}`, 'Seed'))
    .then(v => { if (v) seedDecided.push({ winnerId: v.winner === 'X' ? A.id : B.id, loserId: v.winner === 'X' ? B.id : A.id }) })
}))
const seedRating = new Map(eloRatings(pool, seedDecided))
pool.forEach(t => { t.rating = seedRating.get(t.id) })
const seeded = [...pool].sort((a, b) => b.rating - a.rating)

// ─────────────────────────────────────────────────────── GROUPS
phase('Groups')
const groups = snakeGroups(seeded, GROUPS)
groups.forEach((g, gi) => g.forEach(t => { t.group = LETTERS[gi] }))
log(`${GROUPS} groups drawn. Group stage: ${GROUPS * 6} matches..`)
// The bracket SKELETON is fully determined the moment the snake draw is done (snakeGroups is
// pure) — emit it so a live watcher can paint the empty bracket up front and just fill slots
// as results stream in. Carries each team's seed so the watcher can render pots/upsets.
emit({ ev: 'draw', field: FIELD, groups: groups.map((g, gi) => ({ group: LETTERS[gi], teams: g.map(t => ({ label: t.label, seed: seeded.findIndex(x => x.id === t.id) + 1 })) })) })
const groupSpecs = []
groups.forEach((g, gi) => roundRobin(g).forEach(([x, y]) => groupSpecs.push({ gi, x, y })))
// Live: the group table BUILDS UP as matches resolve (parallel, but they finish in waves under the
// concurrency cap), so emit a couple of partial-standings snapshots before the final — the group stage
// fills in rather than jumping from the draw straight to the final table.
const groupResults = []
const partialStandings = () => groups.map((g, gi) => { const s = standings(g, gi, groupResults); return { group: LETTERS[gi], table: s.ranked.map(t => ({ label: t.label, pts: s.pts.get(t.id) })), advanced: [] } })
const gMarks = new Set([Math.round(groupSpecs.length / 3), Math.round(2 * groupSpecs.length / 3)].filter(n => n > 0 && n < groupSpecs.length))
let gDone = 0
await parallel(groupSpecs.map((m, idx) => () =>
  playMatch(m.x, m.y, idx, 'R32', 'Groups', decided).then(r => {
    groupResults.push({ ...r, gi: m.gi })
    if (gMarks.has(++gDone)) emit({ ev: 'groups', standings: partialStandings() })
  })))
// NOTE: group matches use a single rotated juror for cost; override panelFor('R32') -> single
// if you want strict 1-vote groups. Default template runs the 3-lens panel; for FIELD=48
// or tight budgets, switch group matches to a single 'taste' juror.

const adv = groups.map((g, gi) => { const s = standings(g, gi, groupResults); return { ...s, gi } })
// Realtime group standings + who advanced (the user-requested "live group standings"). The
// log() line is the free Tier-0 view; the WCEVENT carries the structured table for Tier-1.
log('Group standings:\n' + standingsBlock(groups, adv))
emit({ ev: 'groups', standings: adv.map((a, gi) => ({ group: LETTERS[gi], table: a.ranked.map(t => ({ label: t.label, pts: a.pts.get(t.id) })), advanced: a.ranked.slice(0, 2).map(t => t.label) })) })
let qualifiers
if (FIELD === 32) {
  qualifiers = null // 32 uses fixed crossings below, not a seeded R32
} else {
  const winners = adv.map(a => a.ranked[0]), runners = adv.map(a => a.ranked[1])
  const thirds = adv.map(a => a.ranked[2])
  const ptsById = new Map(); adv.forEach(a => a.ranked.forEach(t => ptsById.set(t.id, a.pts.get(t.id))))
  const bestThirds = [...thirds].sort((p, q) => (ptsById.get(q.id) - ptsById.get(p.id)) || (q.rating - p.rating)).slice(0, 8)
  const tier = arr => [...arr].sort((p, q) => (ptsById.get(q.id) - ptsById.get(p.id)) || (q.rating - p.rating))
  qualifiers = [...tier(winners), ...tier(runners), ...tier(bestThirds)] // 32 ranked
}
log('Group stage done.')

// ─────────────────────────────────────────────────────── KNOCKOUT
phase('Knockout')
async function playRound(pairs, stakes) {
  return parallel(pairs.map((p, idx) => () => playMatch(p[0], p[1], idx, stakes, 'Knockout', decided).then(r => {
    // Live: emit each knockout match AS IT RESOLVES so the bracket fills slot-by-slot, not whole-round.
    emit({ ev: 'match', stakes, slot: idx, winner: r.winner.label, loser: r.loser.label, margin: r.margin })
    return r
  })))
}
let roundPairs, firstStakes
if (FIELD === 32) {
  const W = i => adv[i].ranked[0], R = i => adv[i].ranked[1]
  roundPairs = [[W(0), R(1)], [W(2), R(3)], [W(4), R(5)], [W(6), R(7)],
                [W(1), R(0)], [W(3), R(2)], [W(5), R(4)], [W(7), R(6)]] // authentic R16 crossings
  firstStakes = 'R16'
} else {
  const order = seedSlotOrder(32), slots = order.map(s => qualifiers[s - 1])
  roundPairs = []
  for (let i = 0; i < slots.length; i += 2) roundPairs.push([slots[i], slots[i + 1]])
  for (let i = 0; i < roundPairs.length - 1; i++) // same-group repair
    if (roundPairs[i][0].group === roundPairs[i][1].group) { const t = roundPairs[i][1]; roundPairs[i][1] = roundPairs[i + 1][1]; roundPairs[i + 1][1] = t }
  firstStakes = 'R32'
}

const order = ['R32', 'R16', 'QF', 'SF', 'FINAL']
// Live: emit the full knockout TREE up front — every round + slot, round-1 matchups known, the rest TBD —
// so the live view paints the whole bracket immediately and advances winners into later slots as rounds
// resolve (you watch a team move on, and the in-flight round shows as "playing").
{
  const si = order.indexOf(firstStakes), tree = []
  for (let k = si, n = roundPairs.length; k < order.length && n >= 1; n >>= 1, k++) {
    tree.push({ stakes: order[k], matches: Array.from({ length: n }, (_, m) => (k === si
      ? { slot: m, a: roundPairs[m][0].label, b: roundPairs[m][1].label }
      : { slot: m, a: null, b: null })) })
    if (order[k] === 'FINAL') break
  }
  emit({ ev: 'bracket', rounds: tree })
}
let stakes = firstStakes, pairs = roundPairs, lastRound, history = {}
while (pairs.length >= 1) {
  log(`${stakes}: ${pairs.length} match(es)..`)
  const res = await playRound(pairs, stakes)
  history[stakes] = res
  lastRound = res
  // Realtime eliminations (the user-requested "live eliminations"): one event per knockout round
  // carrying every result + who just went out. The log() line is the free Tier-0 view.
  log(`${stakes} out: ${res.map(r => `${r.loser.label} (${r.margin})`).join(', ')}`)
  emit({ ev: 'round', stakes, matches: res.map(r => ({ winner: r.winner.label, loser: r.loser.label, margin: r.margin })), eliminated: res.map(r => r.loser.label) })
  if (pairs.length === 1) break
  pairs = nextRoundPairs(res.map(r => r.winner))
  stakes = order[order.indexOf(stakes) + 1]
}
const champion = lastRound[0].winner
emit({ ev: 'champion', label: champion.label, stakes })

// ─────────────────────────────────────────────────────── REFERENCE CHALLENGE
// The champion must beat the author's true original head-to-head, or the output is
// "keep the original". A tournament confirming the field never improved is a real result.
let referenceChallenge = null
if (USE_INCUMBENT && INCUMBENT) {
  const original = { id: -1, label: 'ORIGINAL(incumbent)', markdown: INCUMBENT, rating: 1500, group: '-', flaw: { disqualified: false } }
  const rc = await playMatch(champion, original, 0, 'FINAL', 'Knockout', []) // throwaway decided: keep the original out of global Elo
  referenceChallenge = { championBeatOriginal: rc.winner.id === champion.id, margin: rc.margin, reason: rc.reason }
  log(`Reference challenge: champion ${rc.winner.id === champion.id ? 'BEAT' : 'did NOT beat'} the original (${rc.margin}).`)
}

// ─────────────────────────────────────────────────────── TRUST REPORT
const globalRating = eloRatings(pool, decided)
const ratingLeaderId = globalRating[0][0]
const championIsLeader = champion.id === ratingLeaderId
const beaten = decided.filter(m => m.winnerId === champion.id).map(m => m.loserId)
const ratingOf = new Map(globalRating)
const avgBeatenRating = beaten.length ? Math.round(beaten.reduce((s, id) => s + ratingOf.get(id), 0) / beaten.length) : 0

log(`Champion: ${champion.label}. Rating leader: ${pool.find(t => t.id === ratingLeaderId).label}.`)

const trustVerdict = championIsLeader
  ? 'robust: bracket champion is also the rating leader'
  : 'bracket variance: champion is not the rating leader, consider a top-4 round-robin runoff'
const recommendation = (USE_INCUMBENT && referenceChallenge && !referenceChallenge.championBeatOriginal)
  ? 'KEEP THE ORIGINAL: the field did not clearly beat the incumbent'
  : championIsLeader ? 'ADOPT THE CHAMPION: bracket winner is also the rating leader'
  : 'ADOPT ONLY AFTER A TOP-4 RUNOFF: bracket variance, champion is not the rating leader'

// ─────────────────────────────────────────────────────── EFFECTS (factorial analysis)
const PLAYOFF = false  // CONFIG: generate the predicted optimum and play it vs champion + incumbent
// Deterministic post-hoc effects from coords + Elo. Null for kind:'flat' (one nominal axis).
function computeEffects(pool, globalRating, resolved) {
  if (!resolved || !resolved.axes || !resolved.axes.length) return null
  const ratingById = new Map(globalRating)
  const ratingOf = t => ratingById.get(t.id) || 0
  const axes = resolved.axes
  const mainEffects = axes.map(ax => {
    const byValue = ax.values.map(v => {
      const members = pool.filter(t => t.coords && t.coords[ax.name] === v)
      const mean = members.length ? members.reduce((s, t) => s + ratingOf(t), 0) / members.length : null
      return { value: v, mean: mean == null ? null : Math.round(mean), n: members.length }
    })
    const means = byValue.filter(b => b.mean != null).map(b => b.mean)
    const spread = means.length ? Math.max(...means) - Math.min(...means) : 0
    const best = byValue.filter(b => b.mean != null).sort((a, b) => b.mean - a.mean)[0]
    return { axis: ax.name, byValue, spread, best: best ? best.value : null }
  }).sort((a, b) => b.spread - a.spread)
  const interactions = []
  for (let i = 0; i < axes.length; i++) for (let j = i + 1; j < axes.length; j++) {
    const A = axes[i], B = axes[j]
    if (A.values.length !== 2 || B.values.length !== 2) continue
    const cm = (av, bv) => { const m = pool.filter(t => t.coords && t.coords[A.name] === av && t.coords[B.name] === bv); return m.length ? m.reduce((s, t) => s + ratingOf(t), 0) / m.length : null }
    const m00 = cm(A.values[0], B.values[0]), m01 = cm(A.values[0], B.values[1]), m10 = cm(A.values[1], B.values[0]), m11 = cm(A.values[1], B.values[1])
    if ([m00, m01, m10, m11].some(x => x == null)) continue
    interactions.push({ axes: [A.name, B.name], strength: Math.round(Math.abs((m11 - m10) - (m01 - m00)) / 2) })
  }
  interactions.sort((a, b) => b.strength - a.strength)
  const optimum = {}; mainEffects.forEach(me => { const a = axes.find(x => x.name === me.axis); optimum[me.axis] = me.best != null ? me.best : (a && a.values[0]) })
  const inField = pool.find(t => axes.every(ax => t.coords[ax.name] === optimum[ax.name]))
  return { estimable: resolved.estimable, strategy: resolved.strategy, mainEffects, interactions: interactions.slice(0, 6),
    predictedOptimum: { coords: optimum, inField: !!inField, label: inField ? inField.label : axes.map(ax => shortVal(optimum[ax.name])).join('-') } }
}
const effects = computeEffects(pool, globalRating, DESIGN.resolved)
if (effects) log(`Effects: top axis "${effects.mainEffects[0].axis}" (spread ${effects.mainEffects[0].spread}); predicted optimum ${effects.predictedOptimum.label}${effects.predictedOptimum.inField ? ' (in field)' : ' (synthesized)'}.`)

let playoff = null
if (PLAYOFF && effects && !effects.predictedOptimum.inField && DESIGN.resolved && DESIGN.resolved.frag && INCUMBENT) {
  const opt = effects.predictedOptimum.coords
  const fragments = DESIGN.resolved.axes.map(a => `- ${a.name} = ${opt[a.name]}: ${DESIGN.resolved.frag[a.name][opt[a.name]]}`).join('\n')
  const optPrompt = `Produce a VARIANT of the artifact below at this exact design point:\n${fragments}\nRealize every setting. Constraints / criteria:\n${SPEC}\nBASE ARTIFACT:\n---\n${BASE}\n---\nReturn JSON { title, oneLineAngle, markdown }.`
  const og = await agent(optPrompt, { label: 'predicted-optimum', phase: 'Knockout', schema: GEN_SCHEMA })
  if (og) {
    const optEntry = { id: -2, label: 'PREDICTED-OPTIMUM', coords: opt, markdown: og.markdown, rating: 1500, group: '-' }
    await screenAll([optEntry], 'Knockout')  // same fabrication gate as the field; a fabricated optimum forfeits
    if (optEntry.flaw && optEntry.flaw.disqualified) {
      playoff = { disqualified: true, category: optEntry.flaw.category || '', flaw: optEntry.flaw.flaw, markdown: og.markdown }
      log(`Playoff: predicted optimum disqualified at the gate (${optEntry.flaw.category || ''} ${optEntry.flaw.flaw}); skipped.`)
    } else {
      const incumbentEntry = { id: -1, label: 'ORIGINAL', markdown: INCUMBENT, rating: 1500, group: '-', flaw: { disqualified: false } }
      const m1 = await playMatch(optEntry, champion, 0, 'FINAL', 'Knockout', [])
      const m2 = await playMatch(optEntry, incumbentEntry, 1, 'FINAL', 'Knockout', [])
      playoff = { beatChampion: m1.winner.id === optEntry.id, beatOriginal: m2.winner.id === optEntry.id, markdown: og.markdown }
      log(`Playoff: predicted optimum ${playoff.beatChampion ? 'beat' : 'lost to'} champion; ${playoff.beatOriginal ? 'beat' : 'lost to'} original.`)
    }
  }
}

function pathOf(champ) {
  const steps = []
  groupResults.filter(r => r.winner.id === champ.id).forEach(r => steps.push({ round: 'Group', beat: r.loser.label, margin: r.margin, reason: r.reason }))
  for (const k of order) (history[k] || []).filter(r => r.winner.id === champ.id).forEach(r => steps.push({ round: k, beat: r.loser.label, margin: r.margin, reason: r.reason }))
  return steps
}

// ─────────────────────────────────────────────────────── HTML REPORT (the deliverable)
// Self-contained World Cup-flavored HTML of the final state graph: bracket tree, group
// tables, champion path, global rating, trust verdict, DQs. Returned as `reportHtml`;
// the main loop writes it to disk and opens it. No external deps, inline CSS.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function renderReport() {
  const ratingOf2 = new Map(globalRating)
  const champLabel = esc(champion.label)
  const playedRounds = order.filter(k => history[k] && history[k].length)
  const koCols = playedRounds.map(k => {
    const ms = history[k].map(m => `<div class="match"><div class="team win">${esc(m.winner.label)}</div><div class="team lose">${esc(m.loser.label)}</div><div class="mrg">${esc(m.margin || '')}</div></div>`).join('')
    return `<div class="kocol"><div class="rndname">${esc(k)}</div>${ms}</div>`
  }).join('')
  const groupCards = groups.map((g, gi) => {
    const a = adv[gi]
    const rows = a.ranked.map((t, i) => `<tr class="${i < 2 ? 'adv' : ''}"><td>${esc(t.label)}</td><td class="pts">${a.pts.get(t.id)}</td></tr>`).join('')
    return `<div class="grp"><h4>Group ${LETTERS[gi]}</h4><table>${rows}</table></div>`
  }).join('')
  const pathRows = pathOf(champion).map(s => `<li><b>${esc(s.round)}</b> beat ${esc(s.beat)} <span class="mrg">(${esc(s.margin || '')})</span><div class="why">${esc(s.reason || '')}</div></li>`).join('')
  const ratingRows = globalRating.slice(0, 16).map(([id, r], i) => { const t = pool.find(x => x.id === id); return `<tr><td>${i + 1}</td><td>${esc(t ? t.label : id)}</td><td>${Math.round(r)}</td></tr>` }).join('')
  const dq = pool.filter(t => t.flaw && t.flaw.disqualified)
  const dqHtml = dq.length ? `<div class="card"><h3>Disqualified (${dq.length})</h3><ul>${dq.map(t => `<li>${esc(t.label)}: <b>${esc(t.flaw.category || '')}</b> ${esc(t.flaw.flaw)}</li>`).join('')}</ul></div>` : ''
  const refTxt = referenceChallenge ? (referenceChallenge.championBeatOriginal ? `champion beat the original (${esc(referenceChallenge.margin)})` : 'champion did NOT beat the original') : 'no incumbent'
  return `<!doctype html><html><head><meta charset="utf-8"><title>World Cup: ${champLabel}</title><style>
:root{--pitch:#0b6e3b;--pitch2:#0a5e33;--gold:#f4c430;--ink:#10241a;--paper:#f7f4ec}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:var(--paper);color:var(--ink)}
header{background:linear-gradient(135deg,var(--pitch),var(--pitch2));color:#fff;padding:30px 28px;border-bottom:5px solid var(--gold)}
header h1{margin:0;font-size:22px;letter-spacing:1px}.champ{font-size:30px;font-weight:800;color:var(--gold);margin:8px 0}
.rec{display:inline-block;background:var(--gold);color:var(--ink);font-weight:700;padding:5px 12px;border-radius:20px;margin-top:6px}
.wrap{max-width:1180px;margin:0 auto;padding:22px}
.card{background:#fff;border:1px solid #dcd6c8;border-radius:10px;padding:16px 18px;margin:18px 0;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h3{margin:.2em 0 .6em;color:var(--pitch)}
.groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.grp{background:#fff;border:1px solid #dcd6c8;border-radius:8px;padding:8px 10px}.grp h4{margin:0 0 6px;color:var(--pitch)}
.grp table{width:100%;border-collapse:collapse;font-size:13px}.grp td{padding:2px 4px;border-bottom:1px dotted #e3ddcf}
.grp td.pts{text-align:right;font-weight:700}.grp tr.adv td{background:rgba(244,196,48,.20)}
.bracket{display:flex;gap:18px;overflow-x:auto;padding-bottom:8px}
.kocol{min-width:148px;display:flex;flex-direction:column;justify-content:space-around;gap:10px}
.rndname{font-weight:700;color:var(--pitch);text-align:center;margin-bottom:4px;text-transform:uppercase;font-size:11px;letter-spacing:1px}
.match{border:1px solid #dcd6c8;border-radius:6px;overflow:hidden;font-size:12px;background:#fff}
.team{padding:4px 8px}.team.win{font-weight:800;background:rgba(11,110,59,.10)}.team.lose{color:#9a958a;border-top:1px solid #eee}
.mrg{font-size:10px;color:#b0a890;padding:0 8px 3px}
table.rank{width:100%;border-collapse:collapse}table.rank td{padding:4px 8px;border-bottom:1px solid #eee}
ul.path{list-style:none;padding:0}ul.path li{padding:6px 0;border-bottom:1px solid #eee}.why{color:#667;font-size:12px}.trust{font-weight:700}
</style></head><body>
<header><h1>&#127942; WORLD CUP &mdash; FINAL STATE</h1><div class="champ">${champLabel}</div>
<div>seed #${seeded.findIndex(t => t.id === champion.id) + 1} &middot; rating ${Math.round(ratingOf2.get(champion.id) || 0)} &middot; reference: ${refTxt}</div>
<div class="rec">${esc(recommendation)}</div></header>
<div class="wrap">
<div class="card"><h3>Trust</h3><div class="trust">${esc(trustVerdict)}</div><div>rating leader: ${esc(pool.find(t => t.id === ratingLeaderId).label)} &middot; avg rating of opponents the champion beat: ${avgBeatenRating}</div></div>
<div class="card"><h3>Knockout</h3><div class="bracket">${koCols}<div class="kocol"><div class="rndname">Champion</div><div class="match"><div class="team win">${champLabel} &#127942;</div></div></div></div></div>
<div class="card"><h3>Group stage</h3><div class="groups">${groupCards}</div></div>
<div class="card"><h3>Champion's path</h3><ul class="path">${pathRows}</ul></div>
<div class="card"><h3>Global rating (Bradley-Terry / Elo)</h3><table class="rank"><tr><td>#</td><td>entry</td><td>rating</td></tr>${ratingRows}</table></div>
${dqHtml}
</div></body></html>`
}

// Centered mirror bracket (FIFA-style), clickable entries with info sheets. Generic over
// field size: works for 32 (R16 start) and 48 (R32 start) by splitting each round in half.
function renderReportV2() {
  const ratingById = new Map(globalRating)
  const mlog = {}
  const addLog = (round, w, l, margin, reason) => {
    ;(mlog[w] = mlog[w] || []).push({ round, opp: l, won: true, margin, reason })
    ;(mlog[l] = mlog[l] || []).push({ round, opp: w, won: false, margin, reason })
  }
  groupResults.forEach(m => addLog('Group', m.winner.label, m.loser.label, m.margin, m.reason))
  for (const k of order) (history[k] || []).forEach(m => addLog(k, m.winner.label, m.loser.label, m.margin, m.reason))
  if (referenceChallenge) addLog('Reference', referenceChallenge.championBeatOriginal ? champion.label : 'ORIGINAL', referenceChallenge.championBeatOriginal ? 'ORIGINAL' : champion.label, referenceChallenge.margin, referenceChallenge.reason)
  const DATA = {}
  pool.forEach(t => { DATA[t.label] = { title: t.title || '', angle: t.oneLineAngle || '', coords: t.coords || {}, seed: seeded.findIndex(x => x.id === t.id) + 1, rating: Math.round(ratingById.get(t.id) || 0), dq: !!(t.flaw && t.flaw.disqualified), flaw: t.flaw ? (t.flaw.flaw || '') : '', category: t.flaw ? (t.flaw.category || '') : '', matches: mlog[t.label] || [], text: t.markdown || '' } })
  const dataJson = JSON.stringify(DATA).replace(/</g, '\\u003c').replace(/|/g, '')
  const entry = label => `<span class="entry" data-k="${esc(label)}">${esc(label)}</span>`
  const card = m => m ? `<div class="match"><div class="slot win">${entry(m.winner.label)}<span class="mg">${esc(m.margin || '')}</span></div><div class="slot lose">${entry(m.loser.label)}</div></div>` : `<div class="match empty"></div>`
  const playedRounds = order.filter(k => history[k] && history[k].length)
  const finalKey = playedRounds[playedRounds.length - 1]
  const preRounds = playedRounds.slice(0, -1)
  const colOf = matches => { let s = ''; for (let i = 0; i < matches.length; i += 2) s += (i + 1 < matches.length) ? `<div class="pair">${card(matches[i])}${card(matches[i + 1])}</div>` : `<div class="pair single">${card(matches[i])}</div>`; return `<div class="round">${s}</div>` }
  const leftCols = preRounds.map(k => colOf(history[k].slice(0, Math.ceil(history[k].length / 2)))).join('')
  const rightCols = preRounds.slice().reverse().map(k => colOf(history[k].slice(Math.ceil(history[k].length / 2)))).join('')
  const finalM = history[finalKey] && history[finalKey][0]
  const finalLine = finalM ? `${esc(finalM.winner.label)} def. ${esc(finalM.loser.label)} (${esc(finalM.margin)})` : ''
  const groupCards = groups.map((g, gi) => { const a = adv[gi]; const rows = a.ranked.map((t, i) => `<tr class="${i < 2 ? 'adv' : ''}"><td>${entry(t.label)}</td><td class="pts">${a.pts.get(t.id)}</td></tr>`).join(''); return `<div class="grp"><h4>Group ${LETTERS[gi]}</h4><table>${rows}</table></div>` }).join('')
  const ratingRows = globalRating.map(([id, r], i) => { const t = pool.find(x => x.id === id); return `<tr><td>${i + 1}</td><td>${entry(t ? t.label : String(id))}</td><td>${Math.round(r)}</td></tr>` }).join('')
  const dq = pool.filter(t => t.flaw && t.flaw.disqualified)
  const dqHtml = dq.length ? `<div class="panel"><h3>Disqualified at the gate (${dq.length})</h3><ul>${dq.map(t => `<li>${entry(t.label)}: <b>${esc(t.flaw.category || '')}</b> ${esc(t.flaw.flaw)}</li>`).join('')}</ul></div>` : `<div class="panel"><h3>Fabrication gate</h3><div class="muted">0 disqualified.</div></div>`
  const refTxt = referenceChallenge ? (referenceChallenge.championBeatOriginal ? `champion beat the original (${esc(referenceChallenge.margin)})` : 'champion did NOT beat the original') : 'no incumbent'
  // ─── coordinate view (axes + sections): parallel coordinates + effects + a 2-axis explorer.
  // For sections it reads as a LINEUP: each axis is a position (slot), each value a player
  // (slot survivor), each polyline a candidate lineup, the champion drawn gold; effects bars
  // are per-player form (marginal Elo), the explorer compares any two positions.
  const cv_axes = ((DESIGN.kind === 'axes' || DESIGN.kind === 'sections') && DESIGN.resolved && DESIGN.resolved.axes && effects) ? DESIGN.resolved.axes : null
  const isSec = !!cv_axes && DESIGN.kind === 'sections'
  const cvTitle = isSec ? 'Lineup space &middot; positions &times; players' : 'Coordinate space'
  const cvChampKey = isSec ? 'winning lineup' : 'champion'
  const cvOptLbl = isSec ? 'best XI (top player per position)' : 'predicted optimum'
  const cvExplore = isSec ? 'compare two positions' : 'explore two axes'
  let coordPanel = '', coordScript = ''
  if (cv_axes) {
    const W = 760, H = 240, padX = 64, padY = 34
    const axX = i => padX + (cv_axes.length <= 1 ? 0 : i * (W - 2 * padX) / (cv_axes.length - 1))
    const valY = (ax, v) => { const n = ax.values.length, idx = Math.max(0, ax.values.indexOf(v)); return n <= 1 ? H / 2 : padY + idx * (H - 2 * padY) / (n - 1) }
    const ratingByIdC = new Map(globalRating)
    const axisSvg = cv_axes.map((ax, i) => {
      const x = axX(i)
      const ticks = ax.values.map(v => `<text x="${x}" y="${valY(ax, v) + 4}" text-anchor="middle" font-size="10" fill="#cdb9c8">${esc(v)}</text>`).join('')
      return `<line x1="${x}" y1="${padY}" x2="${x}" y2="${H - padY}" stroke="rgba(245,197,66,.3)"/><text x="${x}" y="18" text-anchor="middle" font-size="11" fill="#f5c542" font-weight="700">${esc(ax.name)}</text>${ticks}`
    }).join('')
    const poly = (coords, cls) => `<polyline points="${cv_axes.map((ax, i) => `${axX(i)},${valY(ax, coords[ax.name])}`).join(' ')}" fill="none" class="${cls}"/>`
    const lines = pool.filter(t => t.id !== champion.id).map(t => poly(t.coords, 'pc')).join('')
    const optLine = effects.predictedOptimum.inField ? '' : poly(effects.predictedOptimum.coords, 'pc opt')
    const pcSvg = `<svg viewBox="0 0 ${W} ${H}" class="pc-svg" preserveAspectRatio="xMidYMid meet">${axisSvg}${lines}${optLine}${poly(champion.coords, 'pc champ')}</svg>`
    const effRows = effects.mainEffects.map(me => {
      const vals = me.byValue.filter(b => b.mean != null), mx = Math.max(...vals.map(v => v.mean)), mn = Math.min(...vals.map(v => v.mean)), rng = Math.max(1, mx - mn)
      const bars = me.byValue.map(b => b.mean == null ? '' : `<div class="ebar"><span class="ev ${b.value === me.best ? 'best' : ''}">${esc(b.value)}</span><span class="etrack"><span class="efill" style="width:${Math.round(15 + 85 * (b.mean - mn) / rng)}%"></span></span><span class="enum">${b.mean}</span></div>`).join('')
      return `<div class="erow"><div class="eax">${esc(me.axis)} <span class="muted">spread ${me.spread}</span></div>${bars}</div>`
    }).join('')
    const interTxt = effects.interactions.length ? effects.interactions.slice(0, 4).map(x => `${esc(x.axes.join('&times;'))} ${x.strength}`).join(' &middot; ') : 'none notable'
    const estLabel = effects.estimable === 'none' ? '<span class="warn">empirical, not fitted</span>' : `fitted (${esc(effects.estimable)})`
    const opt = effects.predictedOptimum, optTxt = `${esc(opt.label)} ${opt.inField ? '(in field)' : '(synthesized)'}`
    const axSel = id => `<select id="${id}" onchange="grid()">${cv_axes.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join('')}</select>`
    coordPanel = `<div class="panel coord"><h3>${cvTitle} &middot; ${esc(effects.strategy)} &middot; effects ${estLabel}</h3>
<div class="pc-wrap">${pcSvg}</div><div class="pc-key"><span class="champ">${cvChampKey}</span>${optLine ? `<span class="opt">${cvOptLbl}</span>` : ''}</div>
<div class="eff">${effRows}<div class="erow"><div class="eax">${cvOptLbl}</div><div class="muted">${optTxt} &middot; top interactions: ${interTxt}</div></div></div>
<div class="explorer"><div class="exsel">${cvExplore} &mdash; X ${axSel('gx')} Y ${axSel('gy')}</div><div id="grid"></div></div></div>`
    const J = o => JSON.stringify(o).replace(/</g, '\\u003c')
    coordScript = `
var AXES=${J(cv_axes.map(a => ({ name: a.name, values: a.values })))};
var PTS=${J(pool.map(t => ({ label: t.label, coords: t.coords, rating: Math.round(ratingByIdC.get(t.id) || 0), champ: t.id === champion.id })))};
function grid(){var gx=+document.getElementById('gx').value,gy=+document.getElementById('gy').value;if(gx===gy){gy=(gy+1)%AXES.length;document.getElementById('gy').value=gy;}var ax=AXES[gx],ay=AXES[gy],cells={};PTS.forEach(function(p){var k=p.coords[ax.name]+'|'+p.coords[ay.name];(cells[k]=cells[k]||[]).push(p);});var h='<table class="gridtab"><tr><td></td>'+ay.values.map(function(v){return '<th>'+he(v)+'</th>';}).join('')+'</tr>';ax.values.forEach(function(xv){h+='<tr><th>'+he(xv)+'</th>';ay.values.forEach(function(yv){var arr=cells[xv+'|'+yv]||[];var avg=arr.length?Math.round(arr.reduce(function(s,p){return s+p.rating;},0)/arr.length):0;var sh=arr.length?Math.max(0,Math.min(1,(avg-1450)/200)):0;h+='<td style="background:rgba(245,197,66,'+(0.04+0.5*sh).toFixed(2)+')">'+arr.map(function(p){return '<span class="entry'+(p.champ?' gold':'')+'" data-k="'+he(p.label)+'">'+he(p.label)+'</span>';}).join(' ')+(arr.length?'<div class="cavg">'+avg+'</div>':'')+'</td>';});h+='</tr>';});h+='</table>';document.getElementById('grid').innerHTML=h;}
if(document.getElementById('gy')){document.getElementById('gy').value=Math.min(1,AXES.length-1);grid();}`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>World Cup: ${esc(champion.label)}</title><style>
:root{--bg1:#2b0a26;--bg2:#4a1140;--bg3:#5e1650;--gold:#f5c542;--line:rgba(245,197,66,.45);--card:rgba(255,255,255,.06);--cardbd:rgba(255,255,255,.14);--txt:#f3e9f0}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--txt);background:radial-gradient(120% 80% at 50% 0%,var(--bg3),var(--bg2) 45%,var(--bg1));min-height:100vh}
header{text-align:center;padding:26px 20px 6px}
header .fifa{font-size:11px;letter-spacing:3px;color:var(--gold);font-weight:700;text-transform:uppercase}
header h1{margin:6px 0 2px;font-size:20px;letter-spacing:1px;font-weight:800}
header .sub{color:#d9c4d4;font-size:12px}
.recpill{display:inline-block;margin-top:10px;background:linear-gradient(180deg,#ff7a3c,#e8551f);color:#fff;font-weight:700;padding:7px 16px;border-radius:22px;font-size:12px;box-shadow:0 4px 14px rgba(232,85,31,.4)}
.hint{text-align:center;color:#b79fb1;font-size:11px;margin-top:4px}
.wrap{max-width:1280px;margin:0 auto;padding:10px 18px 40px}
.bracket{display:flex;justify-content:center;align-items:stretch;gap:10px;padding:22px 0;overflow-x:auto}
.half{display:flex}
.round{display:flex;flex-direction:column;justify-content:space-around;padding:0 16px;min-width:138px}
.pair{position:relative;display:flex;flex-direction:column;justify-content:space-around;gap:26px;flex:1}
.match{position:relative;background:var(--card);border:1px solid var(--cardbd);border-radius:8px;overflow:hidden}
.match.empty{background:transparent;border-style:dashed;min-height:46px}
.slot{padding:5px 9px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;gap:6px}
.slot.win{font-weight:800;color:var(--gold)}.slot.lose{color:#c9b6c4;border-top:1px solid rgba(255,255,255,.08)}
.mg{font-size:9px;color:#b9a7b4;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.entry{cursor:pointer;border-bottom:1px dotted transparent}.entry:hover{border-bottom-color:currentColor}
.half.left .pair:not(.single)::after{content:"";position:absolute;right:-16px;top:25%;bottom:25%;width:2px;background:var(--line)}
.half.left .match::after{content:"";position:absolute;right:-16px;top:50%;width:16px;height:2px;background:var(--line)}
.half.right .pair:not(.single)::after{content:"";position:absolute;left:-16px;top:25%;bottom:25%;width:2px;background:var(--line)}
.half.right .match::after{content:"";position:absolute;left:-16px;top:50%;width:16px;height:2px;background:var(--line)}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 8px;min-width:180px}
.winnerlbl{font-size:13px;letter-spacing:4px;color:var(--gold);font-weight:800;text-transform:uppercase;margin-bottom:6px}
.trophy{font-size:74px;line-height:1;filter:drop-shadow(0 6px 18px rgba(245,197,66,.55))}
.champcard{margin-top:8px;background:linear-gradient(180deg,rgba(245,197,66,.22),rgba(245,197,66,.08));border:1.5px solid var(--gold);border-radius:10px;padding:8px 18px;font-weight:800;font-size:16px}
.champcard .entry{color:var(--gold)}
.finalline{margin-top:8px;font-size:11px;color:#d9c4d4}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:24px}
.panel{background:var(--card);border:1px solid var(--cardbd);border-radius:12px;padding:14px 16px}
.panel h3{margin:.1em 0 .7em;color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:1px}
.muted{color:#c9b6c4}.trust{font-weight:700}
.groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.grp{background:rgba(0,0,0,.18);border:1px solid var(--cardbd);border-radius:8px;padding:7px 9px}
.grp h4{margin:0 0 5px;color:var(--gold);font-size:12px}
.grp table{width:100%;border-collapse:collapse;font-size:12px}.grp td{padding:2px 3px;border-bottom:1px dotted rgba(255,255,255,.1)}
.grp td.pts{text-align:right;font-weight:700}.grp tr.adv td{background:rgba(245,197,66,.14)}
table.rank{width:100%;border-collapse:collapse;font-size:12.5px}table.rank td{padding:3px 7px;border-bottom:1px solid rgba(255,255,255,.08)}
ul{margin:.2em 0;padding-left:1.1em}
.modal{position:fixed;inset:0;background:rgba(10,2,9,.74);display:none;align-items:center;justify-content:center;padding:24px;z-index:50}
.modal.show{display:flex}
.sheet{background:linear-gradient(180deg,#3a0e33,#2b0a26);border:1px solid var(--cardbd);border-radius:14px;max-width:760px;width:100%;max-height:86vh;overflow:auto;padding:22px 26px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.sheet h2{margin:0 0 2px;color:var(--gold)}.sheet .meta{color:#cdb9c8;font-size:12.5px;margin-bottom:8px}
.sheet h3{color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:16px 0 6px}
.dqtag{background:#b3261e;color:#fff;font-size:10px;padding:2px 7px;border-radius:10px}
.mlog{list-style:none;padding:0}.mlog li{padding:5px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.mlog .w{color:var(--gold);font-weight:700}.mlog .l{color:#e58ab0}.why{color:#c2adbd;font-size:12px}
.essay p{margin:.55em 0;color:#ece0e9}.x{float:right;cursor:pointer;color:#cdb9c8;font-size:22px;line-height:1}
.coord{margin-top:16px}
.pc-wrap{overflow-x:auto}.pc-svg{width:100%;max-width:780px;height:auto;display:block;margin:0 auto}
.pc{stroke:rgba(255,255,255,.16);stroke-width:1}.pc.champ{stroke:var(--gold);stroke-width:2.5}.pc.opt{stroke:#7fd1ff;stroke-width:2;stroke-dasharray:5 4}
.pc-key{text-align:center;font-size:11px;color:#cdb9c8;margin-top:2px}.pc-key .champ{color:var(--gold);margin-right:14px}.pc-key .opt{color:#7fd1ff}
.eff{margin-top:12px}.erow{margin:7px 0;font-size:12px}.eax{color:#f5c542;font-weight:700;margin-bottom:3px}
.ebar{display:flex;align-items:center;gap:8px;margin:2px 0}.ev{width:96px;color:#d9c4d4}.ev.best{color:var(--gold);font-weight:700}
.etrack{flex:1;height:8px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}.efill{display:block;height:100%;background:var(--gold)}.enum{width:44px;text-align:right;color:#cdb9c8}
.warn{color:#ffb38a}
.explorer{margin-top:14px}.exsel{font-size:12px;color:#cdb9c8;margin-bottom:6px}.exsel select{background:#2b0a26;color:#f3e9f0;border:1px solid var(--cardbd);border-radius:6px;padding:2px 6px;margin:0 4px}
.gridtab{border-collapse:collapse;font-size:11px}.gridtab th{color:#f5c542;padding:3px 6px;text-align:left}.gridtab td{border:1px solid rgba(255,255,255,.1);padding:4px 6px;vertical-align:top;min-width:84px}
.cavg{font-size:9px;color:#b9a7b4;margin-top:2px}.entry.gold{color:var(--gold);font-weight:700}
</style></head><body>
<header><div class="fifa">&#127942; World Cup</div><h1>${esc((typeof meta !== 'undefined' && meta.name ? meta.name : 'WORLD CUP').toUpperCase())}</h1>
<div class="sub">champion <b style="color:var(--gold)">${esc(champion.label)}</b> &middot; ${esc(trustVerdict)} &middot; ${refTxt}</div>
<div class="recpill">${esc(recommendation)}</div><div class="hint">click any entry for its info and full text</div></header>
<div class="wrap"><div class="bracket"><div class="half left">${leftCols}</div>
<div class="center"><div class="winnerlbl">Winner</div><div class="trophy">&#127942;</div><div class="champcard">${entry(champion.label)}</div><div class="finalline">${finalLine}</div></div>
<div class="half right">${rightCols}</div></div>
<div class="panels">
<div class="panel"><h3>Trust</h3><div class="trust">${esc(trustVerdict)}</div><div class="muted">rating leader: ${esc(pool.find(t => t.id === ratingLeaderId).label)} &middot; avg rating of beaten opponents: ${avgBeatenRating}</div></div>
<div class="panel"><h3>Group stage</h3><div class="groups">${groupCards}</div></div>
${dqHtml}
<div class="panel"><h3>Global rating (Elo)</h3><table class="rank"><tr><td>#</td><td>entry</td><td>rating</td></tr>${ratingRows}</table></div>
</div>${coordPanel}</div>
<div class="modal" id="modal" onclick="if(event.target===this)hide()"><div class="sheet"><span class="x" onclick="hide()">&times;</span><div id="mbody"></div></div></div>
<script>
var DATA=${dataJson};
function he(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function show(k){var d=DATA[k];if(!d)return;var h='<h2>'+he(k)+(d.dq?' <span class="dqtag">DISQUALIFIED</span>':'')+'</h2>';
h+='<div class="meta">seed #'+d.seed+' &middot; rating '+d.rating+(d.angle?(' &middot; '+he(d.angle)):'')+'</div>';
if(d.coords&&Object.keys(d.coords).filter(function(k){return k!=='__rep';}).length)h+='<div class="meta">at '+Object.keys(d.coords).filter(function(k){return k!=='__rep';}).map(function(k){return he(k)+'='+he(d.coords[k]);}).join(', ')+'</div>';
if(d.dq)h+='<div class="meta" style="color:#f3a">gate: '+(d.category?'<b>'+he(d.category)+'</b> ':'')+he(d.flaw)+'</div>';
if(d.matches&&d.matches.length){h+='<h3>matches</h3><ul class="mlog">';d.matches.forEach(function(x){h+='<li><span class="'+(x.won?'w':'l')+'">'+(x.won?'beat':'lost to')+' '+he(x.opp)+'</span> <span class="why">&middot; '+he(x.round)+' &middot; '+he(x.margin||'')+'</span><div class="why">'+he(x.reason||'')+'</div></li>';});h+='</ul>';}
h+='<h3>full text</h3><div class="essay">'+String(d.text||'').split(/\\n\\n+/).map(function(p){return '<p>'+he(p)+'</p>';}).join('')+'</div>';
document.getElementById('mbody').innerHTML=h;document.getElementById('modal').classList.add('show');}
function hide(){document.getElementById('modal').classList.remove('show');}
document.addEventListener('keydown',function(e){if(e.key==='Escape')hide();});
document.addEventListener('click',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('entry')&&t.getAttribute('data-k'))show(t.getAttribute('data-k'));});
${coordScript}
</script></body></html>`
}

// Land every live beacon in journal.jsonl before the run ends (they were fired fire-and-forget above).
if (beacons.length) { try { await Promise.allSettled(beacons) } catch (e) { /* never block the result on beacons */ } }

return {
  champion: { label: champion.label, title: champion.title, angle: champion.oneLineAngle, markdown: champion.markdown,
    seedRank: seeded.findIndex(t => t.id === champion.id) + 1, rating: Math.round(ratingOf.get(champion.id)) },
  final: lastRound[0] && { winner: lastRound[0].winner.label, loser: lastRound[0].loser.label, margin: lastRound[0].margin, reason: lastRound[0].reason },
  championPath: pathOf(champion),
  globalRanking: globalRating.map(([id, r], i) => ({ rank: i + 1, label: pool.find(t => t.id === id).label, rating: Math.round(r) })),
  trust: {
    championIsRatingLeader: championIsLeader,
    ratingLeader: pool.find(t => t.id === ratingLeaderId).label,
    avgRatingOfOpponentsBeaten: avgBeatenRating,
    finalMargin: lastRound[0] && lastRound[0].margin,
    verdict: trustVerdict,
  },
  referenceChallenge,
  recommendation,
  effects,
  playoff,
  disqualified: pool.filter(t => t.flaw?.disqualified).map(t => ({ label: t.label, category: t.flaw.category || '', flaw: t.flaw.flaw })),
  graph: {
    groups: groups.map((g, gi) => ({ group: LETTERS[gi], standings: adv[gi].ranked.map(t => ({ label: t.label, pts: adv[gi].pts.get(t.id) })), advanced: [adv[gi].ranked[0].label, adv[gi].ranked[1].label] })),
    knockout: order.filter(k => history[k] && history[k].length).map(k => ({ round: k, matches: history[k].map(m => ({ winner: m.winner.label, loser: m.loser.label, margin: m.margin })) })),
  },
  reportHtml: renderReportV2(),
}
