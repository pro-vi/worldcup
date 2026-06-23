# worldcup

A general best-of-N selection engine wearing a FIFA World Cup, packaged as a Claude Code skill.

Mass-produce many candidates (or hand it a field), stage them through a round-robin
group stage into a single-elimination knockout judged by taste-calibrated LLM panels,
and emit a World Cup-flavored HTML report of the final bracket. Essays are one supported
profile, not the required shape — taglines, names, designs, prompts, configs, code
solutions all work.

## Layout

- `worldcup/` — the skill itself. Symlinked into `~/.claude/skills/worldcup` so Claude
  Code loads it.
  - `SKILL.md` — triggers, inputs to settle, procedure, the judging doctrine, cost tiers.
  - `references/judging.md` — the taste engine: deterministic preflight + 3-judge
    fabrication gate armed with a fact ledger, diverse-lens panels, calibration,
    Bradley-Terry + bootstrap, the reference challenge, domain profiles.
  - `references/brackets.md` — exact 32 (8 groups of 4) and 48 (12 groups, 2026 format)
    bracket math; snake seeding; the authentic FIFA crossings and the 48-team Annexe-C note.
  - `references/workflow-template.js` — the ultracode Workflow the skill authors and runs;
    encodes seeding, group→knockout, the judge pipeline, Elo + reference challenge, and the
    clickable mirror-bracket HTML report (`renderReportV2`).
- `docs/adr/` — Architecture Decision Records (the durable decisions: single domain-general judge;
  no per-run judge certification).

## Wiring (loopgen-style symlink)

    ~/.claude/skills/worldcup -> ~/Development/_projs/worldcup/worldcup

Edit here; Claude Code picks it up. Restart a session to reload `SKILL.md` frontmatter;
the `references/*` files are read fresh on each run.

## Status / roadmap

- **Shipped:** hand-authored flat `FLAVORS`; factorial/axes generation (candidates as points in a
  coordinate system, with axis-effects analysis); the section / recombination route with a coherence
  judge; snake seeding; group→knockout; the fabrication-gate judge; Elo + reference challenge; the
  clickable mirror-bracket report.
- **Deferred (out of scope):** a genetic evolve mode and an optimal-design solver for mixed-radix
  fractions — see `references/design-pass.md`.

## The judge, in one line

A vivid fabricated entry forfeits; it does not lose "some points." Truth and authorial
fidelity are gates, taste begins only after an entry proves it is not cheating.
