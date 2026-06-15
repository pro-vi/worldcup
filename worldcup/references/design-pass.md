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
| `M < N` | `replicate` (repeat cells `⌈N/M⌉×`, tagged for label uniqueness) | all-2way |
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

## What this does NOT do (PLAN_1 scope)

- No section / recombination route (`kind:'sections'`) — that is PLAN_2.
- Mixed-radix fractions get a flagged balanced subsample, not an optimal design — PLAN_2 U10.
- `FIELD` stays the bracket size (32 or 48); `reconcile` always fits to it. Arbitrary
  dynamic sizes are not supported (the bracket math is fixed).
