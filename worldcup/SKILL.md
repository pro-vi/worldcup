---
name: worldcup
description: >
  A general best-of-N selection engine wearing a FIFA World Cup. Any time a task is
  "mass-produce many candidates and keep the single best" (or the user hands over a
  field of them), stage 32 teams (8 groups of 4) or 48 teams (12 groups, 2026 format)
  through a head-to-head round-robin group stage into a single-elimination knockout,
  judged by taste-calibrated LLM panels, and emit a World Cup-flavored HTML report of
  the final bracket graph. The "teams" can be anything comparable: essay or copy
  variants, taglines, names, API or UI designs, prompts, configs, plans, generated
  code solutions. Essays/prose are one supported profile, not the required shape. This
  skill should be used when the user wants to bracket a field and crown a winner with
  real rigor, or whenever a task reduces to "make N variants and pick the best."
  Triggers: "/worldcup", "run a worldcup", "tournament these", "bracket these 32",
  "best of N", "mass-produce and pick the best", "stage 48 variants and crown a
  winner", "group stage then knockout". Requires the ultracode Workflow tool. The
  judge is the point: domain profiles plug in a fatal-flaw/fabrication gate, a
  reference-anchor incumbent, calibrated pairwise seeding, diverse-lens panels,
  Bradley-Terry confirmation, and optional cross-model (agentify) jurors for the finals.
---

# World Cup

A best-of-N selection engine wearing a World Cup. Any time a task is "make many and
keep the best" — 32 flavors of an essay, 48 candidate taglines, a dozen API designs,
N generated solutions to one problem — you can bracket the field: a group-stage
round-robin filters it, a single-elimination knockout decides it, and the whole thing
runs as one ultracode Workflow so the bracket logic is deterministic and the only
non-determinism lives where it belongs, inside the judges. Every run ends with a World
Cup-flavored HTML report of the final state graph.

Essays are one supported profile, not the shape of the tool. The structure (gates ->
pairwise taste -> reference challenge -> rating + trust) is domain-general; what swaps
per domain is the gate and the lenses (see "references/judging.md", Domain profiles).

This skill exists because a naive version fails in a specific way. A previous run let an
essay win by fabricating concrete detail (invented line numbers, a fake stack trace) that
read as "authentic" to a single tasteless judge. The fix is not a bigger model. It is a
judging architecture with taste: a truth gate, adversarial lenses, an incumbent to beat,
escalating panels, and a Bradley-Terry reality check. Read "references/judging.md" before
you build anything. The judge is 80% of this skill.

## When you are invoked, settle these first

Do not start building until these are pinned. Ask only what you cannot infer from
context; pick sane defaults for the rest and state them.

1. **Field size**: 32 (classic, 8 groups of 4) or 48 (2026, 12 groups of 4 plus 8
   best third-placed). Default 32 unless the user has a natural 48-sized field.
2. **Contestants source**:
   - *Generate (mass production)*: the user wants N variants of one thing (32 flavors
     of an essay, 48 taglines, a dozen designs). You generate the field from a base via a
     DESIGN spec (see "references/design-pass.md"). Three generation designs:
       - *flat* — a hand-authored list of N angle seeds (the classic mode).
       - *axes (forced)* — you give orthogonal axes (e.g. lead x spine x closer x length x
         register); the cross-product is reconciled to N. Candidates become points in a
         coordinate system, and the report gains a coordinate view + axis-effects analysis.
       - *axes (dynamic)* — an axis-finder agent proposes the axes from the base + criteria
         (one extra call), then the field is fit to N. Best when you do not know the axes yet.
     Prefer an axes design when you want diversity you can read (which knob wins, the
     predicted optimum); flat for a quick curated set. This is the common case: any
     "make a lot and pick the best."
   - *Bring-your-own*: the user hands you the items. Skip generation; the field is given.
3. **The criteria and domain profile**: what makes one entry better, and which judge
   profile runs. The judging structure is universal; the gate and lenses swap per domain
   (see "references/judging.md", Domain profiles). Prose/voice (Provi "/provi-voice" spec;
   fabrication gate; fidelity/taste/anti-gaming/argument/cold-reader lenses) is one
   profile. Code (compiles / passes-tests gate; correctness/simplicity/clarity lenses),
   design and copy (constraint gate; clarity/aesthetic/brand-fit lenses), names and
   taglines (collision/availability checks; memorability/fit/distinctiveness lenses) are
   others. Get the rubric from the user in their words. Vague criteria produce a tasteless
   judge, which is the whole failure mode.
4. **Source packet (incumbent + fact ledger)**: the single most important input for
   any truth-bearing field. It bundles (a) the reference original the field must beat
   (the author's real essay, the live tagline), and (b) a fact ledger of what is
   actually true plus an explicit NOT-ALLOWED list (invented line numbers, names,
   stack traces, quotes, scenes). Judges cannot tell honest specificity from
   fabricated specificity without it. The incumbent is also the bar: an entry must
   beat it on merit, not by sounding flashier. See "references/judging.md" section 1
   for the template. Skip only when there is no truth to protect and no incumbent.
   When the field critiques, responds to, or makes factual claims about a named external
   work, add a third element: (c) a TARGET built from that work's ACTUAL fetched source
   (WebFetch the original; WebSearch/exa/grep/context7 to locate and corroborate by domain),
   not the draft's summary of it. Put it in the template's dedicated `TARGET` field (which is
   what drives the MISREPRESENTS_TARGET gate), never inline in the criteria text. The draft's
   characterization of the target is a claim to verify. This is target-truth, the companion to
   the author-truth ledger; without it a critique can pass the fabrication gate and still
   misrepresent the work it answers.
5. **Hard disqualifiers**: things that auto-kill an entry regardless of appeal. For
   Provi prose: em dashes, banned LLM vocab, announced thesis, and the big one,
   fabricated specifics presented as lived fact. The cheap ones (em dashes, banned
   vocab) run as a deterministic regex preflight before any agent; the rest go to a
   3-judge fabrication gate.
6. **Cross-model jurors**: whether to bring frontier models in via agentify as
   panelists for the semis and final (see "references/judging.md", Cross-model
   panel). Default: offer it for the final four when the decision is close or the
   stakes are high. It costs wall-clock (agentify is slower) so it is opt-in per run.

## Procedure

1. **Read the references.** "references/judging.md" (the judge), "references/brackets.md"
   (exact group draw and knockout crossings for 32 and 48), and for a factorial run
   "references/design-pass.md" (the DESIGN spec + combinatorics) and
   "references/coordinates.md" (coords, effects, the coordinate view). The bracket math
   is load-bearing; do not reconstruct it from memory.
2. **Assemble the criteria block.** Write the taste spec, the disqualifiers, and the
   incumbent into a single text block you will embed in every judge prompt. For
   Provi prose, invoke "/provi-voice" and distill its hard rules into this block. For a
   critique/response run, fetch the target first and put it in the template's dedicated
   `TARGET` field — NOT in the criteria text. The template threads TARGET into the criteria
   channel for you AND derives the MISREPRESENTS_TARGET gate enforcement from that field;
   pasting target material into the criteria block instead reaches the prompts but leaves the
   gate unable to return MISREPRESENTS_TARGET, silently disabling the enforcement.
3. **Author the Workflow.** Read "references/workflow-template.js", copy it, and fill
   in: the DESIGN (flat flavors, or axes for a factorial field, see design-pass.md), the
   criteria block + fact ledger, the field size, the domain profile (lenses + gate), and
   the cross-model toggle. The template already encodes the design pass, snake seeding, the
   group round-robin, the knockout crossings, the multi-lens judge, the fabrication gate,
   the reference challenge, the effects analysis, the trust report, and the HTML report
   (mirror bracket + coordinate view). You are filling holes, not writing orchestration.
4. **Run it** with the Workflow tool. It runs in the background and notifies on
   completion. Watchable via "/workflows".
5. **Write and open the report.** The Workflow returns "reportHtml": a self-contained
   World Cup-flavored HTML of the final state graph (bracket tree, group tables, champion
   path, global rating, trust verdict, disqualifications). Write it to
   "worldcup-report.html" in the working directory and open it. The structured "graph"
   field is returned alongside if you want to re-render. This report is a required
   deliverable of every run, not an optional extra.
6. **Report in chat** (see Output below). Read the returned result fully before
   summarizing — the champion, the final's deciding reason, the champion's path, the
   global rating, the reference-challenge result, and the trust verdict.

## The judging doctrine (summary)

Full version in "references/judging.md". The non-negotiables:

- **Pairwise, not absolute, for seeding.** Absolute 0-100 scores compress (last time
  8 of 32 tied at 88). Seed via a calibrated pairwise pre-pass and a Bradley-Terry
  rating, so the pots actually mean something.
- **A match is a panel, not one judge.** Group stage: 1 juror (round-robin averages
  the noise). Knockout: best-of-3. Semis and final: best-of-5 with distinct lenses,
  optionally a cross-model juror. Vote counts scale with stakes.
- **Diverse lenses, not replicas.** Panelists wear different hats — voice, substance,
  reader-taste, integrity — and each is told to be ruthless on its one axis. A vote
  is the lens's verdict, not a generic "which is nicer."
- **Truth is a gate, not a score.** A regex preflight kills the cheap violations (em
  dashes, banned vocab) before any agent runs. Then a 3-judge fabrication gate, armed
  with the fact ledger, disqualifies entries that invent specifics — DQ needs 2 of 3
  judges agreeing on the same hard-DQ category, so one hallucinating judge cannot wrongly
  kill a clean entry. A vivid fabricated entry forfeits; it does not lose "some points."
  This is the rule that flips the previous bad result.
- **The reference challenge.** Surviving the bracket is not enough: the champion must
  beat the author's true original head-to-head by a supermajority. If it cannot, the
  output is "keep the original" — confirming the field never improved on the real thing
  is a real result, not a failure to force a winner.
- **Position and length bias controls.** Alternate A/B order across a panel; instruct
  jurors not to reward length or padding. Re-run split panels rather than coin-flip.
- **A trust report at the end.** If the bracket champion is not also the
  Bradley-Terry rating leader, flag bracket variance and offer a top-4 round-robin
  runoff. A single-elimination winner can be a lucky draw; say so when it is.

## Output

Always produce, in this order:

- **The HTML report** ("worldcup-report.html"): the World Cup-flavored final state graph,
  written to disk and opened. This is the headline deliverable. Then summarize in chat:
- **Champion**: the full winning artifact, its flavor/label, seed rank, and how it
  won the final (the deciding lens verdicts).
- **The bracket story**: group standings, who advanced, the upsets (a top seed dying
  in groups is the headline), the elite eight, the final four.
- **Champion's path**: every opponent it beat and why, round by round.
- **Seed table / global rating**: the Bradley-Terry ranking over all matches.
- **Trust verdict**: clear winner, or lucky bracket. If lucky, name the entry that
  the global rating says might be stronger, and offer the runoff.
- For *generate* runs, end with the natural next step: adopt the champion, merge its
  best move into the incumbent, or keep the incumbent (a tournament can confirm the
  original was already best — that is a real and useful outcome).

## Cost

Two cost tiers (see "references/judging.md" section 14):

- **MVP** for a 32-team field: 32 generations + a single-screener fabrication gate (32)
  + a pairwise seeding pre-pass (~64) + 48 single-juror group matches + ~15 knockout
  matches at best-of-3 + a reference challenge. Ballpark 230-280 agent calls.
- **Maximal** for a 32-team field: the 3-judge fabrication gate (96) + calibrated jurors
  + 5-lens panels scaling to mirrored best-of-7 in the late rounds + cross-model jurors.
  Ballpark 400-550 agent calls, plus agentify wall-clock for the SF/final cross-model
  seats.

A 48-team run is roughly 1.6x (72 group matches, 31 knockout matches). This is an
ultracode-scale operation: only run it when the user has opted into multi-agent
orchestration, and state the rough agent count and tier before launching so the cost is
not a surprise. Default to MVP unless the user asks for the full rigor.

## References

- "references/judging.md" — the judge: lenses, the fabrication veto, panels,
  calibration, bias controls, aggregation math, cross-model jurors. Read first.
- "references/brackets.md" — exact formats: group draw from pots, round-robin
  scheduling, advancement (including 48-team best-third ranking), and the precise
  knockout crossings for both 32 and 48. Code-ready.
- "references/design-pass.md" — how candidates are created: the DESIGN spec (flat |
  axes), forced vs dynamic axis-finding, the deterministic factorize/reconcile
  combinatorics, and coordinate-stamped prompt derivation.
- "references/coordinates.md" — the coordinate model: per-candidate coords, the post-hoc
  effects analysis (main effects, interactions, predicted optimum, estimability), the
  optional predicted-optimum playoff, and the coordinate view in the report.
- "references/workflow-template.js" — the ultracode Workflow you copy and fill in.
  Encodes everything above plus the HTML report generator (returns "reportHtml"); you
  supply the DESIGN, the criteria block, and the domain profile. For a factorial run,
  fill DESIGN.kind='axes' with your axes (or mode:'dynamic'); flat is the classic mode.
