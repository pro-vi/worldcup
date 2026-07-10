# Judging — the taste engine

This decides whether the tournament finds the best entry or the most superficially
appealing one. Read it fully before authoring the workflow. The design is synthesized
from a working run's failure plus a cross-model (GPT Pro) judge architecture.

## The failure this is built to prevent

A previous run crowned an essay that won by **fabricating concrete detail** — invented
line numbers, a fake stack trace, a made-up class name — which a single judge read as
"lived-in and authentic." For a personal essay that is a lie beating the truth. The
judge had no taste: it rewarded surface markers (concreteness, uneven rhythm, performed
vulnerability) and could not tell genuine quality from performed quality. It also barely
discriminated (a seeding pass gave 8 of 32 entries the same score).

Two root causes, and every choice below traces to one of them:
**tastelessness** (rewarding the wrong signal) and **compression** (scores that do not
separate).

## Core principle

**Truth and authorial fidelity are gates. Taste only begins after an entry has proven
it is not cheating.** A vivid fabricated essay does not lose "some points." It forfeits.
For personal nonfiction, invented specificity presented as lived fact is doping, not a
literary virtue. The judging stack is therefore ordered:

```
deterministic preflight  ->  fatal-flaw / fabrication gate  ->  (only survivors compete)
->  pairwise taste panel  ->  calibrated aggregation (Elo / Bradley-Terry)  ->  champion
```

(The original, when you want it judged, is fielded as one of the N — see §12 — so "keep the
original" is just "the original won"; it is no longer a separate final stage.)

## 1. The source packet (the most important input)

Judges cannot detect fabrication in a vacuum. A "specific" detail is an asset if true
and a disqualifier if invented, and the only way a judge tells them apart is if you
hand it the ground truth. Build a **source packet** once and paste it into every juror
prompt. This is what makes the fabrication gate enforceable.

```
SOURCE PACKET
PROJECT: judging variants of the same {artifact}; pick the best publishable version in
the author's real voice.

REFERENCE ORIGINAL (the truth the fact ledger describes — NOT a bar the field must clear;
field it as one of the N with INCLUDE_BASE / a `given` item if you want it judged, §12):
<<< {ORIGINAL} >>>

FACT LEDGER — details that are TRUE / supported (variants may use these):
- {fact_1}
- {fact_2}

NOT ALLOWED — must not be invented or implied unless present above:
specific line numbers, class/file names, stack traces, error messages, dates, names,
places, quotes, conversations, medical details, childhood scenes, job titles, any
concrete detail presented as lived fact without support, any vulnerability/trauma not
in the source.

TARGET (present ONLY for critique / response runs; omit otherwise) — the external work this
field critiques or answers, built from its ACTUAL fetched source, not the draft's summary:
- CLAIMS / SCOPE: {what the target actually argues, and how far — its real scope}
- QUOTES: {verbatim lines that pin the above}
- SOURCES: {URLs / refs, >=2 independent}   FETCHED: {YYYY-MM-DD}
The draft's characterization of the target is a CLAIM TO VERIFY against this, never ground
truth. Attributing to the target claims / concessions / scope its source does not support is
a forfeit (gate category MISREPRESENTS_TARGET).

PERMITTED CREATIVE MOVES: reorder the argument, sharpen sentences, cut filler, rephrase
metaphors, clarify implicit logic, add clearly-marked hypotheticals, compress or expand
as the material warrants.
NOT PERMITTED: invent concrete facts; make the author sound more wounded / wiser /
more technical / more experienced than the source supports; add fake specificity or
"lived-in" detail to manufacture authenticity; swap the author's real argument for a
more marketable one.

VOICE SPEC (deep traits, not a checklist): {how the author thinks, withholds, ends}.
HOUSE-STYLE HARD BANS (optional — the USER'S own, never engine defaults; e.g. {punctuation
rules; a banned-vocab list; announced thesis}. Prefer lens penalties over gate kills for style tics).

NON-NEGOTIABLE: the best essay is the best TRUTHFUL essay in the author's voice. A less
vivid true essay beats a more vivid false one.
```

For a personal-essay run, the reference original is the author's real essay and the fact ledger is
"only what the author actually lived." When the field is generated, the generator must be told the same
NOT-ALLOWED list so it does not fabricate in the first place — but the gate still runs,
because generators cheat.

When the field critiques, responds to, or makes factual claims about a named external work,
build the TARGET section from that work's fetched source BEFORE generating: WebFetch the
original as the spine, WebSearch / exa / grep / context7 to locate and corroborate by domain,
second-source it. Do this once at setup and pin it into the packet — it then reaches
generation, seeding, the gate, and the lenses through the one criteria channel; never
per-candidate. This is the second truth anchor: author-truth (the ledger) guards against
inventing the author's life; target-truth guards against misrepresenting someone else's work.
(Headless / no-operator runs: a phase-0 fetch agent using built-in WebFetch/WebSearch is the
fallback, since interactively-authed MCP servers can be absent there.)

### Structured form (the single source of truth)

The prose packet above is what the **judges read**; it is **rendered from a structured object**
(`SOURCE_PACKET` in `workflow-template.js`) that is the **single source of truth**, so the prose a
juror reads is always exactly the structured packet:

```
SOURCE_PACKET = {
  supported_facts:  [ "...", ... ],                 // concrete things that ARE true (variants may use them)
  allowed_entities: { dates:[], names:[], files:[], quotes:[], places:[] },  // the named specifics permitted, by kind
  not_allowed:      [ "dates", "names", "files", ... ],  // entity classes barred unless they trace to the ledger
  target:           { raw, claims:[], scope, quotes:[], sources:[] } | null, // structured twin of TARGET (target-truth)
}
```

Why structured, not just prose: filling one structured object keeps the rubric coherent — the judge
prompts re-render from it automatically, so the fact ledger can't drift between where it's authored and
where the judges read it. The **default packet is the unfilled template**: it renders today's prose
ledger byte-for-byte, so a run with no packet is unchanged. Fabrication is caught at runtime by the
**LLM screener panel** (the fabrication gate, §2/§3) reading this ledger — there is no separate
mechanical/no-LLM fact-check; the screeners' same-family majority is what disqualifies a fabricated specific.

## 2. Deterministic preflight (cheap, runs before any agent)

Do not spend an LLM call to detect an em dash. Grep. The bans are **profile-driven** — the engine ships
none; a profile (e.g. prose) declares them. This catches house-style violations mechanically and routes
the rest to the fabrication gate.

```js
function preflight(text, bans) {            // bans default {} (engine ships no house bans)
  const hard = [], soft = []
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')   // vocab is a literal word list
  if (bans.emDash && text.includes('—')) hard.push('em dash')          // auto-DQ (a profile opts in)
  for (const w of (bans.vocab || [])) if (new RegExp(`\\b${esc(w)}\\b`, 'i').test(text)) soft.push(`banned: ${w}`)
  // PHRASE flags are profile entries, not hardcoded heuristics — a prose profile supplies e.g.
  //   { label:'announced thesis', re:'this essay|in this piece|what i want to explore' }
  //   { label:'uplift closer',    re:'ultimately|in the end|what it means to be', tail:600 }
  for (const p of (bans.softPatterns || [])) {
    const n = Number(p.tail), seg = (Number.isFinite(n) && n > 0) ? text.slice(-n) : text
    if (p.re && new RegExp(`\\b(${p.re})\\b`, 'i').test(seg)) soft.push(p.label)
  }
  return { hardDQ: hard.length > 0, hard, soft }   // hard => disqualified before judging
}
```

A single soft flag is scrutiny, not death. Multiple soft flags, or a banned phrase in
the title/opening/closing, escalate toward a style DQ. Shipped behavior: the template
surfaces soft flags in the report (gate panel + per-entry info sheets) and does not
auto-escalate on its own — escalation past scrutiny is doctrine for a human reader or a
profile's own logic to apply.

## 3. The fatal-flaw / fabrication gate

The most important LLM layer. It asks "is this entry allowed to compete," not "is it
good." Run **3 independent screeners** (ideally different model families). Disqualify
only when a **strict majority agree on the same violation FAMILY** (2 of 3 at the maximal
tier), so two judges flagging *unrelated* violations cannot together kill a clean entry. Family,
not exact subtype: a real fabrication is usually several overlapping subtypes at once (an invented
first-person stack trace is fabricated-detail AND fake-authority AND false-experience), so requiring
the identical subtype would let three screeners who all correctly see fabrication — but name it
differently — wrongly PASS it. The overlapping fabrication subtypes share one family; genre, style,
and responsiveness stay separate. Each screener returns one canonical `category` (NONE when it does
not disqualify); the gate maps it to a family, tallies families, and disqualifies on a family
majority, labelling the entry with the most-cited subtype in that family. Each screener classifies
every concrete detail not inherited from the source as
SUPPORTED / REASONABLE_INFERENCE / UNSUPPORTED_MINOR / FABRICATED.

Hard-DQ categories (the ENGINE default is the general set — `FABRICATION` · `CONTRADICTS_SOURCE` ·
`GENRE_BREACH` · `HOUSE_STYLE_HARD_BAN` · `PLAGIARISTIC_OR_NON_RESPONSIVE`; the named fabrication
subtypes below — `FABRICATED_CONCRETE_DETAIL`, `FAKE_AUTHORITY_SIGNAL`, `FALSE_AUTHORIAL_EXPERIENCE` —
are the PROSE profile specializing `FABRICATION`, not engine defaults): FABRICATED_CONCRETE_DETAIL,
FAKE_AUTHORITY_SIGNAL (fake quotes /
logs / citations), FALSE_AUTHORIAL_EXPERIENCE (invented lived events/feelings),
CONTRADICTS_SOURCE, MISREPRESENTS_TARGET (attributes to a critiqued external work claims /
concessions / scope its real source does not support, or strawmans its scope — enforceable
only when a TARGET section is in the packet), GENRE_BREACH (essay turned into sermon /
LinkedIn post / marketing), HOUSE_STYLE_HARD_BAN, PLAGIARISTIC_OR_NON_RESPONSIVE.
Soft-fail categories (penalize, do not kill): PERFORMED_VULNERABILITY, SURFACE_CONCRETENESS,
SOUNDS_DEEP_FILLER, RHYTHMIC_TIC, OVERPOLISHED_LLM_VOICE, ANNOUNCED_THESIS,
SWELLING_UPLIFT_CLOSER.

```
SYSTEM: You are an adversarial eligibility judge. Not whether the essay is beautiful —
whether it is ALLOWED TO COMPETE. The tournament rule: a truthful slightly-less-vivid
essay beats a vivid essay that invents detail. Treat unsupported factual specificity as
a serious violation, not a literary virtue. Be most suspicious of detail that feels
"lived-in," "specific," or "messy" — that is where fabrication hides.

USER: SOURCE PACKET: <<< {PACKET} >>>  CANDIDATE: <<< {ENTRY} >>>  PREFLIGHT: {flags}
For every concrete detail not inherited from the source, classify it
SUPPORTED | REASONABLE_INFERENCE | UNSUPPORTED_MINOR | FABRICATED. If the packet has a
TARGET section, also check every claim the entry makes ABOUT that target against it;
attributing claims / concessions / scope the target's real source does not support is
MISREPRESENTS_TARGET. Then rule, naming the single best-fitting hard-DQ category.
Return JSON { verdict: "PASS"|"SOFT_FAIL"|"HARD_DQ", category, fabricated_spans:[{span, why}],
soft_fail_categories:[], one_sentence_ruling }. category is one canonical hard-DQ name or
"NONE". Default to PASS / "NONE" unless you can name the specific rule broken. Do not DQ for being weak.
```

This JSON is the *conceptual* screener contract. The shipped `references/workflow-template.js`
implements a leaner executable `FLAW_SCHEMA` — `{ disqualified, category, flaw, confidence, note }`
with `additionalProperties:false` — which collapses `verdict` into `disqualified` and omits the
`soft_fail_categories` / `fabricated_spans` arrays. The `category` enum there is derived from the
active `HARD_DQ_CATEGORIES`, so `MISREPRESENTS_TARGET` is offered only when a TARGET is in the packet.

Aggregate by family: disqualify an entry only when a strict majority of screeners name the
same violation FAMILY (so unrelated split votes cannot kill a clean entry, but overlapping
fabrication subtypes still combine into a DQ); record the winning subtype and a representative
ruling. Disqualified entries are removed from the field before the bracket; record them and why.

## 4. Pairwise, never scalar (for the contest)

Absolute 0-100 scoring is what produced "eight 88s." A juror asked "which of these two"
discriminates; one asked "score this" clusters. The contest is decided entirely by
head-to-head pairwise verdicts. Scalar axis scores exist only as diagnostics.

## 5. The lenses (diverse seats, not replicas)

Seat jurors with different jobs; each is ruthless on its one axis and blind to the
others. Diversity kills shared failure modes; replicas only reduce noise.

> **The set below is the PROSE profile's lens doctrine** — the fullest, sharpest prose seats
> (`fidelity` · `taste` · `anti-gaming` · `argument` · `cold-reader`). The shipped **engine default is
> domain-general** — `substance` · `fit` · `craft` · `integrity` (+ `coherence`) — a leaner set that
> applies to any artifact. A profile swaps in its own seats (`references/profiles/` describes the shape);
> these are prose's documented seats, not a bundled default profile file.
> Treat the names below as that profile's vocabulary, not the engine's.

- **fidelity** — protects the author. Suspicious of any entry that makes the author
  sound more wounded / heroic / certain / technical / profound than the source supports.
  Which entry improves the piece without stealing authorship or saying something untrue.
- **taste** — a discerning editor. Pressure behind the sentences, not decoration. A
  sentence is good only if removing it makes the essay less true, less clear, or less
  alive. Distrust vividness-alone, confessional-intensity-alone, nice-rhythm-alone.
- **anti-gaming** — the skeptic built for this failure. Which entry is less likely to be
  gaming the judges with surface signals. For each, name the most tempting surface signal
  (maybe-fabricated detail, emphasis-theater fragments, "lived-in" detail not in the
  ledger, profound-sounding abstraction that changes nothing) and decide if it is earned.
  Pick the entry that stays better after stripping fake vividness, vulnerability, profundity.
- **argument** — stops pretty prose beating better thought. Does the thinking actually
  move; does each paragraph change understanding; does the ending follow rather than
  inflate; would a one-sentence paraphrase collapse into cliche.
- **cold-reader** — an intelligent reader with no obligation to be impressed. Which would
  you rather finish, remember, and send to one thoughtful friend, with no reward for fake
  intimacy or LLM polish.
- **coherence** *(seated for assembled candidates — the section / recombination route)* —
  does the piece read as one continuous whole, or a stapled lineup of mismatched parts.
  Penalizes tonal breaks, a dropped throughline, and seams where one section's voice or
  stance clashes with the next. The section route judges slots in isolation, so this is the
  juror that catches the Frankenstein an all-best-parts assembly can become — a coherent
  piece can rightly beat a higher-sum-of-parts rival. (A team that plays together, not
  eleven soloists.)

### Domain profiles (the judge is general; the gate and lenses swap)

The pipeline (gates -> pairwise taste -> rating + trust) is domain-general. What you swap
per domain is the **gate** and the **lens set**. Essays are one profile, not the shape of
the tool.

> **The ENGINE default is domain-general** (see `workflow-template.js`): lenses `substance` ·
> `fit` · `craft` · `integrity` (+ `coherence` for assembled artifacts), and hard-DQ categories
> `FABRICATION` · `CONTRADICTS_SOURCE` · `GENRE_BREACH` · `HOUSE_STYLE_HARD_BAN` ·
> `PLAGIARISTIC_OR_NON_RESPONSIVE`. Everything below — and the prose lens/category names elsewhere
> in this doc — is the **prose profile doctrine**, shown as documentation rather than a bundled file. The
> engine ships no prose-specific lens or category; the user's profile / voice skill adds them.

- **Prose / voice** (essays, copy, posts): gate = the fabrication gate above (preflight +
  3-judge fact-ledger check). Lenses = the prose seats from §5 (`fidelity`, `taste`, `anti-gaming`,
  `argument`, `cold-reader`); the prose fabrication subtypes (`FALSE_AUTHORIAL_EXPERIENCE`,
  `FAKE_AUTHORITY_SIGNAL`) specialize `FABRICATION`.
  - *Critique / response sub-mode* (the field critiques or responds to a named external
    work): the packet adds a TARGET section built from that work's fetched source, and the
    gate adds MISREPRESENTS_TARGET. A dedicated target-fidelity lens (distinct from
    `fidelity`, which protects the author) is available but deferred — the gate disqualifier
    is the load-bearing enforcement.
- **Code / solutions**: gate = deterministic — does it compile, lint, and pass the test
  suite (run it; non-compiling or failing entries are disqualified, no LLM needed). Lenses
  = correctness, simplicity/readability, efficiency, API-fit. Field the current
  implementation as one of the N (INCLUDE_BASE) if you want it judged head to head.
- **Design / UI**: gate = hard constraints (fits the viewport, uses the design tokens, no
  contrast/overflow violations — checkable mechanically or by a vision pass). Lenses =
  clarity, aesthetic, usability, brand-fit. Field the live design as one of the N if wanted.
- **Names / taglines**: gate = collision/availability (not already taken, not a trademark,
  not an unfortunate homophone). Lenses = memorability, fit, distinctiveness, say-ability.
- **Prompts / configs / plans**: gate = validity (parses, satisfies the schema, meets hard
  requirements). Lenses = correctness, robustness, clarity, minimality.

The constants across every profile: a hard gate runs first and truth/validity is a gate
not a score; lenses are diverse and ruthless on one axis; the champion is provisional
until the rating confirms it.

## 6. Vote schedule by stage (prose doctrine — shipped default below the table)

| Stage             | Panel                                                  | Votes |
|-------------------|--------------------------------------------------------|-------|
| Seeding pre-pass  | pairwise comparisons, sampled (Swiss-like), then a rating | ~k·N |
| Group round-robin | 1 rotated juror per match (round-robin averages noise) | 1     |
| R32 / R16         | fidelity + taste + anti-gaming                         | 3     |
| Quarter-final     | + argument + cold-reader                               | 5     |
| Semi-final        | the 5 lenses, run mirrored (A/B swapped), +cross-model | 5-6   |
| Final             | the 5 lenses + cross-model, re-run on a split          | 5-7   |

This table is the maximal doctrine; the shipped template defaults to substance/fit/craft
through R16 (groups included) and +integrity from the QF (see `panelFor` in `workflow-template.js`).

For the **section / recombination route** (assembled candidates), a **coherence** juror is
seated in *every* panel above (+1 vote per match): an assembly is stapled from independently
judged slots, so the seam check has to run throughout, not just at the end. This makes the
early-round panels even (R32/R16 become 4 jurors); a tied panel is resolved by the existing
even-split tiebreak (seat one more juror, then fall back to the higher rating).

Any juror at any stage may raise a `fatal_concern`; if it does, route that entry back
through the fabrication gate before its result counts. Fabrication can hide until a close
read in the later rounds. (Doctrine, not shipped: the template's lens schema carries no
`fatal_concern` field — to implement, add it to LENS_SCHEMA and re-screen on sight. What
the shipped judge does carry everywhere is the integrity lens from the QF on.)

**How many votes actually buys confidence.** With per-juror accuracy p, odd-panel
majority accuracy is roughly: at p=0.65 — 1 vote=0.65, 3=0.72, 5=0.77, 7=0.80, 9=0.83,
13=0.87, 17=0.90; at p=0.75 — 3=0.84, 5=0.90, 7=0.93, 9=0.95. The lens panel is the floor;
for a high-stakes final, push the count up by seating two jurors per lens (best-of-7+) or
replicating the integrity and taste seats. Caveat: those numbers assume INDEPENDENT
jurors. Same model + same prompt + same order are correlated and the real gain is much
smaller, so vary the model family, prompt wording, and A/B order across the panel
(effective n_eff = n / (1 + (n-1)·rho), rho ~0.15 same-model, ~0.05 mixed-model).

**The bracket champion is provisional.** Single elimination compounds judging noise (a
better entry with per-match win-prob q survives only q^4 for 32 / q^5 for 48): the
knockout crowns a *compelling* champion, not reliably the *best* one. Never ship the
bracket winner raw — fit the global rating over every head-to-head and confirm it
(section 13). If the champion is not the rating leader, or the leader was knocked out
early by a narrow margin, run the top-4 round-robin before crowning. For pure best-finding
on a budget, Swiss + Bradley-Terry + a top-4 round-robin beats the bracket; the World Cup
format earns its keep on spectacle and the report graph.

## 7. Aggregation

- **Per match**: weighted majority of lens votes (weight by juror confidence, and by
  judge reliability if calibrated). Even split → seat one more juror; never coin-flip.
- **MVP global rating**: Elo over every decided head-to-head, several passes in varied
  order, averaged (RNG is unavailable in workflow scripts — vary order by index).
- **Maximal global rating**: fit a Bradley-Terry model over all pairwise observations
  (P(i beats k) = sigmoid(theta_i - theta_k); fit by gradient ascent with L2; center for
  identifiability), then **bootstrap** it (resample observations, refit, count how often
  each entry tops the table) to get a win-probability and confidence interval. The winner
  should top ≥60-70% of bootstrap samples or be settled by a runoff.

Elo update (MVP), JS:

```js
function elo(entries, decided, K = 24) {
  const R = new Map(entries.map(e => [e.id, 1500]))
  for (let p = 0; p < 3; p++) for (const m of decided) {
    const rw = R.get(m.winnerId), rl = R.get(m.loserId), ew = 1 / (1 + 10 ** ((rl - rw) / 400))
    R.set(m.winnerId, rw + K * (1 - ew)); R.set(m.loserId, rl - K * (1 - ew))
  }
  return [...R].sort((a, b) => b[1] - a[1])
}
```

## 8. Calibration and judge weighting (maximal tier)

Before judging real entries, calibrate jurors on **booby-trapped anchors** with known
correct outcomes: the true Original (O — the BASE / `given` original artifact), a
Fabricated-vivid version (F), an LLM-uplift version (L), a Performed-vulnerability version
(V), a Bland-but-faithful version (B). Encode the answer key: O beats F, O beats L, O beats V, B beats F. Score
each juror's agreement and **heavily downweight any juror that prefers fabricated
vividness over the faithful original even once.** This trains the panel against the exact
failure mode. Skip in MVP; use it when the decision matters.

## 9. Seeding without compression

Primary: a **calibrated pairwise pre-pass** (each entry compared to ~4-6 others spanning
the field, Swiss-like two rounds), fit Elo/BT for a rating with real spread, seed pots
from that. No eight-way ties.

Fallback (if you must score a batch absolutely): **anchored bins 0-6** with distribution
constraints — "no more than 25% in the top two bins; every entry gets a unique rank
within its bin." Bins plus forced within-bin ranking prevent clustering. Pairwise is
preferred; bins are only for cheap seeding.

## 10. Bias controls

- **Position**: randomize/alternate which entry is shown as A (vary by index parity).
  For high-stakes pairs, run **mirrored** (A=X,B=Y and A=Y,B=X) and measure each juror's
  A-pick-rate; downweight jurors far from 0.5.
- **Length / verbosity**: length is a **free dimension**, not a target — the engine pins no
  range, so a short entry and a long entry compete on equal footing (make length an explicit
  DESIGN axis if you want to *read* which length wins; see design-pass.md). The one guardrail
  that keeps free length safe is anti-padding: instruct "do not reward the longer entry for
  more texture; a longer entry must justify its length with real thought, not atmosphere," and
  ask each juror to name one cuttable sentence — lots of removable material is a weakness. So
  length as such is neither rewarded nor penalized; only whether every part earns its place.
- **Sycophancy**: blind everything — jurors never see which model wrote an entry, its
  seed, prior jurors' picks, or that an entry is the original (fielded, it is blind like
  every other entry — no exception). Ask "which should the author publish," never "which
  better satisfies the user."
- **Self-consistency**: track per-juror calibration accuracy, position bias, tie-overuse,
  length bias; downweight unstable jurors. (Maximal only.)

## 11. Encode taste as earnedness, not a checklist

A checklist ("use concrete detail, use vulnerability, vary rhythm, end with resonance")
is exactly how you get fake stack traces and uplift closers. Encode taste as conditions:

- Concrete detail counts only if source-supported, necessary, and not decorative.
- Emotional honesty counts only if it preserves the author's actual degree of disclosure.
- Rhythm counts only if it clarifies thought; rhythm that performs authenticity is a weakness.
- An ending counts only if it lands the essay's real motion without inflating to wisdom.
- Voice fidelity is depth (same pressure, certainty, tolerance for unresolvedness), not
  surface mimicry (reusing punctuation, copying paragraph length, bolting on fragments).

## 12. Fielding the original (the original as one of the N)

There is no separate "beat the incumbent" stage. When you want the original judged, **field it
as a contestant** — `INCLUDE_BASE = true` in a generate run (it takes one cell of the field), or
just include it among your `given` items. Then it is screened, seeded, rated, and plays the
bracket like any entry, and **"keep the original" is simply the result that the original won its
bracket (or out-rates the champion)** — the same information the old reference challenge produced,
with none of the special code and none of the anchor bias. (The retired design pasted the
original's full text into every lens prompt, so a juror could recognize which unlabeled entry was
the original — a systemic bias, and the single blinding exception §10 used to admit. Fielded, the
original is blind like everything else.)

- **Gate canary (free).** A fielded original goes through the fabrication gate with no exemption.
  Since the fact ledger IS defined as the original's truth, an original that gets DQ'd means the
  ledger is misconfigured or the gate is misfiring — which makes every gate verdict this run (the
  champion's clean pass included) suspect. It is not a normal result. For `INCLUDE_BASE` the engine
  knows which entry is the base and **fails closed automatically** — the trust verdict and
  recommendation become DO NOT TRUST / DO NOT ADOPT and the champion gets no confetti. For a `given`
  original the engine can't tell which item it is, so the DQ shows in the report's gate strip for you
  to read.
- **Adoption rule (reporting doctrine, not mechanism).** Conservatism ("don't replace unless
  clearly better") lives in how you READ the result, not in the criteria (which reach every juror
  and would handicap all entries equally) and not in engine mechanism: recommend adoption only
  when the champion clearly out-rates the fielded original (a rating gap, or a won direct
  meeting); otherwise keep the original. The shipped trust machinery already fires "bracket
  variance → top-4 runoff" when the original out-rates the champion — a guaranteed head-to-head
  exactly when it matters.
- **Precious-original exhibition (opt-in, zero engine code).** The one thing fielding gives up is
  the *guaranteed* champion-vs-original head-to-head (fielded, they meet only by draw luck). When
  the original is precious enough to demand a certain, supermajority head-to-head, run it as a
  **post-run exhibition from the main loop** — the exact pattern used for cross-model finals
  jurors (§15): the Workflow returns the champion and the original text; the main conversational
  loop fires one full-panel champion-vs-original match and folds the verdict into the
  recommendation. One paragraph of doctrine, no template change. A tournament confirming the field
  never improved on the real thing is a real, useful result, not a failure to force a winner.

## 13. The trust report

After the final, report:

- **Champion vs rating leader.** Bracket champion == Bradley-Terry / Elo leader → robust.
  If they differ, name the divergence; the champion may be a lucky draw.
- **Bootstrap confidence** (maximal): the win-probability of the champion.
- **Path strength**: average rating of who the champion beat (coasted a weak quadrant?).
- **Final margin** and whether it needed a re-run.
- **The fielded original** (if any): where it seeded and rated, and whether the champion
  out-rated it or met and beat it — this is what "keep the original" reads off of now.
- **Offer a runoff** (top-4 round-robin at full panel) whenever champion ≠ rating leader,
  the final was a coin-flip, or the bootstrap win-prob is under ~60%. Never declare a shaky
  winner clean.

## 14. MVP vs maximal

These are DOCTRINE tiers — bounds on how lean or heavy a run can go, with prose-profile
lens names as the example. The shipped template default sits between them (3-lens panels
through R16, 4 from the QF, 3 screeners; see SKILL.md's Cost section for the counted
ballparks and the two knobs that reach MVP).

- **MVP**: preflight + a single fatal-flaw screener + 1-juror groups + best-of-3 knockout
  (fidelity/taste/anti-gaming) + Elo. Fast, cheap, still has the fabrication gate; field the
  original as one of the N if you want it judged.
- **Maximal**: full source packet + 3-judge fabrication gate + calibrated, reweighted
  jurors + 5-lens panels scaling to mirrored best-of-7 + cross-model jurors in SF/final +
  Bradley-Terry with bootstrap + full trust report with offered runoff + the fielded original
  (and, for a precious original, the §12 post-run exhibition). Use when the decision matters
  and the user opted into the cost.

## 15. Cross-model jurors

Seat a frontier model (GPT/Gemini/Grok) on the SF and final panels — a single model
family has consistent blind spots and the late rounds are where that costs the title.
Any MCP tool that can query another frontier model works (agentify is one): fire the
juror prompt, poll for the result, and fold the vote in. Have none? Skip the seat — the
panel seats an in-harness lens juror instead. Always keep the panel an odd size so it
never deadlocks, including when a cross-model seat times out. Reserve cross-model jurors
for SF and final only — they add real wall-clock. The shipped template runs same-family
panels; simplest wiring: the Workflow returns the SF/final pairings, the main
conversational loop fires the guest votes and folds them in.
