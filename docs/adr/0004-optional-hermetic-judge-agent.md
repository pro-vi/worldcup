# ADR 0004: Offer a hermetic custom agent for tournament judges

- **Status:** Accepted
- **Date:** 2026-07-11 (proposed and accepted; capability, cost, and quality closed the same day by the completed Run-3 dogfood)
- **Deciders:** maintainer; mechanism probed on Claude Code 2.1.207; verdicts closed by the uninterrupted Run-3 dogfood (`wf_9854236a-9f2`)

## Context

Run 2 showed decision judges using repository tools to fact-check entries. In
that run the fielded original was the README pitch block, so a judge that read
`README.md` could recover which unlabeled entry was the original. That violates
the tournament's blinding contract as well as adding tool round-trips and input
tokens. Judges already receive the criteria, fact ledger, and complete entries
inline; outside lookup is not part of their role.

Claude Code Workflow has no documented per-call `disallowedTools` option. Its
documented extension seam is `agentType`, backed by a custom agent definition.
That definition supports a documented `disallowedTools` **frontmatter field**;
it is distinct from the rejected per-call option and removes named built-in tools
plus `mcp__*` from the inherited set. Agent definitions are discovered from the
project or home directory at session start, which creates deployment friction
for a portable skill.

## Decision

Ship `worldcup-judge` as an optional Claude Code custom agent whose
`disallowedTools` denylist removes the host's ordinary built-in, MCP, and
MCP-resource tools, and compose it with Workflow schemas through the existing
`EVALUATOR.agentOptions` → `judgeOpts` seam.

When configured:

- every screener, seeder, slot judge, group/knockout juror, and tiebreaker uses
  the exact `worldcup-judge` type;
- configuration validation rejects any different named type;
- a schema-bound sentinel runs before candidate generation and aborts with
  install/restart guidance if the type cannot execute correctly;
- generation, phase-0 fetch/research agents, predicted-optimum generation, and
  live beacons retain their existing host tools.

Keep the shipped template's default `agentOptions` empty. This preserves the
plain-JavaScript portability contract for hosts without Claude Code custom
agents; Claude Code operators opt in after installing the definition and
starting a new session.

## Rationale

The existing judge-options seam already covers every decision surface and
protects per-call schema/label fields, so `agentType` adds one policy value
instead of a parallel constructor. The original realistic paired probe on
Claude Code 2.1.207 verified type/schema behavior, but its normal arms were not
denial evidence because neither the typed nor unrestricted control voluntarily
used tools. The repaired probe adds a forced ordinary-tool arm: the unrestricted
control called `Read` successfully, while the typed agent exposed only
`StructuredOutput` and had no ordinary tool to attempt. An absent named type also
hard-failed rather than silently falling back.

**Rejected alternative — hermetic every agent:** seed/fetch research is an
accepted evidence-producing pattern, and generation in code or critique domains
may legitimately need reconnaissance. Denying those tools lacks quality
evidence and changes a different contract.

**Rejected alternative — undocumented per-call denial flags:** their behavior
and portability are not specified. This does not reject the documented
`disallowedTools` field in custom-agent frontmatter; that denylist is the chosen
mechanism. The custom `agentType` remains observable in persisted sidecars and
composes with Workflow schemas.

## Consequences

Positive:

- On a registry that passes the forced-call probe, opted-in judges cannot use an
  ordinary tool to discover hidden provenance from the working tree.
- Judge prompts remain the complete, common evidence boundary.
- On the probed host/tool registry, ordinary judge tools are absent by denylist;
  the forced-call control distinguishes that mechanism from prompt compliance.
- The pre-generation sentinel prevents a misconfigured expensive run.

Negative:

- Operators must copy/link the agent definition and start a new Claude session.
- Hermeticity is host-specific and opt-in; portable default runs retain host
  behavior.
- The sentinel adds one agent call to an opted-in run.
- Capability and cost evidence is version-specific and must be rerun after host,
  model, or custom-agent changes.
- The probe's cost arms were inconclusive: interleaved typed/control calls
  received different cache attribution, so the probe's input-token delta is not
  an agent-type saving. (Superseded — see Measured outcomes.)
- The first Run-2-field dogfood quality verdict was **INCONCLUSIVE**: a
  cumulative session limit interrupted 157 late judgments and scheduled 37
  fallback tiebreaks. (Superseded by the completed Run-3 dogfood — see Measured
  outcomes; the interrupted record is retained unchanged.)

## Measured outcomes (Run-3 dogfood, 2026-07-11)

An uninterrupted 363-agent generate-mode run on the Run-2 field family
(`wf_9854236a-9f2`; record
`tests/fixtures/judge-probe/2026-07-11-run3-field-dogfood.json`) closed all
three verdicts:

- **Capability PASS.** All 332 typed invocations — the 331 scoring judge
  surfaces plus the pre-generation sentinel — ran as `worldcup-judge`
  (persisted sidecars); 332 StructuredOutput calls; zero ordinary tool calls
  across every typed transcript.
- **Cost PASS.** Every judge role ran at exactly 1.0 requests/invocation
  (Run 2 unrestricted: 1.04–1.41). Whole-run logical input fell 15.44M → 5.81M
  (−62%) and output 2.89M → 2.19M (−24%) against the byte-comparable Run-2
  baseline. The paired in-run tail measurement attributes the input collapse:
  all 31 default-type generation agents carried exactly 10,513 uncached input
  tokens on their first request, while all 332 typed agents carried exactly 2 —
  the default agent's harness/tool-definition tail does not exist for the
  hermetic type. The tail is registry-specific (9,222 in the Run-1/2 sessions,
  10,513 here, same Claude Code version), which the hermetic type is immune to.
- **Quality PASS (indicator-level).** Same-flavor FABRICATION disqualification
  for the third consecutive run, gate canary clean, trust verdict robust with
  champion = rating leader, zero fallback tiebreaks, and the fielded original
  in the same bottom quartile (27/32 vs Run 2's 31/32). Scope: one completed
  run, prose field, behavioral indicators — not a head-to-head judging-quality
  benchmark (ADR 0001).

## Revisit Triggers

- Workflow documents a portable per-call tool policy with observable enforcement
  and schema-composition guarantees.
- A host silently substitutes an unknown `agentType`, or custom agents stop
  exposing their actual type in sidecars.
- Restricted judges lose schema compliance, the forced control cannot use an
  ordinary tool, or the typed forced arm exposes one.
- Quality evidence shows a decision judge genuinely needs external evidence;
  repair the inline packet first, and revisit this boundary only if that fails.
- A portable packaging mechanism can install project-scoped agent definitions
  without session-start discovery friction.

## References

- Implementation: `worldcup/references/workflow-template.js` (`judgeOpts`,
  `validateEvaluatorConfig`, `requireJudgeAgent`).
- Agent definition and probe:
  `worldcup/references/agents/worldcup-judge.md` and
  `worldcup/references/workflow-judge-agent-probe.js`.
- Recorded probe:
  `tests/fixtures/judge-probe/2026-07-12-claude-code-2.1.207-fable-5.json`.
- Interrupted dogfood record:
  `tests/fixtures/judge-probe/2026-07-11-run2-field-dogfood.json`.
- Completed dogfood record:
  `tests/fixtures/judge-probe/2026-07-11-run3-field-dogfood.json`.
- Cost retrospective and roadmap: `docs/token-cost.md`.
- Doctrine: `worldcup/SKILL.md`, `worldcup/references/judging.md` §10.
