import { expect, test } from "vitest";
import { createNewLotRecord } from "../src/app-core/methods/config-lot-crud.ts";
import { buildHydratedLotState, applyHydratedLotState } from "../src/app-core/methods/config-lot-loading.ts";
import { normalizeStoredLot } from "../src/app-core/shared/normalize-lot.ts";
import { toSyncLotDtos, normalizeSyncLotDto } from "../shared/contracts/sync-contracts.ts";
import { makeLot } from "./helpers/fixtures.ts";

const options = (expectedReceiptDate: string) => ({
  lots: [makeLot({ id: 1, expectedReceiptDate: "2026-12-10" })],
  currentLotId: 1,
  newLotName: "Preorder",
  newLotType: "bulk" as const,
  newLotCatalogSource: "none" as const,
  newLotWhatnotVertical: "tcg" as const,
  newLotExpectedReceiptDate: expectedReceiptDate,
  purchaseUiMode: "expert" as const,
  setup: { expectedReceiptDate: "2026-12-10", purchaseDate: "2026-10-25", boxPriceCost: 10 } as never,
  todayDate: "2026-10-25",
  generatedId: 2
});

test("new lot receipt date persists independently of the active lot and reloads as awaiting", () => {
  const created = createNewLotRecord(options("2027-01-15")).lot;
  expect(created.expectedReceiptDate).toBe("2027-01-15");

  const hydrated = buildHydratedLotState(created, {
    hasProAccess: true,
    todayDate: "2026-10-25",
    currentNewLotCatalogSource: "none"
  });
  expect(hydrated.expectedReceiptDate).toBe("2027-01-15");
  expect(buildHydratedLotState(makeLot({ expectedReceiptDate: "" }), {
    hasProAccess: true,
    todayDate: "2026-10-25",
    currentNewLotCatalogSource: "none"
  }).expectedReceiptDate).toBe("");
});

test("new lot defaults to received even when the currently selected lot is awaiting", () => {
  const created = createNewLotRecord(options("")).lot;
  expect(created.expectedReceiptDate).toBe("");
});

test("received state survives storage and sync DTO round trips, including clearing a prior date", () => {
  const legacy = makeLot();
  expect(Object.hasOwn(legacy, "expectedReceiptDate")).toBe(false);
  expect(normalizeStoredLot(legacy, "2026-10-25").expectedReceiptDate).toBe("");

  const awaiting = makeLot({ expectedReceiptDate: "2026-12-10" });
  expect(normalizeStoredLot(awaiting, "2026-10-25").expectedReceiptDate).toBe("2026-12-10");
  const cleared = normalizeStoredLot({ ...awaiting, expectedReceiptDate: "" }, "2026-10-25");
  expect(cleared.expectedReceiptDate).toBe("");
  const dto = toSyncLotDtos([cleared])[0];
  expect(dto?.expectedReceiptDate).toBe("");
  expect(normalizeSyncLotDto(dto)?.expectedReceiptDate).toBe("");
});

test("invalid receipt date is rejected without normalizing it to received", () => {
  expect(() => createNewLotRecord(options("2027-02-30"))).toThrow();
  expect(() => normalizeStoredLot(makeLot({ expectedReceiptDate: "not-a-date" }), "2026-10-25")).toThrow();
});

test("applying hydrated receipt date can clear an existing editor value", () => {
  const target = { expectedReceiptDate: "2026-12-10" } as never;
  const state = buildHydratedLotState(makeLot({ expectedReceiptDate: "" }), {
    hasProAccess: true,
    todayDate: "2026-10-25",
    currentNewLotCatalogSource: "none"
  });
  applyHydratedLotState(target, state);
  expect((target as { expectedReceiptDate: string }).expectedReceiptDate).toBe("");
});
