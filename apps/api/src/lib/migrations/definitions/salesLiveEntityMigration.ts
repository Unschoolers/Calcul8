import {
  getEffectiveSyncSnapshot,
  getMigrationMarker,
  listSyncScopeKeys,
  setSyncScopeEntityModes,
  upsertLotLivePricing,
  upsertMigrationMarker,
  upsertSaleDocument,
  type UpsertMigrationMarkerInput
} from "../../cosmos";
import type { ApiConfig, MigrationMarkerDocument, SyncSnapshotDocument } from "../../../types";
import type { MigrationDefinition } from "../types";

type MigrationMarkerReader = (
  config: ApiConfig,
  migrationId: string
) => Promise<MigrationMarkerDocument | null>;

type MigrationMarkerWriter = (
  config: ApiConfig,
  input: UpsertMigrationMarkerInput
) => Promise<MigrationMarkerDocument>;

type ScopeKeyLister = (config: ApiConfig) => Promise<string[]>;
type SnapshotReader = (
  config: ApiConfig,
  scopeKey: string
) => Promise<SyncSnapshotDocument | null>;

type SaleWriter = typeof upsertSaleDocument;
type LivePricingWriter = typeof upsertLotLivePricing;
type ModeWriter = typeof setSyncScopeEntityModes;

const MIGRATION_ID = "sales_live_entity_migration";

function normalizeLotId(rawId: unknown): string {
  return String(rawId ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSaleMutationId(scopeKey: string, lotId: string, saleId: string): string {
  return `${MIGRATION_ID}:sale:${scopeKey}:${lotId}:${saleId}`;
}

function createLiveMutationId(scopeKey: string, lotId: string): string {
  return `${MIGRATION_ID}:live:${scopeKey}:${lotId}`;
}

function countSnapshot(snapshot: SyncSnapshotDocument | null): {
  lotCount: number;
  saleCount: number;
  livePricingCount: number;
  skippedSales: number;
} {
  if (!snapshot) {
    return {
      lotCount: 0,
      saleCount: 0,
      livePricingCount: 0,
      skippedSales: 0
    };
  }

  let saleCount = 0;
  let skippedSales = 0;
  const lots = Array.isArray(snapshot.lots) ? snapshot.lots : [];
  for (const lot of lots) {
    if (!isRecord(lot)) continue;
    const lotId = normalizeLotId(lot.id);
    if (!lotId) continue;
    const lotSales = Array.isArray(snapshot.salesByLot[lotId]) ? snapshot.salesByLot[lotId] : [];
    for (const sale of lotSales) {
      const saleId = normalizeLotId(isRecord(sale) ? sale.id : "");
      if (!saleId) {
        skippedSales += 1;
        continue;
      }
      saleCount += 1;
    }
  }

  return {
    lotCount: lots.length,
    saleCount,
    livePricingCount: lots.length,
    skippedSales
  };
}

export function createSalesLiveEntityMigration(
  readMarker: MigrationMarkerReader = getMigrationMarker,
  writeMarker: MigrationMarkerWriter = upsertMigrationMarker,
  listScopes: ScopeKeyLister = listSyncScopeKeys,
  readSnapshot: SnapshotReader = getEffectiveSyncSnapshot,
  writeSale: SaleWriter = upsertSaleDocument,
  writeLivePricing: LivePricingWriter = upsertLotLivePricing,
  writeModes: ModeWriter = setSyncScopeEntityModes
): MigrationDefinition {
  return {
    id: MIGRATION_ID,
    description: "Migrates snapshot sales and saved live pricing into entity documents.",
    rerunPolicy: "once",
    async analyze(context) {
      const marker = await readMarker(context.config, MIGRATION_ID);
      const scopeKeys = await listScopes(context.config);
      let scopeCount = 0;
      let lotCount = 0;
      let saleCount = 0;
      let livePricingCount = 0;
      let skippedSales = 0;

      for (const scopeKey of scopeKeys) {
        const snapshot = await readSnapshot(context.config, scopeKey);
        const counts = countSnapshot(snapshot);
        if (counts.lotCount === 0 && counts.saleCount === 0) {
          continue;
        }
        scopeCount += 1;
        lotCount += counts.lotCount;
        saleCount += counts.saleCount;
        livePricingCount += counts.livePricingCount;
        skippedSales += counts.skippedSales;
      }

      return {
        migrationId: MIGRATION_ID,
        alreadyApplied: marker != null,
        markerExists: marker != null,
        previousRunId: marker?.lastRunId ?? null,
        scopeCount,
        lotCount,
        saleCount,
        livePricingCount,
        skippedSales,
        analyzedAt: new Date().toISOString()
      };
    },
    async apply(context, plan) {
      const scopeKeys = await listScopes(context.config);
      let migratedScopes = 0;
      let migratedSales = 0;
      let migratedLivePricing = 0;
      let skippedSales = 0;

      for (const scopeKey of scopeKeys) {
        const snapshot = await readSnapshot(context.config, scopeKey);
        if (!snapshot) continue;

        const lots = Array.isArray(snapshot.lots) ? snapshot.lots : [];
        if (lots.length === 0 && Object.keys(snapshot.salesByLot ?? {}).length === 0) {
          continue;
        }

        let wroteScope = false;
        for (const lot of lots) {
          if (!isRecord(lot)) continue;
          const lotId = normalizeLotId(lot.id);
          if (!lotId) continue;

          const liveSpotPrice = Number(lot.spotPrice) || 0;
          const liveBoxPriceSell = Number(lot.boxPriceSell) || 0;
          const livePackPrice = Number(lot.packPrice) || 0;

          await writeLivePricing(context.config, {
            scopeKey,
            lotId,
            liveSpotPrice,
            liveBoxPriceSell,
            livePackPrice,
            updatedBy: context.triggeredByUserId,
            mutationId: createLiveMutationId(scopeKey, lotId)
          });
          migratedLivePricing += 1;
          wroteScope = true;

          const lotSales = Array.isArray(snapshot.salesByLot[lotId]) ? snapshot.salesByLot[lotId] : [];
          for (const sale of lotSales) {
            const saleId = normalizeLotId(isRecord(sale) ? sale.id : "");
            if (!saleId) {
              skippedSales += 1;
              continue;
            }

            await writeSale(context.config, {
              scopeKey,
              lotId,
              saleId,
              sale,
              updatedBy: context.triggeredByUserId,
              mutationId: createSaleMutationId(scopeKey, lotId, saleId)
            });
            migratedSales += 1;
            wroteScope = true;
          }
        }

        if (wroteScope) {
          await writeModes(context.config, {
            scopeKey,
            updatedAt: new Date().toISOString(),
            salesMode: "entity",
            livePricingMode: "entity"
          });
          migratedScopes += 1;
        }
      }

      const result = {
        migrationId: MIGRATION_ID,
        migratedScopes,
        migratedSales,
        migratedLivePricing,
        skippedSales,
        previousMarkerExists: Boolean((plan as { markerExists?: unknown }).markerExists)
      };

      const marker = await writeMarker(context.config, {
        migrationId: MIGRATION_ID,
        runId: context.runId,
        triggeredByUserId: context.triggeredByUserId,
        note: context.note,
        result
      });

      return {
        ...result,
        markerId: marker.id,
        markerUpdatedAt: marker.updatedAt
      };
    }
  };
}

export const salesLiveEntityMigration = createSalesLiveEntityMigration();
