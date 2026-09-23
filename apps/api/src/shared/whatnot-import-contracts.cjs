const SALE_TYPES = ["pack", "box", "rtyh", "wheel"];
const CONFIRMATION_SALE_TYPES = ["pack", "box", "rtyh"];
const TARGET_KINDS = ["new", "whatnot_mapping", "manual_candidate"];
const IMPORT_ACTIONS = ["create", "update_existing", "split_group", "skip"];

function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function number(value, field, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Whatnot import row has invalid '${field}'.`);
  return parsed;
}

function isValidDate(value) {
  const raw = text(value);
  if (!raw) return false;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  const calendarParts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : slash ? [Number(slash[3]), Number(slash[1]), Number(slash[2])] : null;
  if (calendarParts) {
    const [year, month, day] = calendarParts;
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return false;
  }
  return Number.isFinite(new Date(raw).getTime());
}

function normalizeWhatnotImportCandidate(value) {
  if (!isRecord(value)) throw new Error("Whatnot import row must be an object.");
  const externalOrderId = text(value.externalOrderId);
  const externalOrderItemId = text(value.externalOrderItemId);
  const title = text(value.title);
  const date = text(value.date);
  if (!externalOrderId) throw new Error("Whatnot import row is missing 'externalOrderId'.");
  if (!externalOrderItemId) throw new Error("Whatnot import row is missing 'externalOrderItemId'.");
  if (!title) throw new Error("Whatnot import row is missing 'title'.");
  if (!date) throw new Error("Whatnot import row is missing 'date'.");
  if (!isValidDate(date)) throw new Error("Whatnot import row has invalid 'date'.");
  const quantity = number(value.quantity, "quantity", 1);
  const price = number(value.price, "price", NaN);
  if (!Number.isFinite(price)) throw new Error("Whatnot import row has invalid 'price'.");
  const buyerShipping = number(value.buyerShipping, "buyerShipping", 0);
  const originalItemPrice = value.originalItemPrice == null || value.originalItemPrice === ""
    ? undefined : number(value.originalItemPrice, "originalItemPrice", undefined);
  const optional = ["externalSaleId", "externalAccountId", "listingTitle", "sku", "productCategory", "buyerName", "orderPlacedAt", "orderPlacedAtRaw", "orderStatus", "listingId", "productId", "variantId"];
  const result = {
    externalOrderId, externalOrderItemId,
    externalSaleId: text(value.externalSaleId) || `${externalOrderId}:${externalOrderItemId}`,
    title, quantity: Math.max(1, Math.floor(quantity)), price, buyerShipping, date,
    orderStatus: text(value.orderStatus) || "COMPLETED"
  };
  if (originalItemPrice !== undefined) result.originalItemPrice = originalItemPrice;
  for (const field of optional) {
    const cleaned = text(value[field]);
    if (cleaned) result[field] = cleaned;
  }
  return result;
}

function normalizeWhatnotImportDecision(value) {
  if (!isRecord(value)) return null;
  const saleType = CONFIRMATION_SALE_TYPES.includes(value.saleType) ? value.saleType : null;
  const targetKind = TARGET_KINDS.includes(value.targetKind) ? value.targetKind : null;
  const selectedImportAction = IMPORT_ACTIONS.includes(value.selectedImportAction) ? value.selectedImportAction : null;
  const rawLotId = Number(value.lotId);
  const lotId = Number.isFinite(rawLotId) && rawLotId > 0 ? Math.floor(rawLotId) : null;
  const targetSaleId = text(value.targetSaleId) || null;
  const packs = Number(value.packsCount);
  return {
    rowId: text(value.rowId), skip: value.skip === true,
    lotId, saleType,
    packsCount: Number.isFinite(packs) && packs > 0 ? Math.floor(packs) : null,
    targetKind, targetSaleId, selectedImportAction
  };
}

module.exports = { WHATNOT_SALE_TYPES: SALE_TYPES, WHATNOT_CONFIRMATION_SALE_TYPES: CONFIRMATION_SALE_TYPES,
  normalizeWhatnotImportCandidate, normalizeWhatnotImportDecision };
