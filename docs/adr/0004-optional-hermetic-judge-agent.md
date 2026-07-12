# ADR 0004: Offer a hermetic custom agent for tournament judges

- **Status:** Proposed
- **Date:** 2026-07-11
- **Deciders:** maintainer; mechanism probed on Claude Code 2.1.207; tournament-quality evidence remains inconclusive

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
- Cost is inconclusive: interleaved typed/control calls received different cache
  attribution, so the observed input-token delta is not an agent-type saving.
- The Run-2-field dogfood quality verdict is **INCONCLUSIVE**: a cumulative
  session limit interrupted 157 late judgments and scheduled 37 fallback
  tiebreaks. It proves neither quality preservation nor a trustworthy champion.

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
- Recorded probe: `tests/fixtures/judge-probe/2026-07-11-fable-5.json`.
- Doctrine: `worldcup/SKILL.md`, `worldcup/references/judging.md` §10.
