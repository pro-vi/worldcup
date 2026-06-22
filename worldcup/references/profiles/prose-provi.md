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
This prose profile **adds** the prose-specific bits back. Apply it as a COMPLETE EvaluatorConfig override —
`validateEvaluatorConfig` enforces three consistency rules, so you must **spread** the general sets and
**rebuild the flaw schema**, not just list the additions (a partial override throws on assignment):

```js
const proseCategories = [...HARD_DQ_CATEGORIES, 'FALSE_AUTHORIAL_EXPERIENCE', 'FAKE_AUTHORITY_SIGNAL']
EVALUATOR = { ...EVALUATOR,
  lenses:   { ...LENSES,                      // SPREAD the general lenses — don't replace them, or the
              voice: 'Does this sound like the author actually wrote it, or like a machine performing the author. Flag voice tells, performed vulnerability, imitation over authorship.',
              taste: 'You are a discerning editor who has read ten thousand of these. Fresh or formulaic. Earned or performed. Would you publish it.' },
  panelFor: () => ['voice', 'substance', 'taste', 'integrity'],   // every seated lens must exist in lenses
  hardDqCategories: proseCategories,                              // the prose fabrication SUBTYPES
  dqFamily: { ...DQ_FAMILY,                                       // SPREAD — every category needs a family
              FALSE_AUTHORIAL_EXPERIENCE: 'fabrication', FAKE_AUTHORITY_SIGNAL: 'fabrication' },
  schemas:  { ...EVALUATOR.schemas, flaw: makeFlawSchema(proseCategories) },  // REBUILD — enum must equal ['NONE', ...categories]
}
```
`integrity` (general, kept) carries the honest-vs-manufactured-specificity judgment; the prose subtypes
let three screeners who all see a fabrication name it more precisely while still landing in one family.
(The three rules — every seated lens defined, every category family-mapped, flaw enum === `['NONE', ...categories]`
— are exactly what `validateEvaluatorConfig` checks; that's why the spreads + `makeFlawSchema` are required.)
