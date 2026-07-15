The exact 32-way tournament-winning draft (champion: punchy-short, seed 13, rating 1697).
This is the verbatim winning text — no human edits.

---

**TITLE:** My Claude Code skill runs your drafts through a World Cup. Liars get red-carded.

**BODY:**

Got tired of picking my "best" draft by vibes, so I built worldcup: an open-source Claude Code skill, built with Claude Code, that turns best-of-N picking into an actual tournament.

Feed it a field, 32 taglines, essay drafts, names, whatever you can mass-produce, and it runs a real group stage into a single-elimination bracket, judged by LLM panels, until one winner gets crowned and you get a self-contained HTML report of the whole bracket. Clip above is a live run, no cuts.

The judging is the whole point. Origin story: an early essay once won a bracket by fabricating detail, invented line numbers, a fake stack trace, a class name that never existed, because it read "lived-in" to a single tasteless judge. So now there's a fabrication gate: invent a stat you can't back up and you get red-carded on the spot, zero points, out. Plus adversarial judge panels, Elo-calibrated seeding, and a trust verdict that flags a suspiciously lucky bracket run.

Honest part: no benchmark saying this beats one good model just picking. Prose is where it's actually earned its keep; code runs on tests plus a sample, nothing more. A full run costs hundreds of agent calls, which is a genuinely dumb amount of compute to pick one tagline, and also kind of the fun of it.

Zero agents, zero API keys, just watch it: `npm run demo`. Free, MIT, no FIFA affiliation.

github.com/pro-vi/worldcup

What would you throw 32 of into a bracket?
