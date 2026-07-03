# Release Canary

`judge-canary.json` is the repo's assurance floor (see ADR 0002): six bounded,
known-outcome cases the judge must get right before a release. The fixture is
the *contract*; a *record* is the result of actually running those six cases
through the skill host (an agent following `worldcup/SKILL.md`, using the same
judge prompts and schemas a real tournament uses).

## Validating

```bash
node scripts/judge-canary.js                     # contract check + every committed record (runs in npm run check)
node scripts/judge-canary.js --record <file>     # strictly validate one recorded run by hand
```

The default (no-flag) mode machine-enforces the committed records: every
`canary/records/*.json` whose `fixtureVersion` matches the current fixture's
`version` is validated on each `npm run check`/CI run, so a record cannot rot,
drift out of its accept lists, or vanish silently.

## Record shape

A record is a JSON array (or `{ "results": [...] }`) with one entry per case id.
The object form should carry `"fixtureVersion"` — the fixture `version` the run
attested (records are point-in-time proofs; see below):

```json
{
  "fixtureVersion": 1,
  "results": [
    {
      "id": "unsupported-fabrication-loses",
      "pass": true,
      "outcome": "hard_dq",
      "evidence": "Entry A invented a stack trace absent from the fact ledger; 3/3 gate judges returned FABRICATED_EVIDENCE; A was disqualified before the panel."
    }
  ]
}
```

Rules enforced by the validator:

- every fixture case id must appear exactly once; unknown or duplicate ids fail;
- `pass` must be `true` — a canary with a failing case is not recordable, it is a bug to fix;
- `outcome` is required and must be one of that case's `accept[]` values (this is
  the gate: a record without an outcome is rejected);
- `evidence` is required: quote what the judges actually returned, not a summary.

## Where records live

Recorded release runs live in `canary/records/`, one file per tag
(e.g. `canary/records/2026-07-v0.1.0.json`). A release is not tagged until its
record validates. Growth rule (ADR 0002): the suite gains a case only from an
escaped judge failure in production — never speculatively.

When the fixture grows, bump its `version`; historical records keep the
`fixtureVersion` they attested and the check sweep skips them (they remain
honest point-in-time proofs — never retro-edit a past release's record to
satisfy a newer contract). Each new release records against the current
fixture, so the newest record is always strictly enforced.
