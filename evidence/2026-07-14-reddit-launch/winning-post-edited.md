Based on the tournament-winning draft; edited by the author after the run.
NOT the exact 32-way tournament-winning text. (The exact winner is in
`winning-post-exact.md`.) Changes here are a light human polish only: a few
em-dashes softened to commas, one clause tightened. Facts unchanged.

---

TITLE: 32 things fight in a bracket. One gets red-carded for lying. The champion gets confetti. (clip attached)

BODY:
Watch the clip above first. 32 entries drop into 8 groups, round-robin through a group stage, then go single-elimination. Somewhere in the middle an entry gets red-carded, booted outright, zero points, no appeal, because it invented a stat to sound convincing. The bracket fills itself in live as matches resolve, and when a champion finally emerges: confetti.

That's worldcup, a Claude Code skill I built with Claude Code. It's a best-of-N picker cosplaying as a tournament: hand it 32 taglines, essay drafts, product names, anything you can judge by reading, and it runs them through a group stage plus knockout with LLM judge panels, Elo-calibrated seeding, and a trust verdict that flags when the winner might just be a lucky draw.

Front-loading the honesty: I haven't benchmarked this against just asking one strong model to pick, so no claim it's more accurate, only that it's more legible about how it decided. Prose is where I've actually used it; code runs through the test suite and a sample of 32 generated debounce implementations, but hasn't seen real mileage yet. A full run is a few hundred agent calls. Gloriously expensive, and a great excuse to point something cheap like Haiku at a big field.

No agents or API keys to watch it: npm run demo self-plays a bundled tournament through the real pipeline. Free, MIT, no affiliation with FIFA.

github.com/pro-vi/worldcup

What would you throw 32 of at this?
