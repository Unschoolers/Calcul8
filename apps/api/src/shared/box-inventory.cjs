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
module.exports = { calculateSealedBoxInventory };
