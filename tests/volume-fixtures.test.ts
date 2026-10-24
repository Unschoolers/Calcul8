import { describe, expect, it } from "vitest";
import { createDenseVolumeFixture } from "./helpers/volume-fixtures.ts";

describe("createDenseVolumeFixture", () => {
  it("returns a valid 1,000-item singles lot with linked sales and balanced stock", () => {
    const { lot, sales, targets } = createDenseVolumeFixture();
    const items = lot.singlesPurchases ?? [];
    const itemsById = new Map(items.map((item) => [item.id, item]));

    expect(lot.lotType).toBe("singles");
    expect(lot.singlesCatalogSource).toBe("none");
    expect(lot.currency).toBe("CAD");
    expect(lot.sellingCurrency).toBe("CAD");
    expect(items).toHaveLength(1_000);
    expect(sales).toHaveLength(1_000);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(new Set(sales.map((sale) => sale.id)).size).toBe(sales.length);

    const soldByItem = new Map<number, number>();
    for (const sale of sales) {
      expect(sale.priceIsTotal).toBe(true);
      expect(sale.price).toBeGreaterThan(0);
      expect(sale.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${sale.date}T00:00:00.000Z`).toISOString().slice(0, 10)).toBe(sale.date);
      expect(sale.date >= lot.purchaseDate).toBe(true);
      expect(sale.singlesItems).toHaveLength(1);
      const line = sale.singlesItems?.[0];
      expect(line).toBeDefined();
      expect(itemsById.has(line!.singlesPurchaseEntryId!)).toBe(true);
      expect(line!.quantity).toBeGreaterThan(0);
      expect(line!.price).toBeGreaterThan(0);
      soldByItem.set(line!.singlesPurchaseEntryId!, (soldByItem.get(line!.singlesPurchaseEntryId!) ?? 0) + line!.quantity);
    }

    let exhausted = 0;
    let available = 0;
    for (const item of items) {
      const remaining = item.quantity - (soldByItem.get(item.id) ?? 0);
      expect(remaining).toBeGreaterThanOrEqual(0);
      if (remaining === 0) exhausted += 1;
      else available += 1;
    }
    expect(exhausted).toBe(500);
    expect(available).toBe(500);

    const orderedByDate = [...sales].sort((left, right) => left.date.localeCompare(right.date));
    const targetIndex = orderedByDate.findIndex((sale) => sale.id === targets.oldestHighestPriceSaleId);
    expect(orderedByDate[targetIndex]?.price).toBe(Math.max(...sales.map((sale) => sale.price)));
    expect(targetIndex).toBeLessThan(sales.length - 80);
    expect(orderedByDate.at(-1)?.id).toBe(targets.mostRecentSaleId);
    expect(items.at(-1)?.id).toBe(targets.finalItemId);
    expect(items.at(-1)?.item).toContain("Recherche ciblée");
  });

  it("is reproducible while returning independent mutable data on every call", () => {
    const first = createDenseVolumeFixture();
    const second = createDenseVolumeFixture();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.lot).not.toBe(second.lot);
    expect(first.lot.singlesPurchases).not.toBe(second.lot.singlesPurchases);
    expect(first.sales).not.toBe(second.sales);
    expect(first.sales[0]).not.toBe(second.sales[0]);
    expect(first.sales[0]?.singlesItems).not.toBe(second.sales[0]?.singlesItems);
  });
});
