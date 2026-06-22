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
}
```
- Plus, stated in the criteria prose: an **announced thesis** and a **swelling uplift closer**.

> **Caveat on the vocab list (read before copying):** this is an *AI-tell-avoidance* heuristic, not a
> quality rule — "ultimately"/"furthermore" are normal English, flagged only because they're common in
> LLM output. Since the candidates *are* LLM output, this optimizes for "doesn't read as AI," which can
> reward stealthier-but-worse writing. It's a deliberate, owned choice for this author; prefer banning
> the *behavior* ("manufactured, performed phrasing") in the integrity lens over a literal word list.

## Lenses
voice · substance · taste · integrity (the engine default lens set; integrity carries the
honest-vs-manufactured-specificity judgment).
