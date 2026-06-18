# 13. Forecasts are not facts

Date: 2026-06-17

## Status

Accepted

## Context

Sales screens now show richer practical KPIs: realized profit, break-even gap, revenue, cost, inventory progress, top buyer, last sale, and next full box. They also show what-if forecast scenarios for remaining inventory.

Those forecasts are useful, but they can look like actual recorded data if they are presented with the same hierarchy as sales history or dashboard metrics.

## Decision

Recorded sales facts and projection-only outcomes must stay visually and semantically separate.

Sales history, sales charts, portfolio totals, buyer KPIs, and inventory progress describe recorded or currently stored facts. What-if forecast cards describe hypothetical outcomes only and must be labeled as projections.

Forecast copy should make the condition explicit: the remaining inventory sells at the shown prices. Forecast values should not be counted as recorded revenue, realized profit, buyer totals, or sold progress.

## Consequences

The UI can use forecasts to guide decisions without implying those outcomes happened.

Tests should cover labels and computed data boundaries where forecasts are rendered near real metrics.

Future reports, exports, or dashboards must keep forecast fields separate from persisted sales facts.
