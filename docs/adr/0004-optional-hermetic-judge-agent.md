# ADR 0004: Offer a hermetic custom agent for tournament judges

- **Status:** Proposed
- **Date:** 2026-07-11
- **Deciders:** maintainer; architecture validated against two dogfood transcripts and a paired Claude Code capability probe

## Context

Run 2 showed decision judges using repository tools to fact-check entries. In
that run the fielded original was the README pitch block, so a judge that read
`README.md` could recover which unlabeled entry was the original. That violates
the tournament's blinding contract as well as adding tool round-trips and input
tokens. Judges already receive the criteria, fact ledger, and complete entries
inline; outside lookup is not part of their role.

Claude Code Workflow has no documented per-call `disallowedTools` option. Its
documented extension seam is `agentType`, backed by a custom agent definition
whose frontmatter controls tools. Agent definitions are discovered from the
project or home directory at session start, which creates deployment friction
for a portable skill.

## Decision

Ship `worldcup-judge` as an optional Claude Code custom agent with no ordinary
tools, and compose it with Workflow schemas through the existing
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
instead of a parallel constructor. A realistic paired probe on Claude Code
2.1.207 verified the whole mechanism: all eight typed agents reported the exact
custom type, made zero ordinary tool calls, and returned via
`StructuredOutput`; an absent named type hard-failed rather than silently
falling back.

**Rejected alternative — hermetic every agent:** seed/fetch research is an
accepted evidence-producing pattern, and generation in code or critique domains
may legitimately need reconnaissance. Denying those tools lacks quality
evidence and changes a different contract.

**Rejected alternative — undocumented per-call denial flags:** their behavior
and portability are not specified, while a custom `agentType` is observable in
the persisted sidecar and composes with Workflow schemas.

## Consequences

Positive:

- Opted-in judges cannot discover hidden provenance from the working tree.
- Judge prompts remain the complete, common evidence boundary.
- Ordinary judge tool round-trips are eliminated by mechanism, not suggestion.
- The pre-generation sentinel prevents a misconfigured expensive run.

Negative:

- Operators must copy/link the agent definition and start a new Claude session.
- Hermeticity is host-specific and opt-in; portable default runs retain host
  behavior.
- The sentinel adds one agent call to an opted-in run.
- Capability and cost evidence is version-specific and must be rerun after host,
  model, or custom-agent changes.

## Revisit Triggers

- Workflow documents a portable per-call tool policy with observable enforcement
  and schema-composition guarantees.
- A host silently substitutes an unknown `agentType`, or custom agents stop
  exposing their actual type in sidecars.
- Restricted judges lose schema compliance or cost more than the default agent.
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
- Recorded probe: `tests/fixtures/judge-probe/2026-07-11-fable-5.json`.
- Doctrine: `worldcup/SKILL.md`, `worldcup/references/judging.md` §10.
