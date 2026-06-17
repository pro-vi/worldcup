# Design pass — how candidates are created

Candidate generation is a **design pass** that runs before the tournament and emits
coordinate-stamped candidate specs `{ id, label, coords, prompt }`. Each candidate is a
point in a design space. The tournament engine never reads `coords` (it is additive), so
generation is decoupled from the bracket.

## The DESIGN object

```js
const DESIGN = {
  kind: 'flat',     // 'flat' | 'axes'   ('sections' reserved -> PLAN_2)
  flavors: [ { name, brief }, ... ],          // kind:'flat'  (length === FIELD)
  mode: 'forced',                              // kind:'axes'  'forced' | 'dynamic'
  axes: [ { name, values: { label: 'fragment', ... } }, ... ],  // kind:'axes'
}
```

- **flat** — the classic hand-authored list. `coords = { flavor: name }`. One nominal
  axis; no factorial structure, no effects analysis. Unchanged from the original skill.
- **axes** — a factorial grid. Each candidate is a coordinate over `k` orthogonal axes.

## Forced vs dynamic (axes)

- **forced** — you give the axes (`DESIGN.axes`), each value carrying a prompt fragment.
- **dynamic** — an axis-finder agent reads the BASE + criteria and proposes the axes,
  values, and fragments (`AXIS_SCHEMA`). Falls back to a single binary axis if it returns
  nothing. Aim is ~`log2(FIELD)` axes so the cross-product lands near FIELD.

Either way the product `M = ∏ |values|` is reconciled to exactly `FIELD` cells.

## Combinatorics (deterministic, no RNG)

`reconcile(axes, N)` maps the axis product to exactly `N` cells:

| Condition | strategy | estimable |
|---|---|---|
| `M === N` | `full` (the whole cross-product) | all-2way |
| `M < N`, `N` a multiple of `M` | `replicate` (balanced, `N/M×`) | all-2way |
| `M < N`, `N` not a multiple of `M` | `partial-replicate` (imbalanced, early levels over-represented) | probe-backed |
| `M > N`, all-binary, `N` a power of two | `fractional` (resolution generators) | probe-backed |
| `M > N`, mixed radix or non-power-of-two | `subsample` (deterministic stride) | probe-backed |

`estimable` is **not** a theory claim — it is set by `mainEffectsEstimable(cells, axes)`,
which checks that the contrast columns are orthogonal and non-degenerate. A fraction that
keeps main effects clean reports `main-effects`; a lossy subsample reports `none`. The
report labels effects accordingly (see coordinates.md).

`design.resolved = { axes, frag, strategy, estimable, meta }` is stashed for the report and
the effects analysis.

## Prompt derivation

For each cell, the generation prompt is assembled from the BASE + criteria + the joined
value fragments for that coordinate:

```
Produce a VARIANT of the artifact below at this exact design point:
- lead = cold: <fragment>
- spine = dota: <fragment>
...
```

The label is the coordinate read out (`cold-dota-deflate-tight-plain`), suffixed `#2` on
collisions (replicated cells). Labels are unique across the field.

## The section route (`kind:'sections'`) — compositional design

Where `axes` transforms the *whole* artifact, `sections` factors it *compositionally*: the
artifact is `S` slots (positions — hook · Civ · Dota · close …), each with its own
candidates (players). A candidate is a **lineup**: one variant chosen per slot, assembled
into a single artifact. Config: `DESIGN.sections = { keepPerSlot, slots: [{ slot, count, brief }] }`.

Two stages (`deriveSections`):

- **Stage 1 — per-slot squads.** For each slot, generate `count` candidates, then judge them
  **in isolation** with a single slot-fit juror (round-robin → slot Elo): "which `{slot}`
  better serves THIS piece, given the rest as fixed context" — fit, not the slot in a
  vacuum. Keep the top `keepPerSlot`. Slot judging is cheaper and lower-variance than
  comparing whole artifacts.
- **Stage 2 — assembly.** The slot survivors become categorical **axes** (one per slot,
  values = survivor labels), so the *same* `reconcile(axes, FIELD)` fits the assembly
  cross-product (`∏ keepPerSlot`) to exactly FIELD — and the effects analysis + coordinate
  view come for free. Each reconciled cell is stapled (survivor markdowns joined in slot
  order) into one candidate; `coords = slot → survivor`. No per-candidate generation agent —
  the markdown is assembled deterministically.

The candidate enters the engine as a normal pool item (`{ id, label, coords, markdown }`).
The one engine change: a **coherence** lens is seated in every panel (see judging.md), because
an assembly stapled from independently-judged slots can be a Frankenstein the slot judges
never saw. A coherent lineup can rightly beat a higher-sum-of-parts rival — that interaction
is exactly what the section route exists to surface. If `∏ keepPerSlot < FIELD`, lineups
repeat (logged, not silent); raise `keepPerSlot` or slot `count` to fill the field. Evolve
mode (genetic crossover over lineups) and an optimal-design solver are deferred to PLAN_2
U9/U10.

## What this does NOT do (PLAN_1 + section-route scope)

- No evolve/genetic search over lineups, and no automatic slot detection — PLAN_2 U9 (the
  run-author declares the slots).
- Mixed-radix fractions get a flagged balanced subsample, not an optimal design — PLAN_2 U10.
- `FIELD` stays the bracket size (32 or 48); `reconcile` always fits to it. Arbitrary
  dynamic sizes are not supported (the bracket math is fixed).
