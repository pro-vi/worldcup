# worldcup

A general best-of-N selection engine wearing a World Cup-style tournament bracket,
packaged as an agent skill.

Mass-produce many candidates, or bring a field you already have. `worldcup`
stages them through round-robin groups into a single-elimination knockout judged
by taste-calibrated LLM panels, then emits a self-contained HTML report of the
final bracket. Essays are one supported use case, not the required shape:
taglines, names, designs, prompts, configs, plans, and code solutions all work.

`worldcup` is an independent open-source project. It is not affiliated with,
endorsed by, or sponsored by FIFA or any tournament organizer.

## Quickstart

### Claude Code

Clone the repository and link the skill folder into Claude Code's personal skill
directory:

```bash
git clone https://github.com/pro-vi/worldcup.git
mkdir -p ~/.claude/skills
ln -s "$(pwd)/worldcup/worldcup" ~/.claude/skills/worldcup
```

Restart Claude Code so it reloads skill metadata, then ask for `/worldcup` or
describe a task like "generate 32 tagline variants and pick the best."

Expected layout:

```text
~/.claude/skills/worldcup/SKILL.md
~/.claude/skills/worldcup/references/workflow-template.js
```

### Codex CLI

Codex loads skills from `$CODEX_HOME/skills`, defaulting to `~/.codex/skills`:

```bash
git clone https://github.com/pro-vi/worldcup.git
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$(pwd)/worldcup/worldcup" "${CODEX_HOME:-$HOME/.codex}/skills/worldcup"
```

Restart Codex so it reloads skill frontmatter. In a new session, mention
`worldcup` or describe a "best of N" tournament task.

## Requirements

- An agent host that can load skills from `SKILL.md`.
- The ultracode Workflow tool for real tournament runs.
- Node.js 20+ for the optional live view and repository checks.
- No npm dependencies are required.

## Verify The Repo

Run the launch checks before changing the skill:

```bash
npm run check
```

`npm run check` runs syntax checks for the two executable JavaScript artifacts,
unit tests for the live-view event parser/fold, and validation for the
release-canary fixture contract. The actual judge canary is run through the skill
host and recorded against that contract before release.

## Layout

- `worldcup/` - the skill itself.
  - `SKILL.md` - triggers, inputs to settle, procedure, judging doctrine, cost tiers.
  - `references/judging.md` - the taste engine: deterministic preflight,
    fabrication gate, diverse-lens panels, calibration, rating, reference
    challenge, and domain profile sockets.
  - `references/brackets.md` - exact 32-team and 48-team bracket math, snake
    seeding, group advancement, and strict-fidelity notes.
  - `references/workflow-template.js` - the ultracode Workflow template the skill
    copies and fills; it encodes seeding, group->knockout, judging, Elo, the
    reference challenge, and the final HTML report.
  - `references/live-view.js` and `live-view.md` - optional live view: a
    dependency-free HTML bracket that updates while a run is still going. Themes:
    `arena`, `concrete`, and `mosaic`.
  - `references/profiles/` - optional domain/voice taste you plug into the
    domain-general judge. The engine ships taste-neutral; bring your own profile.
  - `references/coordinates.md`, `references/design-pass.md` - candidate
    generation references for flat, axes, and section/recombination runs.
- `canary/` - release-canary fixture contract.
- `scripts/` - local launch checks.
- `tests/` - Node test fixtures for repo-owned JavaScript.
- `docs/adr/` - durable architecture decisions.
- `docs/launch-history-strategy.md` - clean-history/squash strategy for public launch.

## Status

Shipped: hand-authored flat fields, factorial/axes generation, section
recombination with a coherence judge, snake seeding, group-stage draws, 32-team
and 48-team advancement, best-third surfacing, the fabrication gate, Elo,
reference challenge, live view, and final HTML report.

Deferred: genetic evolve mode, optimal-design solver for mixed-radix fractions,
and domain-specific bundled profiles.

## The Judge, In One Line

A vivid fabricated entry forfeits; it does not lose "some points." Truth and
authorial fidelity are gates. Taste begins only after an entry proves it is not
cheating.
