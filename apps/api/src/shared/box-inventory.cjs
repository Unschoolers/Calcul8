function invalid(error) {
  return { sealedBoxes: 0, openedBoxes: 0, loosePacks: 0, valid: false, error };
}

function calculateSealedBoxInventory(lot, sales) {
  const { boxesPurchased, packsPerBox } = lot;
  if (!Number.isSafeInteger(boxesPurchased) || boxesPurchased < 0 || !Number.isSafeInteger(packsPerBox) || packsPerBox <= 0) {
    return invalid("invalid_lot");
  }
  let boxesSold = 0;
  let packsConsumed = 0;
  for (const sale of sales) {
    if (!Number.isSafeInteger(sale.quantity) || sale.quantity < 0 || !Number.isSafeInteger(sale.packsCount) || sale.packsCount < 0) {
      return invalid("invalid_sale");
    }
    if (sale.type === "box") boxesSold += sale.quantity;
    else packsConsumed += sale.packsCount;
    if (!Number.isSafeInteger(boxesSold) || !Number.isSafeInteger(packsConsumed)) return invalid("invalid_sale");
  }
  const openedBoxes = Math.ceil(packsConsumed / packsPerBox);
  const sealedBoxes = boxesPurchased - boxesSold - openedBoxes;
  if (sealedBoxes < 0) return invalid("oversold");
  return { sealedBoxes, openedBoxes, loosePacks: openedBoxes * packsPerBox - packsConsumed, valid: true };
}
function deriveBoxOpeningEvents(lot, sales) {
  const initial = calculateSealedBoxInventory(lot, sales);
  if (!initial.valid) return { valid: false, events: [], error: initial.error };
  const sorted = [...sales].sort((a, b) => {
    const aTime = a.createdAt || a.date || "";
    const bTime = b.createdAt || b.date || "";
    return aTime.localeCompare(bTime) || (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  let sealed = lot.boxesPurchased;
  let loose = 0;
  const events = [];
  for (const sale of sorted) {
    if (sale.type === "box") { sealed -= sale.quantity; continue; }
    const needed = sale.packsCount;
    if (needed > loose) {
      const boxesOpened = Math.ceil((needed - loose) / lot.packsPerBox);
      sealed -= boxesOpened;
      loose += boxesOpened * lot.packsPerBox;
      events.push({ saleId: sale.id ?? null, boxesOpened,
        openedAt: sale.createdAt || sale.date || null,
        precision: sale.createdAt ? "instant" : sale.date ? "date" : "unknown" });
    }
    loose -= needed;
    if (sealed < 0) return { valid: false, events: [], error: "oversold" };
  }
  return { valid: true, events };
}
module.exports = { calculateSealedBoxInventory, deriveBoxOpeningEvents };
