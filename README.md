# worldcup

[![CI](https://github.com/pro-vi/worldcup/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pro-vi/worldcup/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

worldcup is a fun experiment: **best-of-N picking, run as a World Cup**. You
mass-produce a field of candidates — 32 or 48 taglines, names, drafts, even code
as text — and they fight through a group stage into a knockout bracket, judged by
LLM panels, until one gets crowned. It's an agent skill for Claude Code, and it's
built to be *watched*: the bracket fills in live as matches resolve, and the
champion gets confetti.

![worldcup demo: group tables filling in, a live match glowing, an entry thrown out at the fabrication gate, and the champion crowned with confetti](docs/media/demo.gif)

Two finished runs, rendered live and self-contained:
[taglines](https://pro-vi.github.io/worldcup/media/sample-report.html) ·
[code](https://pro-vi.github.io/worldcup/media/sample-report-code.html).
Independent, MIT-licensed, not affiliated with FIFA.

## Quickstart

It's a skill. Paste this repo into your agent and ask it to install worldcup, or
set it up by hand:

```bash
git clone https://github.com/pro-vi/worldcup.git && cd worldcup   # skip if you ran the demo
mkdir -p ~/.claude/skills
ln -sfn "$(pwd)/worldcup" ~/.claude/skills/worldcup   # symlink stays in sync with git pull
npm run check                                         # confirm the repo is coherent
```

Restart Claude Code, then run `/worldcup` — or just describe the task: "generate
32 tagline variants and pick the best." A full tournament runs on Claude Code's
[ultracode Workflow tool](https://code.claude.com/docs/en/workflows) (paid plan)
and is a few hundred agent calls; the demo, the judging doctrine, and the
portable template all work without it.

## Where this is going

This is an experiment in harnessing Claude Code Workflow, best-of-N, and
LLM-as-a-judge — not a finished product. It remains to be seen whether a
tournament actually picks better than one strong judge call, or than picking by
vibe (which at least carries direct human taste). There's no benchmark yet — but
best-of-N, LLM-as-a-judge, and evaluation design are fast-moving research areas
with a lot this project can absorb, and building a proper benchmark is the
near-term plan.

Under the hood there's a fabrication gate (an entry that invents a fact
forfeits), Elo-calibrated seeding, and a trust verdict that flags a lucky
bracket — the [judging doctrine](worldcup/references/judging.md) has the details.
