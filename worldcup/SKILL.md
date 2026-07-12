---
name: worldcup
description: >
  A general best-of-N selection engine wearing a World Cup-style tournament. Any time a task is
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
  fact-ledger truth anchor (the original competes as one of the N when you want it
  judged), calibrated pairwise seeding, diverse-lens panels, Elo rating confirmation,
  and optional cross-model (agentify) jurors for the finals.
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
pairwise taste -> rating + trust) is domain-general; what swaps per domain is the gate and
the lenses (see "references/judging.md", Domain profiles).

**What "any artifact" actually requires — settle this before promising a domain.** An
entry must be (a) text-representable, because it travels inside judge prompts, and
(b) judgeable by reading: a panel must be able to rank two entries from their text plus
the criteria block. Taglines, names, plans, prompts, configs, API/UI designs-as-text,
and code read as text all qualify; images, live UIs, and binaries do not. For
executable artifacts, the strongest gate is execution — and the sandboxed Workflow
cannot execute anything — so run compile/test gates OUTSIDE the tournament (pre-gate
the candidates, then enter the survivors via bring-your-own `given` mode); the
in-tournament fabrication gate still catches invented claims ABOUT the code (fake
benchmarks, phantom test results). Honest scope note: prose is where this skill has
been used in anger; code and other shapes are exercised by the repo's harness and its
committed code sample (32 debounce implementations), but have seen less real-world use.

This skill exists because a naive version fails in a specific way. A previous run let an
essay win by fabricating concrete detail (invented line numbers, a fake stack trace) that
read as "authentic" to a single tasteless judge. The fix is not a bigger model. It is a
judging architecture with taste: a truth gate, adversarial lenses, the original fielded as
one of the N, escalating panels, and an Elo rating reality check (Bradley-Terry is the maximal upgrade —
see references/judging.md). Read "references/judging.md" before
you build anything. The judge is 80% of this skill.

## When you are invoked, settle these first

Do not start building until these are pinned. Ask only what you cannot infer from
context; pick sane defaults for the rest and state them.

1. **Field size**: 32 (classic, 8 groups of 4) or 48 (2026, 12 groups of 4 plus 8
   best third-placed). Default 32 unless the user has a natural 48-sized field.
2. **Contestants source**:
   - *Generate (mass production)*: the user wants N variants of one thing (32 flavors
     of an essay, 48 taglines, a dozen designs). You generate the field from a base via a
     DESIGN spec (see "references/design-pass.md"). Four generation designs:
       - *flat* — a hand-authored list of N angle seeds (the classic mode).
       - *axes (forced)* — you give orthogonal axes (e.g. lead x spine x closer x length x
         register); the cross-product is reconciled to N. Candidates become points in a
         coordinate system, and the report gains a coordinate view + axis-effects analysis.
         **Length is a first-class free axis** (the engine pins no length range) — declare it
         when you want the report to show which length won (see design-pass.md).
       - *axes (dynamic)* — an axis-finder agent proposes the axes from the base + criteria
         (one extra call), then the field is fit to N. Best when you do not know the axes yet.
       - *sections (recombination)* — the artifact is S declared slots; each slot fields its
         own candidates, judged in isolation (for fit to the whole piece), survivors assemble
         into lineups, and a coherence juror is seated in every panel (see design-pass.md +
         coordinates.md's lineup view).
     Prefer an axes design when you want diversity you can read (which knob wins, the
     predicted optimum); flat for a quick curated set. This is the common case: any
     "make a lot and pick the best."
   - *Bring-your-own*: the user hands you the items. Skip generation; the field is given.
3. **The criteria and domain profile**: what makes one entry better, and which judge
   profile runs. The judging structure is universal; the gate and lenses swap per domain
   (see "references/judging.md", Domain profiles). Prose/voice (the user's own voice skill or
   spec supplies the taste; fabrication gate; fidelity/taste/anti-gaming/argument/cold-reader
   lenses) is one profile. Code (compiles / passes-tests gate; correctness/simplicity/clarity
   lenses), design and copy (constraint gate; clarity/aesthetic/brand-fit lenses), names and
   taglines (collision/availability checks; memorability/fit/distinctiveness lenses) are
   others. **The engine ships taste-neutral** — get the rubric from the user in their words
   (or from a voice skill they hand in); see "references/profiles/" for the profile shape. Vague
   criteria produce a tasteless judge, which is the whole failure mode.
   **If the artifact lives in a container, write the container's intent as checkable
   properties, not a label.** Judges are blinded to everything but the criteria block, so a
   fit juror can only enforce intent that is written down: what surrounds the artifact, the
   job it does for its reader, and what it must NOT duplicate (an above-the-fold README pitch
   hands off to the sections below it; it does not absorb them). Naming the container
   ("the opening pitch block") is not enough — a freed dimension optimizes into whatever
   intent was left unstated. Observed in a real run: with the length pin removed and the
   container merely named, a ~450-word mini-README honestly out-earned the field in an
   "opening pitch block" contest, duplicating the very sections it was meant to hand off to.
4. **Source packet — two separable questions** (the single most important input for any
   truth-bearing field):
   - **Is there a truth to protect?** If yes, build a **fact ledger** of what is actually
     true plus an explicit NOT-ALLOWED list (invented line numbers, names, stack traces,
     quotes, scenes). This arms the fabrication gate — judges cannot tell honest specificity
     from fabricated specificity without it. See "references/judging.md" section 1 for the
     template. Skip only when there is no truth to protect.
   - **Should the current original compete?** The original is no longer a privileged bar the
     champion must clear on a supermajority — if you want it judged, **field it as one of the
     N**: `INCLUDE_BASE = true` in a generate run (it takes one cell of the field, replacing a
     generated one), or just include it among your `given` items. It is then screened, seeded,
     and rated like any entry, and "keep the original" is simply the result that it won its
     bracket or out-rated the field (see Output). Omit it when the current version is not up
     for head-to-head comparison. (Running worldcup on "improve this draft" usually means the
     current version IS up for replacement — so fielding it, not privileging it, is the honest
     default.)
   When the field critiques, responds to, or makes factual claims about a named external
   work, add a TARGET built from that work's ACTUAL fetched source (WebFetch the original;
   WebSearch/exa/grep/context7 to locate and corroborate by domain), not the draft's summary
   of it. Put it in the template's dedicated `TARGET` field (which is what drives the
   MISREPRESENTS_TARGET gate), never inline in the criteria text. The draft's characterization
   of the target is a claim to verify. This is target-truth, the companion to the author-truth
   ledger; without it a critique can pass the fabrication gate and still misrepresent the work
   it answers.
5. **Hard disqualifiers**: things that auto-kill an entry regardless of appeal. The
   domain-general one is **fabricated specifics presented as real** (a lie against the
   fact ledger). The user may add their own **house-style** hard bans (e.g. a prose profile
   might auto-kill em dashes) — but those are theirs to declare, never an engine
   default, and style tics like banned vocabulary are soft flags (surfaced in the report,
   not gate kills) rather than hard bans. Cheap regex bans
   (punctuation, word lists) run as a deterministic preflight before any agent; fabrication goes
   to the 3-judge gate.
6. **Cross-model jurors**: whether to bring frontier models in via agentify as
   panelists for the semis and final (see "references/judging.md", Cross-model
   jurors). Default: offer it for the final four when the decision is close or the
   stakes are high. It costs wall-clock (agentify is slower) so it is opt-in per run.
   Cross-model seats are wired outside the template today — the shipped template runs
   same-family panels; bringing in agentify/frontier jurors for the SF/final is a
   documented pattern requiring a small template modification (see judging.md).

## Procedure

1. **Read the references.** "references/judging.md" (the judge), "references/brackets.md"
   (exact group draw and knockout crossings for 32 and 48), and for a factorial run
   "references/design-pass.md" (the DESIGN spec + combinatorics) and
   "references/coordinates.md" (coords, effects, the coordinate view). The bracket math
   is load-bearing; do not reconstruct it from memory.
2. **Assemble the criteria block.** Write the taste spec and the disqualifiers (and the fact
   ledger, if any) into a single text block you will embed in every judge prompt — the original
   is NOT pasted here (it competes as a fielded contestant, not as a clause every juror reads).
   **If the user handed in a voice skill, invoke it and distill its hard rules into this block;
   otherwise use their stated criteria in their own words.** Ship nothing domain-specific by default — the engine
   judges on general axes (substance / fit / craft / integrity) and the user's criteria fills in what
   "good" means in their domain (see "references/profiles/" for the profile socket). For a
   critique/response run, fetch the target first and put it in the template's dedicated
   `TARGET` field — NOT in the criteria text. The template threads TARGET into the criteria
   channel for you AND derives the MISREPRESENTS_TARGET gate enforcement from that field;
   pasting target material into the criteria block instead reaches the prompts but leaves the
   gate unable to return MISREPRESENTS_TARGET, silently disabling the enforcement.
3. **Author the Workflow.** Read "references/workflow-template.js", copy it, and fill
   in: the DESIGN (flat flavors, axes for a factorial field, or sections for
   recombination — see design-pass.md), the criteria block + fact ledger, the field
   size, and the domain profile (lenses + gate). Also note the `LIVE_BEACONS` knob
   (live-view beacon emission, on by default — see Cost, below).
   Set `REPORT_THEME` to match the live-view theme where a matching report skin exists ('arena' default, 'classic'; unknown falls back to arena). The template already encodes the design pass, snake seeding, the
   group round-robin, the knockout crossings, the multi-lens judge, the fabrication gate,
   the effects analysis, the trust report, and the HTML report (mirror bracket + coordinate
   view). To field the current original as a contestant, set `INCLUDE_BASE = true` (generate
   mode) or include it among your `given` items. You are filling holes, not writing orchestration.
   **Recommended on Claude Code: make judges hermetic.** Copy
   `references/agents/worldcup-judge.md` to `.claude/agents/worldcup-judge.md`
   in the project (or `~/.claude/agents/worldcup-judge.md`), start a **new
   session** so Claude Code discovers it, then set
   `EVALUATOR.agentOptions.agentType = 'worldcup-judge'`. This applies only to
   screeners, seeders, slot judges, group/knockout jurors, and tiebreakers;
   generation and phase-0 fetch/research agents keep their tools. The template's
   validator rejects any substituted type name, and the pre-generation sentinel
   fails closed if the configured type is missing or cannot return the required
   schema. The paired probe separately verifies that this host version does not
   silently fall back when a named type is absent. For a new host/version,
   run `references/workflow-judge-agent-probe.js` first and inspect the run with
   `scripts/run-cost-report.js`. Graduation requires the forced ordinary-tool arm:
   the unrestricted control must actually call a tool, while the typed arm must
   expose no ordinary tool and still return `StructuredOutput`. Zero voluntary
   calls in the normal judging arms are not proof of denial. Custom-agent discovery
   happens at session start.
4. **Run it** with the Workflow tool. It runs in the background and notifies on
   completion. Watchable via "/workflows" (Tier-0 — free, no setup).

   **If the host has no Workflow tool** (Codex, for example): do not improvise a
   several-hundred-call run with ad-hoc subagents — the deterministic bracket
   logic and the ordering contract below are the whole point, and hand-driving
   it forfeits both. A full run currently needs Claude Code's ultracode Workflow
   tool; say so, then offer what still works without it: the judging doctrine in
   "references/judging.md" drops into any evaluation setup, and
   "references/workflow-template.js" ports to any orchestrator that can spawn
   judge agents — under its stated contract, the host's `parallel()` must return
   results in input order (a completion-order pool silently breaks the
   byte-identical determinism this repo advertises).

   **Optional Tier-1 live view** — a self-refreshing HTML bracket that fills in *as the run
   happens* (group tables building, knockout games "playing", winners advancing). To enable:
   a. Make a high-entropy nonce: `openssl rand -hex 8`.
   b. Fire the Workflow with `args: { liveNonce: "<nonce>" }`. The producer stamps every live
      event with it; judges never see it, so judged prose can't forge events. (In bring-your-own
      `given` mode `args` already holds the entrants, so wrap both: `args: { items: [...entrants],
      liveNonce: "<nonce>" }`.)
   c. The launch returns a **Transcript dir** — the run's live spine sits right under it. Start the
      watcher in the background and open the artifact:
      `node references/live-view.js --events "<transcript-dir>/journal.jsonl" --out worldcup-live.html --nonce "<nonce>" &`
      then open "worldcup-live.html". For a flicker-free live page, swap `--out` for
      `--serve [--port N]` — hosts on 127.0.0.1 and updates in place; anything readable
      locally can read the served page (see live-view.md).
   d. The watcher self-exits when the bracket completes (or after 3 min idle). If the spine path
      can't be resolved, just stay on Tier-0 (`/workflows`) — no run depends on the live view.
   You can preview the live view any time with `npm run demo` — a zero-setup fake
   tournament that exercises the real pipeline, no tournament required. When the
   champion is crowned the page throws confetti; click the champion card to replay.
   See "references/live-view.md" for the design + event contract.
5. **Write and open the report.** The Workflow returns "reportHtml": a self-contained
   World Cup-flavored HTML of the final state graph (bracket tree, group tables, champion
   path, global rating, trust verdict, disqualifications — and a confetti burst for the
   champion, unless it failed the gate: no party for a fabricator). Write it to
   "worldcup-report.html" in the working directory and open it. The structured "graph"
   field is returned alongside if you want to re-render. This report is a required
   deliverable of every run, not an optional extra.
6. **Report in chat** (see Output below). Read the returned result fully before
   summarizing — the champion, the final's deciding reason, the champion's path, the
   global rating, where the fielded original (if any) placed, and the trust verdict.

## The judging doctrine (summary)

Full version in "references/judging.md". The non-negotiables:

- **Pairwise, not absolute, for seeding.** Absolute 0-100 scores compress (last time
  8 of 32 tied at 88). Seed via a calibrated pairwise pre-pass and an Elo
  rating, so the pots actually mean something.
- **A match is a panel, not one judge.** The shipped default (see `panelFor` in the
  template): a 3-lens panel (substance / fit / craft) for the groups, R32, and R16;
  +integrity from the quarter-finals on. An even split seats a tiebreak juror, then
  the rating decides ("pens"). Vote counts scale with stakes; the budget knob is to
  override `panelFor('GROUP')` to one fixed, domain-chosen lens for the group stage.
  The current seam receives only the stakes name, not a match index, so it cannot
  rotate seats per match. This is a cheaper product tier, not a panel-equivalent mode.
- **Diverse lenses, not replicas.** Panelists wear different hats — the general default set is
  substance, fit, craft, integrity (a profile swaps in domain lenses, e.g. prose →
  fidelity/taste/anti-gaming/argument/cold-reader, code → correctness/simplicity) — and each is told
  to be ruthless on its one axis. A vote is the lens's verdict, not a generic "which is nicer."
- **Truth is a gate, not a score.** A regex preflight runs before any agent: a profile-declared
  em-dash ban hard-DQs on sight, while banned vocabulary and phrase patterns become soft flags
  surfaced in the report (gate panel + per-entry info sheets), not kills — the engine ships none
  of this by default. Then a 3-judge fabrication gate, armed
  with the fact ledger, disqualifies entries that invent specifics — DQ needs 2 of 3
  judges agreeing on the same violation family (overlapping fabrication subtypes count as
  one family), so one hallucinating judge cannot wrongly kill a clean entry, yet three
  judges naming different fabrication subtypes still forfeit it. A vivid fabricated entry
  forfeits; it does not lose "some points."
  This is the rule that flips the previous bad result.
- **The original is one of the N, not a privileged bar.** When you want the original
  judged, field it as a contestant (`INCLUDE_BASE`, or a `given` item); it is screened,
  seeded, and rated like any entry. "Keep the original" is simply the result that it won
  its bracket or out-rated the field — a real, useful outcome, not a failure to force a
  winner. Fielding it blind also removes a real bias: the retired reference challenge pasted
  the original's full text into every lens prompt. (Precious original that needs a
  *guaranteed* head-to-head? Run a post-run exhibition from the main loop — judging.md §12.)
- **Position and length bias controls.** Alternate A/B order across a panel; instruct
  jurors not to reward length or padding. Re-run split panels rather than coin-flip.
- **A trust report at the end.** If the bracket champion is not also the
  Elo rating leader, flag bracket variance and offer a top-4 round-robin
  runoff — likewise when the final was decided by a single vote ("narrow") or went
  to the tiebreak path ("pens"). A single-elimination winner can be a lucky draw;
  say so when it is.

## Output

Always produce, in this order:

- **The HTML report** ("worldcup-report.html"): the World Cup-flavored final state graph,
  written to disk and opened. This is the headline deliverable. Then summarize in chat:
- **Champion**: the full winning artifact, its flavor/label, seed rank, and how it
  won the final (the deciding lens verdicts).
- **The bracket story**: group standings, who advanced, the upsets (a top seed dying
  in groups is the headline), the elite eight, the final four.
- **Champion's path**: every opponent it beat and why, round by round.
- **Seed table / global rating**: the Elo ranking over all decided matches (group
  draws count for advancement, not rating).
- **Trust verdict**: clear winner, or lucky bracket. If lucky, name the entry that
  the global rating says might be stronger, and offer the runoff.
- For *generate* runs, end with the natural next step: adopt the champion, merge its best
  move into the original, or keep the original (a tournament can confirm the original was
  already best — that is a real and useful outcome). **Adoption rule:** if the original was
  fielded (`INCLUDE_BASE` / a `given` original), recommend adoption only when the champion
  clearly out-rates it (a rating gap, or a won direct meeting); otherwise keep the original.

## Cost

Counted from the shipped template defaults (SCREENERS=3; 3-lens panels through R16,
4 lenses from the QF — see `panelFor`), for a 32-team generate run:

- **Template default**: 32 generations + 96 gate screens (3 x field) + 48 seeding
  comparisons (~1.5 x field) + 144 group votes (48 matches x 3 lenses) + ~55 knockout
  votes (8x3 + 4x4 + 2x4 + 1x4, plus the odd tiebreak). Ballpark **360-390 agent calls**,
  plus ~26 cheap low-effort beacon agents for the Tier-1 live view — on by default; set
  `LIVE_BEACONS = false` in your copied template for a Tier-0-only run. (`INCLUDE_BASE`
  adds no calls — the base replaces a generated cell rather than adding one.)
- **Hermetic-judge opt-in**: adds one pre-generation sentinel call. In the
  recorded Claude Code 2.1.207 / Fable 5 paired probe, all 8 typed judges used
  the exact `worldcup-judge` type and completed their schemas. More importantly,
  the forced unrestricted control called `Read` successfully while the typed arm
  exposed only `StructuredOutput` and could not call any ordinary tool. Cost is
  **inconclusive**: interleaved arms received materially different cache attribution,
  so their input-token delta is not an agent-type saving. Rerun the forced denial
  probe whenever the host, model, tool registry, or agent definition changes.
- **Trimmed MVP**: two exact knobs — set `SCREENERS = 1`, and override `panelFor('GROUP')`
  to one fixed, domain-chosen juror for the group stage. Same arithmetic lands at
  ballpark **210-240 agent calls**. This deliberately gives up both majorities:
  `SCREENERS=1` lets one screener disqualify an entry, and one-juror groups let one lens
  decide advancement. Historical Run 1/Run 2 margin-trigger rotations changed 1-6 of
  16 advancement positions; a fixed lens has no equivalence guarantee and may move as
  many or more. Once the field changes, the counterfactual champion, Elo order, and trust
  verdict are unknowable without running the downstream bracket. (See
  "references/judging.md" section 14.)

Generation discipline is the largest measured free lever: work from the inline brief and
artifact. Do not call tools merely to measure length or word count, and do not iteratively
redraft toward an unstated length target; length is free unless the criteria explicitly
impose a hard limit. This instruction is part of every candidate-generation brief in the
shipped template.

A 48-team run is roughly 1.6x (72 group matches, 31 knockout matches). This is an
ultracode-scale operation: only run it when the user has opted into multi-agent
orchestration, and state the rough agent count and knobs before launching so the cost is
not a surprise.

## References

- "references/judging.md" — the judge: lenses, the fabrication veto, panels,
  calibration, bias controls, aggregation math, cross-model jurors. Read first.
- "references/brackets.md" — exact formats: group draw from pots, round-robin
  scheduling, advancement (including 48-team best-third ranking), and the precise
  knockout crossings for both 32 and 48. Code-ready.
- "references/design-pass.md" — how candidates are created: the DESIGN spec (flat |
  axes | sections), forced vs dynamic axis-finding, the deterministic factorize/reconcile
  combinatorics, and coordinate-stamped prompt derivation.
- "references/coordinates.md" — the coordinate model: per-candidate coords, the post-hoc
  effects analysis (main effects, interactions, predicted optimum, estimability), the
  optional predicted-optimum playoff, and the coordinate view in the report.
- "references/workflow-template.js" — the ultracode Workflow you copy and fill in.
  Encodes everything above plus the HTML report generator (returns "reportHtml"); you
  supply the DESIGN, the criteria block, and the domain profile. DESIGN.kind is 'flat'
  (the classic seed list), 'axes' (factorial — mode 'forced' or 'dynamic'), or
  'sections' (slot recombination).
