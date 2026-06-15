# Brackets — exact formats for 32 and 48

Code-ready. The workflow template imports these structures verbatim. Do not
reconstruct from memory; the crossings are easy to get subtly wrong.

Conventions:
- A "team" is a contestant object carrying at least `{ id, label, rating }` where
  `rating` is the Bradley-Terry / seed score from the seeding pre-pass (see
  judging.md).
- Group letters are index-based: group 0 = A, 1 = B, ...
- No draws exist. A judged match always returns a winner, so group points are
  multiples of 3 (win = 3).

---

## Table of contents

- 32-team format (classic, 8 groups of 4)
- 48-team format (2026, 12 groups of 4 + best thirds)
- Shared: pot draw, round-robin schedule, group standings
- Shared: standard seeded knockout bracket builder (used by 48)

---

## Shared: group draw (snake seeding)

Seed the field best-first, then snake-seed into groups so the strongest are kept
apart and each group is balanced. This is more reliable for finding the best entry
than a random pot draw (which adds avoidable variance), and it is deterministic (no
Math.random, which is unavailable in workflow scripts). Group g (0-indexed) gets
seeds g+1, 2G-g, 2G+1+g, 4G-g.

```js
// teams: array sorted best-first by seeding rating (teams[0] = seed 1). G = groups.
function snakeGroups(teams, G) {
  return Array.from({ length: G }, (_, g) => [
    teams[g],             // pot 1: seed g+1
    teams[2 * G - 1 - g], // pot 2: seed 2G-g
    teams[2 * G + g],     // pot 3: seed 2G+1+g
    teams[4 * G - 1 - g], // pot 4: seed 4G-g
  ])
}
// 32 (G=8): A=[1,16,17,32], B=[2,15,18,31], ... H=[8,9,24,25]
// 48 (G=12): A=[1,24,25,48], B=[2,23,26,47], ... L=[12,13,36,37]
// Covers every seed exactly once. If you want the "World Cup draw" feel instead,
// pot-and-randomize within pots, but snake is the reliable default.
```

## Shared: round-robin schedule (group of 4)

Each group plays all 6 pairings. Every match is judged (see judging.md for the
panel schedule by stage).

```js
// returns the 6 unordered pairs of a 4-team group
function roundRobin(group) {
  const pairs = []
  for (let a = 0; a < group.length; a++)
    for (let b = a + 1; b < group.length; b++)
      pairs.push([group[a], group[b]])
  return pairs // 6 pairs for a group of 4
}
```

## Shared: group standings

Sort: points desc, then head-to-head winner, then seeding rating, then a stable
fallback. `results` is the list of judged group matches with `{ winner, loser, gi }`.

```js
function standings(group, gi, results) {
  const pts = new Map(group.map(t => [t.id, 0]))
  const beat = new Map(group.map(t => [t.id, new Set()]))
  results.filter(r => r.gi === gi).forEach(r => {
    pts.set(r.winner.id, pts.get(r.winner.id) + 3)
    beat.get(r.winner.id).add(r.loser.id)
  })
  const ranked = [...group].sort((p, q) => {
    const dp = pts.get(q.id) - pts.get(p.id)
    if (dp) return dp
    if (beat.get(p.id).has(q.id)) return -1   // head-to-head
    if (beat.get(q.id).has(p.id)) return 1
    return q.rating - p.rating                // seeding rating
  })
  return { ranked, pts }
}
```

---

## 32-team format (classic)

8 groups (A-H) of 4. 48 group matches. Top 2 of each group advance to a 16-team
knockout. This uses the authentic FIFA crossing pattern (2014/2018/2022), which
keeps group winners apart and rewards finishing first.

```js
const G32 = 8
// advancers[gi] = { first, second } from standings()
// Round of 16 — authentic crossings (gi: A=0,B=1,C=2,D=3,E=4,F=5,G=6,H=7)
function r16Pairs(adv) {
  const W = i => adv[i].first, R = i => adv[i].second
  return [
    [W(0), R(1)], [W(2), R(3)], [W(4), R(5)], [W(6), R(7)], // 1A-2B 1C-2D 1E-2F 1G-2H
    [W(1), R(0)], [W(3), R(2)], [W(5), R(4)], [W(7), R(6)], // 1B-2A 1D-2C 1F-2E 1H-2G
  ]
}
// QF pairs winners of (r16[0],r16[1]), (r16[2],r16[3]), (r16[4],r16[5]), (r16[6],r16[7])
// SF pairs winners of (qf[0],qf[1]), (qf[2],qf[3])
// Final pairs winners of (sf[0], sf[1])
// This tree puts 1A's path and 1B's path in opposite halves; they can only meet in the final.
```

Knockout chaining (same for both formats once you have the round-1 pairs):

```js
function nextRoundPairs(prevWinners) {
  const pairs = []
  for (let i = 0; i < prevWinners.length; i += 2)
    pairs.push([prevWinners[i], prevWinners[i + 1]])
  return pairs
}
// r16 -> qf -> sf -> final, calling nextRoundPairs on the winners array each round.
```

---

## 48-team format (2026)

12 groups (A-L) of 4. 72 group matches. Advancement:

- The 12 group **winners** and 12 **runners-up** qualify (24).
- The **8 best third-placed** teams (of 12) qualify, completing a 32-team knockout.

Group draw uses `snakeGroups(teams, 12)`. Group letters A-L.

### Ranking the third-placed teams

```js
// thirds: the 12 third-place finishers, each with its group points and rating.
function bestThirds(thirds, ptsById) {
  return [...thirds]
    .sort((p, q) => (ptsById.get(q.id) - ptsById.get(p.id)) || (q.rating - p.rating))
    .slice(0, 8) // top 8 advance
}
```

### Round of 32 — seeded bracket (the skill's implemented default)

FIFA's official 2026 bracket assigns the 8 thirds to winner-slots via a fixed
495-row combination lookup keyed on *which* groups' thirds qualified. That table is
arbitrary tournament-scheduling cruft, not a fairness principle, and it is brittle
to reproduce. For finding the genuine best entry, a **standard seeded bracket** is
cleaner and more defensible: rank all 32 qualifiers, then lay them into a bracket
that keeps the strongest apart until late and gives higher qualifiers easier early
pairings. Group performance still matters because it sets the seed tier.

```js
// Knockout seed tiers: winners (best), then runners-up, then best-thirds.
// Within each tier, order by group points then rating.
function knockoutSeeds(winners, runnersUp, thirds, ptsById) {
  const tier = arr => [...arr].sort(
    (p, q) => (ptsById.get(q.id) - ptsById.get(p.id)) || (q.rating - p.rating))
  return [...tier(winners), ...tier(runnersUp), ...tier(thirds)] // length 32, index 0 = seed 1
}

// Standard single-elimination slot order for a power-of-two field.
// Returns seed NUMBERS (1-based) in bracket-slot order; pair slot[0]v[1], [2]v[3], ...
function seedSlotOrder(n) {
  let seeds = [1, 2]
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1
    const next = []
    for (const s of seeds) { next.push(s); next.push(sum - s) }
    seeds = next
  }
  return seeds // e.g. n=32 -> [1,32,16,17,8,25,9,24,4,29,13,20,5,28,12,21,2,31,...]
}

// Build round-of-32 pairs from the 32 ranked qualifiers, with same-group avoidance.
function r32Pairs(rankedQualifiers) {
  const order = seedSlotOrder(32)               // seed numbers in slot order
  const slots = order.map(s => rankedQualifiers[s - 1]) // seed n -> the (n-1)th best team
  const pairs = []
  for (let i = 0; i < slots.length; i += 2) pairs.push([slots[i], slots[i + 1]])
  // same-group repair: if a pair is two teams from one group, swap the second team
  // with the second team of the next pair (cheap, preserves seeding tiers closely).
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0].group === pairs[i][1].group) {
      const tmp = pairs[i][1]; pairs[i][1] = pairs[i + 1][1]; pairs[i + 1][1] = tmp
    }
  }
  return pairs // 16 pairs -> R32; then nextRoundPairs through R16, QF, SF, Final
}
```

If strict FIFA fidelity is wanted over this cleaner seeding, swap `r32Pairs` for the
official 2026 crossing table; the rest of the chain (`nextRoundPairs`) is unchanged.
The seeded bracket is the recommended default and what the workflow template ships
with.

### 48-team knockout depth

R32 (16 matches) -> R16 (8) -> QF (4) -> SF (2) -> Final (1) = 31 knockout matches,
on top of 72 group matches.

### Strict-fidelity option: the authentic FIFA 2026 bracket

If you want the real 2026 crossings instead of the seeded bracket, here is the official
structure (cross-model verified). The catch: winner/runner-up slots are fixed, but the
8 best thirds are slotted by FIFA's **Annexe C 495-row lookup table**, keyed on which 4
of the 12 groups' thirds did NOT qualify (lexicographic combination index), NOT by the
thirds' rank order. Same-group teams cannot meet in the R32.

Round of 32 (M73-M88), thirds shown as their slot column:

```
M73 2A-2B   M74 1E-3[col]  M75 1F-2C   M76 1C-2F
M77 1I-3[col] M78 2E-2I    M79 1A-3[col] M80 1L-3[col]
M81 1D-3[col] M82 1G-3[col] M83 2K-2L   M84 1H-2J
M85 1B-3[col] M86 1J-2H    M87 1K-3[col] M88 2D-2G
```

The 8 third-place slot columns and their matches:
`1A->M79, 1B->M85, 1D->M81, 1E->M74, 1G->M82, 1I->M77, 1K->M87, 1L->M80`.

```js
// Which Annexe C row to use, given the 8 group letters whose thirds qualified.
function annexeCOption(qualifiedThirdGroups) { // Set of 8 letters
  const G = 'ABCDEFGHIJKL'.split('')
  const missing = G.filter(g => !qualifiedThirdGroups.has(g)) // 4 letters
  // rows ordered by the 4 NON-qualifying groups, lexicographic: ABCD=1 .. IJKL=495
  const combos = []
  for (let a = 0; a < 12; a++) for (let b = a+1; b<12; b++) for (let c=b+1;c<12;c++) for (let d=c+1;d<12;d++)
    combos.push([G[a],G[b],G[c],G[d]].join(''))
  return 1 + combos.indexOf(missing.join('')) // 1..495 -> look up the row in Annexe C
}
```

R16 (M89-M96): `W74-W77, W73-W75, W76-W78, W79-W80, W83-W84, W81-W82, W86-W88, W85-W87`.
QF (M97-M100): `W89-W90, W93-W94, W91-W92, W95-W96`. SF: `W97-W98, W99-W100`. Final: `W101-W102`.

The full 495-row Annexe C table is not reproduced here (source it from FIFA regulations
if needed). Because that table is scheduling cruft rather than a fairness principle, the
**seeded bracket above is the skill's default** and is arguably better for finding the
true best entry. Use this strict-fidelity option only when authentic-bracket cosmetics
matter more than reliability.

### Best-finder caveat (cross-model)

A World Cup crowns a *compelling* champion, not reliably the *best* one: single
elimination compounds judging noise (a better entry with per-match win-prob q survives
the knockout only q^4 for 32, q^5 for 48). Treat the bracket champion as **provisional**.
Always fit the global rating over every head-to-head and confirm (see judging.md sections
7, 12, 13): if the bracket champion is not the rating leader, or the rating leader was
knocked out early by a narrow margin, run a top-4 round-robin before crowning. For pure
best-finding on a budget, a Swiss + Bradley-Terry + top-4 schedule beats the bracket; the
World Cup format earns its keep on spectacle and the report graph, which is the point here.
