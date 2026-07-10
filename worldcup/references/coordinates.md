# Coordinates — the design space, effects, and the coordinate view

Every candidate carries `coords` (its point in the design space). For `kind:'axes'` that is
a record `{ axisName: value }`; for `kind:'flat'` it is `{ flavor: name }` (one nominal
axis, no factorial structure). The tournament ignores `coords`; the report and the effects
analysis read it.

## Effects analysis (post-hoc, deterministic)

`computeEffects(pool, globalRating, DESIGN.resolved)` turns the same pairwise results into a
response surface. Returns `null` for `kind:'flat'`.

- **Main effects** — for each axis, the mean Elo of each value, the spread (max − min), and
  the best value. Axes are sorted by spread, so `mainEffects[0]` is the most influential knob.
- **Interactions** — for each binary axis pair, the 2-factor contrast
  `|(m11 − m10) − (m01 − m00)| / 2`. An additive design reports ~0; a real interaction is
  large. Top 6 returned. Binary pairs only: an axis with ≥3 values (a 3-level `length` axis,
  say) contributes main effects but no interaction term — keep length binary if you want its
  interactions.
- **Predicted optimum** — take the best value per axis and assemble the coordinate. If that
  point is in the field, `inField:true` and its label; otherwise it is a *synthesized*
  prediction (`inField:false`) that no actual candidate occupies.

`estimable` (from `reconcile`) rides along: `all-2way` (full / replicate), `main-effects`
(a clean fraction), or `none` (a lossy subsample). When `none`, the report labels the
effects "empirical, not fitted" — do not over-read them.

## Predicted-optimum playoff (optional, `PLAYOFF` config, default off)

When the predicted optimum is *not* in the field, the workflow can generate it (from the
stored fragments) and play it head-to-head against the bracket champion.
Result: `playoff = { beatChampion, markdown }`. This tells you whether the fitted optimum
actually beats what the bracket crowned — the interaction the bracket can miss. Off by
default because it adds agent calls. (Want it measured against the original too? Field the
original as one of the N — INCLUDE_BASE — and read their meeting off the bracket.)

## The coordinate view (report)

`renderReportV2` branches on `DESIGN.kind`:

- **flat** — no coordinate panel (nothing to plot on one nominal axis).
- **axes** — a coordinate panel with:
  - **parallel coordinates**: one vertical axis per knob, each candidate a polyline across
    its values; the champion is gold, the predicted optimum dashed.
  - **a 2-axis grid**: pick two axes, see the cells, shaded by mean rating.
  - **an axis-effects panel**: per-axis value bars (best value highlighted), the top
    interactions, the predicted optimum, and the estimability label.
- **sections** — the **lineup view**: the same panel as `axes`, reframed as positions ×
  players. Each vertical axis is a slot (position); each candidate lineup is a polyline
  across its chosen players; the champion is the gold "winning lineup" and the predicted
  optimum is the dashed "best XI" (top player per position). The effects bars are per-player
  marginal form (mean Elo), the explorer compares any two positions, and the cells shade by
  mean rating. It reuses the `axes` machinery because slot survivors *are* categorical axes
  (see design-pass.md) — so `coords`, effects, and estimability carry over, with one refinement:
  a slot that collapses to a single surviving player is a constant (it never varies across
  lineups), so it is excluded from the effects/estimability axes though it still rides in every
  assembled lineup.

Every entry in the coordinate view is clickable and opens the same info sheet as the
bracket (seed, rating, angle, match log, full text).
