# Calcul8 Refactor Plan

## Top-Tier Remaining Refactors

- [ ] Refactor [sales-chart-config.ts](/f:/Sources/Calcul8/src/app-core/methods/sales-chart-config.ts):
  - extract shared chart axis/tick/tooltip builders
  - split the file by chart family
- [ ] Refactor [context.ts](/f:/Sources/Calcul8/src/app-core/context.ts):
  - reduce coupling by introducing narrower feature-local subset surfaces where they materially improve boundaries
- [ ] Refactor [SinglesConfigWindow.ts](/f:/Sources/Calcul8/src/components/windows/SinglesConfigWindow.ts) and [useSinglesCatalogSearch.ts](/f:/Sources/Calcul8/src/components/windows/singles/useSinglesCatalogSearch.ts):
  - break the window into smaller presentation/state helpers
  - split catalog search into smaller search/state/request modules
- [ ] Refactor [syncSnapshotRepository.ts](/f:/Sources/Calcul8/apps/api/src/lib/cosmos/syncSnapshotRepository.ts):
  - split snapshot/meta/preset access from entity import/export and sync diff/apply support

## Open Risks / Follow-ups

- The broad cleanup phase is complete enough to stop. Remaining work should stay focused on the top-tier hotspots above.
- Chart and portfolio behavior are sensitive to where data shaping occurs; extractions in that area need focused regression coverage.
- `AppContext` should be reduced through practical boundary cleanup before any deeper type-surface redesign.
