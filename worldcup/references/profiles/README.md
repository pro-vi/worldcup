# Profiles — the domain taste you plug into a domain-general engine

The worldcup engine ships a **domain-general** default judge — general axes (`substance` · `fit` ·
`craft` · `integrity`), general DQ categories, and **no domain-specific taste or house bans**. It has a
taste-shaped socket: the criteria block (rubric + house bans), the gate, and the lens set. A **profile**
fills that socket for one domain or one author's voice (e.g. prose swaps in `fidelity`/`taste`/`anti-gaming`/
`argument`/`cold-reader` + a fabrication gate). Nothing in a profile is an engine default — you opt into it.

## How a run gets its taste (priority order)
1. **The user hands in a voice skill** → invoke it and distill its rules into the criteria block.
   This is the first-class path: bring your own voice; the engine applies it.
2. **The user states criteria in their own words** → use those.
3. **A profile here** → copy one of these as a starting point and adapt it.
4. **Nothing** → the engine judges on its general axes + the domain-general gate only (fabricated
   specifics presented as real, genre breach, non-responsiveness). No peculiarities, ever.

## What a profile supplies
- **Taste spec** — the positive rubric (what a strong entry has), as deep traits, not a checklist.
- **Gate** — the domain's hard-kill check (prose → fabrication; code → compiles/passes-tests;
  design → constraints; names → collision/availability).
- **Lenses** — the per-axis jurors (engine default: substance / fit / craft / integrity; prose swaps in
  fidelity / taste / anti-gaming / argument / cold-reader — see `judging.md` §5).
- **House-style bans** — OPTIONAL, and the author's own. Style tics (punctuation, word choice) are
  usually better as **lens penalties** than gate **kills** — a hard auto-DQ on a tic eliminates a
  better entry on a technicality. Use a hard ban only when you genuinely never want the thing.

## Writing one
No example profile ships here — taste is yours to bring. Copy the four-part shape above
(taste spec · gate · lenses · optional house bans) into `references/profiles/<your-domain>.md`,
or hand the skill your own voice skill (path 1) and let it distill the rules. Keep style tics as
lens penalties, not gate kills, unless you genuinely never want the thing.
