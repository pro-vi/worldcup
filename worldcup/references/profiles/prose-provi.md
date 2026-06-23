# Example profile — Provi personal-essay prose

> **This is ONE example profile, not an engine default.** It encodes one author's (Provi's) house
> style. Its hard bans (em dash, AI-tell vocab) are *that author's* preferences — a different writer's
> profile differs. Copy and rewrite this for your own voice, or hand the skill your own voice skill
> and let it distill the rules. The engine ships taste-neutral; this is what plugging a voice in looks like.

## Taste spec (the positive rubric — deep traits, not a checklist)
- **Voice:** follow-the-thought; affirmative, not question-led; cross-domain without signposting;
  a deflating (not swelling) close; varied sentence length; non-native texture is fine.
- **Taste is earnedness:** concrete detail counts only if source-supported and necessary; rhythm only
  if it clarifies thought; an ending only if it lands without inflating.
- **Non-negotiable:** the best essay is the best *truthful* essay in the author's voice. A less vivid
  true essay beats a more vivid false one.

## Gate (domain-general, always on)
Fabricated specifics presented as lived fact — checked against the fact ledger (the author's real
life). For a personal essay that is a lie and an automatic disqualification.

## House-style hard bans (this author's own — punctuation/vocab, run as the deterministic preflight)
```js
const BANS = {
  emDash: true,   // this author auto-DQs the em dash. NOTE: a hard kill on punctuation is a strong
                  // choice — most writers would make this a lens penalty, not a gate kill.
  vocab: ['delve', 'harness', 'unlock', 'realm', 'seamless', 'ultimately', 'furthermore', 'profound', 'tapestry', 'testament'],
  softPatterns: [ // phrase flags this author wants — the engine defaults these to [] (taste-neutral)
    { label: 'announced thesis', re: 'this essay|in this piece|what i want to explore' },
    { label: 'uplift closer',    re: 'ultimately|in the end|at the end of the day|what it means to be', tail: 600 },
  ],
}
```

> **Caveat on the vocab list (read before copying):** this is an *AI-tell-avoidance* heuristic, not a
> quality rule — "ultimately"/"furthermore" are normal English, flagged only because they're common in
> LLM output. Since the candidates *are* LLM output, this optimizes for "doesn't read as AI," which can
> reward stealthier-but-worse writing. It's a deliberate, owned choice for this author; prefer banning
> the *behavior* ("manufactured, performed phrasing") in the integrity lens over a literal word list.

## Profile override (EvaluatorConfig)
The engine ships **domain-general** lenses (`substance` · `fit` · `craft` · `integrity`) and categories
(`FABRICATION`, `CONTRADICTS_SOURCE`, `GENRE_BREACH`, `HOUSE_STYLE_HARD_BAN`, `PLAGIARISTIC_OR_NON_RESPONSIVE`).
This prose profile **replaces** the general lens seats with the **prose lens doctrine from `judging.md` §5**
(`fidelity` · `taste` · `anti-gaming` · `argument` · `cold-reader` — see §5 for the full descriptions) and
adds the prose fabrication subtypes. Apply it as a COMPLETE EvaluatorConfig override — `validateEvaluatorConfig`
enforces three consistency rules (every seated lens defined, every category family-mapped, flaw enum ===
`['NONE', ...categories]`), so you must set a `tiebreakLens` that exists, map every category, and **rebuild
the flaw schema**. (Assignment itself does NOT validate — the template re-runs `validateEvaluatorConfig(EVALUATOR)`
at the start of the run, so a partial override fails closed *there*; to catch it sooner, call it yourself
right after the override. A partial override that reached the gate unchecked would fail OPEN — a category with
no matching flaw-schema enum can never be emitted, so that fabrication subtype silently never disqualifies.)

```js
const proseCategories = [...HARD_DQ_CATEGORIES, 'FALSE_AUTHORIAL_EXPERIENCE', 'FAKE_AUTHORITY_SIGNAL']
EVALUATOR = { ...EVALUATOR,
  lenses: {   // the prose seats (judging.md §5) — full descriptions there; condensed mandates here
    fidelity:      'Protect the author: suspicious of any entry that makes them sound more wounded / certain / profound than the source supports. Improve the piece without stealing authorship or saying something untrue.',
    taste:         'A discerning editor. Pressure behind the sentences, not decoration. A sentence earns its place only if cutting it makes the piece less true, clear, or alive.',
    'anti-gaming': 'The skeptic. Name the most tempting surface signal (maybe-fabricated detail, emphasis-theater, lived-in detail not in the ledger) and decide if it is earned; pick the entry that survives stripping fake vividness/vulnerability.',
    argument:      'Stops pretty prose beating better thought. Does the thinking move; does each paragraph change understanding; does the ending follow rather than inflate?',
    'cold-reader': 'An intelligent reader with no obligation to be impressed. Which would you finish, remember, and send to one thoughtful friend — no reward for fake intimacy or LLM polish.',
    coherence:     'Does the piece read as one continuous whole, or a stapled lineup of mismatched parts? Penalize tonal breaks and seams. (Seated only for the section / recombination route.)',
  },
  // mirror the engine: append the coherence seat for ASSEMBLED (kind:'sections') candidates, or a
  // section-composed prose run loses the Frankenstein-seam check with no warning.
  panelFor: stakes => { const base = ({ R32: ['fidelity', 'taste', 'anti-gaming'], R16: ['fidelity', 'taste', 'anti-gaming'],
      QF: ['fidelity', 'taste', 'anti-gaming', 'argument', 'cold-reader'],
      SF: ['fidelity', 'taste', 'anti-gaming', 'argument', 'cold-reader'],
      FINAL: ['fidelity', 'taste', 'anti-gaming', 'argument', 'cold-reader'] }[stakes] || ['fidelity', 'taste', 'anti-gaming'])
    return COHERENCE_ON ? [...base, 'coherence'] : base },
  tiebreakLens: 'anti-gaming',                                     // must be one of the seated prose lenses
  hardDqCategories: proseCategories,                              // the prose fabrication SUBTYPES
  dqFamily: { ...DQ_FAMILY,                                       // SPREAD — every category needs a family
              FALSE_AUTHORIAL_EXPERIENCE: 'fabrication', FAKE_AUTHORITY_SIGNAL: 'fabrication' },
  schemas:  { ...EVALUATOR.schemas, flaw: makeFlawSchema(proseCategories) },  // REBUILD — enum must equal ['NONE', ...categories]
}
```
`anti-gaming`/`fidelity` carry the honest-vs-manufactured-specificity judgment for prose; the fabrication
subtypes let three screeners who all see a fabrication name it more precisely while still landing in one family.
