function isSyncEntityRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.map((entry) => cleanString(entry)).filter((entry) => entry != null);
  return cleaned.length > 0 ? cleaned : [];
}

function normalizeEntityId(value) {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) ? id : null;
}

function normalizeNonNegativeNumber(value) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeNonNegativeInteger(value) {
  const parsed = normalizeNonNegativeNumber(value);
  return parsed == null ? undefined : Math.floor(parsed);
}

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeCurrencyCode(value) {
  return value === "CAD" || value === "USD" ? value : undefined;
}

function normalizeLotType(value) {
  return value === "bulk" || value === "singles" ? value : undefined;
}

function normalizeSinglesCatalogSource(value) {
  return value === "ua" || value === "pokemon" || value === "none" ? value : undefined;
}

function normalizeCostInputMode(value) {
  return value === "perBox" || value === "total" ? value : undefined;
}

function normalizeFeeProfilePreset(value) {
  return value === "whatnot" || value === "none" ? value : undefined;
}

function normalizeAdditionalFeeAppliesTo(value) {
  return value === "sale_only" || value === "sale_plus_shipping" ? value : undefined;
}

function normalizeOptionalSyncId(value) {
  if (value == null) return null;
  const id = normalizeEntityId(value);
  return id == null || id === 0 ? null : id;
}

function normalizeSyncIdArray(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  const ids = [];
  for (const entry of value) {
    const id = normalizeOptionalSyncId(entry);
    if (id == null || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeSyncSinglesPurchaseDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeOptionalSyncId(value.id);
  if (id == null) return null;
  const item = cleanString(value.item);
  if (!item) return null;
  const entry = { id, item };
  const cardNumber = cleanString(value.cardNumber);
  if (cardNumber) entry.cardNumber = cardNumber;
  const externalSku = cleanString(value.externalSku);
  if (externalSku) entry.externalSku = externalSku;
  const image = cleanString(value.image);
  if (image) entry.image = image;
  const condition = cleanString(value.condition);
  if (condition) entry.condition = condition;
  const language = cleanString(value.language);
  if (language) entry.language = language;
  const cost = normalizeNonNegativeNumber(value.cost);
  if (cost != null) entry.cost = cost;
  const currency = normalizeCurrencyCode(value.currency);
  if (currency) entry.currency = currency;
  const quantity = normalizeNonNegativeInteger(value.quantity);
  if (quantity != null) entry.quantity = quantity;
  const marketValue = normalizeNonNegativeNumber(value.marketValue);
  if (marketValue != null) entry.marketValue = marketValue;
  const marketValueCurrency = normalizeCurrencyCode(value.marketValueCurrency);
  if (marketValueCurrency) entry.marketValueCurrency = marketValueCurrency;
  return entry;
}

function toSyncSinglesPurchaseDtos(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSyncSinglesPurchaseDto(entry)).filter((entry) => entry != null);
}

function normalizeSyncLotDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeEntityId(value.id);
  if (id == null) return null;
  const lot = { id };
  const name = cleanString(value.name);
  if (name) lot.name = name;
  const lotType = normalizeLotType(value.lotType);
  if (lotType) lot.lotType = lotType;
  const singlesCatalogSource = normalizeSinglesCatalogSource(value.singlesCatalogSource);
  if (singlesCatalogSource) lot.singlesCatalogSource = singlesCatalogSource;
  const singlesPurchases = toSyncSinglesPurchaseDtos(value.singlesPurchases);
  if (singlesPurchases.length > 0) lot.singlesPurchases = singlesPurchases;
  for (const field of ["externalSku", "purchaseDate", "createdAt"]) {
    const cleaned = cleanString(value[field]);
    if (cleaned) lot[field] = cleaned;
  }
  for (const field of [
    "boxPriceCost",
    "boxesPurchased",
    "packsPerBox",
    "spotsPerBox",
    "purchaseShippingCost",
    "purchaseTaxPercent",
    "sellingTaxPercent",
    "sellingShippingPerOrder",
    "spotPrice",
    "boxPriceSell",
    "packPrice",
    "targetProfitPercent",
    "platformFeePercent",
    "additionalFeePercent",
    "fixedFeePerOrder",
    "exchangeRate",
    "taxRatePercent"
  ]) {
    const parsed = normalizeNonNegativeNumber(value[field]);
    if (parsed != null) lot[field] = parsed;
  }
  const currency = normalizeCurrencyCode(value.currency);
  if (currency) lot.currency = currency;
  const sellingCurrency = normalizeCurrencyCode(value.sellingCurrency);
  if (sellingCurrency) lot.sellingCurrency = sellingCurrency;
  const costInputMode = normalizeCostInputMode(value.costInputMode);
  if (costInputMode) lot.costInputMode = costInputMode;
  const feeProfilePreset = normalizeFeeProfilePreset(value.feeProfilePreset);
  if (feeProfilePreset) lot.feeProfilePreset = feeProfilePreset;
  const additionalFeeAppliesTo = normalizeAdditionalFeeAppliesTo(value.additionalFeeAppliesTo);
  if (additionalFeeAppliesTo) lot.additionalFeeAppliesTo = additionalFeeAppliesTo;
  const includeTax = normalizeBoolean(value.includeTax);
  if (includeTax != null) lot.includeTax = includeTax;
  const isComplete = normalizeBoolean(value.isComplete);
  if (isComplete != null) lot.isComplete = isComplete;
  return lot;
}

function toSyncLotDtos(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSyncLotDto(entry)).filter((entry) => entry != null);
}

function normalizeSyncSaleLineDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const quantity = normalizeNonNegativeInteger(value.quantity);
  if (quantity == null || quantity <= 0) return null;
  const line = { quantity, price: normalizeNonNegativeNumber(value.price) ?? 0 };
  const singlesPurchaseEntryId = normalizeOptionalSyncId(value.singlesPurchaseEntryId);
  if (singlesPurchaseEntryId != null) line.singlesPurchaseEntryId = singlesPurchaseEntryId;
  return line;
}

function normalizeSyncSaleType(value) {
  return value === "box" || value === "rtyh" || value === "wheel" || value === "pack" ? value : undefined;
}

function normalizeSyncSaleDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeOptionalSyncId(value.id);
  if (id == null) return null;
  const sale = { id };
  const type = normalizeSyncSaleType(value.type);
  if (type) sale.type = type;
  const quantity = normalizeNonNegativeInteger(value.quantity);
  if (quantity != null) sale.quantity = quantity;
  const packsCount = normalizeNonNegativeInteger(value.packsCount);
  if (packsCount != null) sale.packsCount = packsCount;
  const singlesPurchaseEntryId = normalizeOptionalSyncId(value.singlesPurchaseEntryId);
  if (singlesPurchaseEntryId != null) sale.singlesPurchaseEntryId = singlesPurchaseEntryId;
  if (Array.isArray(value.singlesItems)) {
    const singlesItems = value.singlesItems.map((entry) => normalizeSyncSaleLineDto(entry)).filter((entry) => entry != null);
    if (singlesItems.length > 0) sale.singlesItems = singlesItems;
  }
  const price = normalizeNonNegativeNumber(value.price);
  if (price != null) sale.price = price;
  if (value.priceIsTotal === true) sale.priceIsTotal = true;
  const customer = cleanString(value.customer);
  if (customer) sale.customer = customer;
  const memo = cleanString(value.memo);
  if (memo) sale.memo = memo;
  const buyerShipping = normalizeNonNegativeNumber(value.buyerShipping);
  if (buyerShipping != null) sale.buyerShipping = buyerShipping;
  const date = cleanString(value.date);
  if (date) sale.date = date;
  const version = normalizeNonNegativeInteger(value.version);
  if (version != null) sale.version = version;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) sale.updatedAt = updatedAt;
  const updatedBy = cleanString(value.updatedBy);
  if (updatedBy) sale.updatedBy = updatedBy;
  const mutationId = cleanString(value.mutationId);
  if (mutationId) sale.mutationId = mutationId;
  const linkedWheelId = normalizeOptionalSyncId(value.linkedWheelId);
  if (linkedWheelId != null) sale.linkedWheelId = linkedWheelId;
  const winningTierId = cleanString(value.winningTierId);
  if (winningTierId) sale.winningTierId = winningTierId;
  const costOfWinningTier = normalizeNonNegativeNumber(value.costOfWinningTier);
  if (costOfWinningTier != null) sale.costOfWinningTier = costOfWinningTier;
  const netRevenue = normalizeNonNegativeNumber(value.netRevenue);
  if (netRevenue != null) sale.netRevenue = netRevenue;
  return sale;
}

function toSyncSaleDtos(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSyncSaleDto(entry)).filter((entry) => entry != null);
}

function toSyncSalesByLotDto(value) {
  if (!isSyncEntityRecord(value)) return {};
  const salesByLot = {};
  for (const [lotId, sales] of Object.entries(value)) {
    const normalizedLotId = normalizeOptionalSyncId(lotId);
    if (normalizedLotId == null || !Array.isArray(sales)) continue;
    salesByLot[String(normalizedLotId)] = toSyncSaleDtos(sales);
  }
  return salesByLot;
}

function normalizeTierDeductionType(value) {
  return value === "singles" || value === "none" || value === "packs" ? value : undefined;
}

function normalizeSyncWheelTierDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const id = cleanString(value.id);
  if (!id) return null;
  const tier = { id };
  const label = cleanString(value.label);
  if (label) tier.label = label;
  const color = cleanString(value.color);
  if (color) tier.color = color;
  const chancePercent = normalizeNonNegativeNumber(value.chancePercent);
  if (chancePercent != null) tier.chancePercent = chancePercent;
  const slots = normalizeNonNegativeInteger(value.slots);
  if (slots != null) tier.slots = slots;
  const costPerTier = normalizeNonNegativeNumber(value.costPerTier);
  if (costPerTier != null) tier.costPerTier = costPerTier;
  const packsCount = normalizeNonNegativeInteger(value.packsCount);
  if (packsCount != null) tier.packsCount = packsCount;
  const deductionType = normalizeTierDeductionType(value.deductionType);
  if (deductionType) tier.deductionType = deductionType;
  const sets = cleanStringArray(value.sets);
  if (sets) tier.sets = sets;
  const boundLotId = normalizeOptionalSyncId(value.boundLotId);
  if (boundLotId != null) tier.boundLotId = boundLotId;
  const boundLotIds = normalizeSyncIdArray(value.boundLotIds);
  if (boundLotIds) {
    tier.boundLotIds = boundLotIds.length > 0 ? boundLotIds : (boundLotId != null ? [boundLotId] : []);
  } else if (boundLotId != null) {
    tier.boundLotIds = [boundLotId];
  }
  const boundSinglesId = normalizeOptionalSyncId(value.boundSinglesId);
  if (boundSinglesId != null) tier.boundSinglesId = boundSinglesId;
  if (value.isChase === true) tier.isChase = true;
  const celebrationEmoji = cleanString(value.celebrationEmoji);
  if (celebrationEmoji) tier.celebrationEmoji = celebrationEmoji;
  return tier;
}

function normalizeSyncWheelConfigDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeOptionalSyncId(value.id);
  if (id == null) return null;
  if (value.tiers != null && !Array.isArray(value.tiers)) return null;
  const config = { id };
  const name = cleanString(value.name);
  if (name) config.name = name;
  const spinPrice = normalizeNonNegativeNumber(value.spinPrice);
  if (spinPrice != null) config.spinPrice = spinPrice;
  const targetMargin = normalizeNonNegativeNumber(value.targetMargin);
  if (targetMargin != null) config.targetMargin = targetMargin;
  if (value.gameType === "grid" || value.gameType === "wheel") config.gameType = value.gameType;
  const outcomeCount = normalizeNonNegativeInteger(value.outcomeCount);
  if (outcomeCount != null) config.outcomeCount = outcomeCount;
  const gridCellCount = normalizeNonNegativeInteger(value.gridCellCount);
  if (gridCellCount != null) config.gridCellCount = gridCellCount;
  if (Array.isArray(value.tiers)) {
    config.tiers = value.tiers.map((entry) => normalizeSyncWheelTierDto(entry)).filter((entry) => entry != null);
  }
  const createdAt = cleanString(value.createdAt);
  if (createdAt) config.createdAt = createdAt;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) config.updatedAt = updatedAt;
  return config;
}

function toSyncWheelConfigDtos(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSyncWheelConfigDto(entry)).filter((entry) => entry != null);
}

function normalizeSyncLivePricingDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const livePackPrice = normalizeNonNegativeNumber(value.livePackPrice);
  const liveBoxPriceSell = normalizeNonNegativeNumber(value.liveBoxPriceSell);
  const liveSpotPrice = normalizeNonNegativeNumber(value.liveSpotPrice);
  if (livePackPrice == null || liveBoxPriceSell == null || liveSpotPrice == null) return null;
  const livePricing = { livePackPrice, liveBoxPriceSell, liveSpotPrice };
  const version = normalizeNonNegativeInteger(value.version);
  if (version != null) livePricing.version = version;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) livePricing.updatedAt = updatedAt;
  const updatedBy = cleanString(value.updatedBy);
  if (updatedBy) livePricing.updatedBy = updatedBy;
  const mutationId = cleanString(value.mutationId);
  if (mutationId) livePricing.mutationId = mutationId;
  return livePricing;
}

function normalizeSyncMetadataDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const rawVersion = Number(value.version ?? 0);
  const metadata = { version: Number.isFinite(rawVersion) ? rawVersion : 0 };
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) metadata.updatedAt = updatedAt;
  metadata.activeWheelConfigId = normalizeOptionalSyncId(value.activeWheelConfigId);
  if (value.salesMode === "snapshot" || value.salesMode === "entity") metadata.salesMode = value.salesMode;
  if (value.livePricingMode === "lot_defaults" || value.livePricingMode === "entity") metadata.livePricingMode = value.livePricingMode;
  return metadata;
}

function normalizeLimitedString(value, maxLength) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.slice(0, maxLength) : "";
}

function normalizeNonNegativeFloor(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSyncGameFairnessEntryDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  return {
    spinNumber: normalizeNonNegativeFloor(value.spinNumber),
    label: normalizeLimitedString(value.label, 160),
    color: normalizeLimitedString(value.color, 40),
    hash: normalizeLimitedString(value.hash, 256),
    seed: normalizeLimitedString(value.seed, 256),
    clientSeed: normalizeLimitedString(value.clientSeed, 256) || undefined,
    verificationUrl: normalizeLimitedString(value.verificationUrl, 512) || undefined,
    algorithm: normalizeLimitedString(value.algorithm, 80) || undefined,
    timestamp: normalizeNonNegativeFloor(value.timestamp)
  };
}

function normalizeSyncGameTallyEntryDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const tierId = normalizeLimitedString(value.tierId, 120);
  if (!tierId) return null;
  return {
    tierId,
    label: normalizeLimitedString(value.label, 160),
    color: normalizeLimitedString(value.color, 40),
    count: normalizeNonNegativeFloor(value.count)
  };
}

function normalizeSyncGameGridRevealDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const label = normalizeLimitedString(value.label, 160);
  const tier = normalizeLimitedString(value.tier, 120);
  return {
    cellIndex: normalizeNonNegativeFloor(value.cellIndex),
    slotIndex: normalizeNonNegativeFloor(value.slotIndex),
    label,
    color: normalizeLimitedString(value.color, 40),
    tier,
    spinNumber: normalizeNonNegativeFloor(value.spinNumber),
    timestamp: normalizeNonNegativeFloor(value.timestamp)
  };
}

function normalizeSyncInventoryIssueDto(value) {
  if (!isSyncEntityRecord(value)) return null;
  const issue = {
    slotName: normalizeLimitedString(value.slotName, 160),
    slotColor: normalizeLimitedString(value.slotColor, 40),
    slotCost: normalizeNonNegativeNumber(value.slotCost) ?? 0,
    slotTier: normalizeLimitedString(value.slotTier, 120),
    slotPacksCount: normalizeNonNegativeInteger(value.slotPacksCount) ?? 0,
    slotDeductionType: normalizeTierDeductionType(value.slotDeductionType) ?? "none",
    slotIndex: normalizeNonNegativeInteger(value.slotIndex) ?? 0,
    selectedLotId: normalizeOptionalSyncId(value.selectedLotId),
    spinNumber: normalizeNonNegativeInteger(value.spinNumber) ?? 0,
    slotSinglesId: normalizeOptionalSyncId(value.slotSinglesId)
  };
  const candidateLotIds = normalizeSyncIdArray(value.candidateLotIds);
  if (candidateLotIds && candidateLotIds.length > 0) {
    issue.candidateLotIds = candidateLotIds;
  }
  if (value.requiresLotSelection === true) {
    issue.requiresLotSelection = true;
  }
  return issue;
}

function normalizeSyncGameSessionDto(value, fallbackUpdatedAt = Date.now()) {
  const raw = isSyncEntityRecord(value) ? value : {};
  const pendingInventoryIssues = Array.isArray(raw.wheelPendingInventoryIssues)
    ? raw.wheelPendingInventoryIssues.slice(0, 500).map((entry) => normalizeSyncInventoryIssueDto(entry)).filter((entry) => entry != null)
    : [];
  const skippedDeductions = Array.isArray(raw.wheelSkippedDeductions)
    ? raw.wheelSkippedDeductions.slice(0, 500).map((entry) => normalizeSyncInventoryIssueDto(entry)).filter((entry) => entry != null)
    : [];
  return {
    wheelConfigs: toSyncWheelConfigDtos(raw.wheelConfigs).slice(0, 100),
    activeWheelConfigId: normalizeOptionalSyncId(raw.activeWheelConfigId),
    wheelTotalSpins: normalizeNonNegativeFloor(raw.wheelTotalSpins),
    wheelSpinCounts: Array.isArray(raw.wheelSpinCounts) ? raw.wheelSpinCounts.map((entry) => normalizeNonNegativeFloor(entry)) : [],
    wheelSessionNetRevenue: raw.wheelSessionNetRevenue == null ? null : normalizeFiniteNumber(raw.wheelSessionNetRevenue, 0),
    wheelSessionCostAdjustment: normalizeFiniteNumber(raw.wheelSessionCostAdjustment, 0),
    wheelFairnessHistory: Array.isArray(raw.wheelFairnessHistory)
      ? raw.wheelFairnessHistory.slice(-20).map((entry) => normalizeSyncGameFairnessEntryDto(entry)).filter((entry) => entry != null)
      : [],
    wheelChaseTallyHistory: Array.isArray(raw.wheelChaseTallyHistory)
      ? raw.wheelChaseTallyHistory.slice(0, 200).map((entry) => normalizeSyncGameTallyEntryDto(entry)).filter((entry) => entry != null)
      : [],
    wheelGridLayoutSeed: normalizeLimitedString(raw.wheelGridLayoutSeed, 160),
    wheelPreviewGridLayoutSeed: normalizeLimitedString(raw.wheelPreviewGridLayoutSeed, 160),
    wheelGridReveals: Array.isArray(raw.wheelGridReveals)
      ? raw.wheelGridReveals.slice(0, 500).map((entry) => normalizeSyncGameGridRevealDto(entry)).filter((entry) => entry != null)
      : [],
    wheelPreviewGridReveals: Array.isArray(raw.wheelPreviewGridReveals)
      ? raw.wheelPreviewGridReveals.slice(0, 500).map((entry) => normalizeSyncGameGridRevealDto(entry)).filter((entry) => entry != null)
      : [],
    wheelCurrentAngle: normalizeFiniteNumber(raw.wheelCurrentAngle, 0),
    wheelLastResult: normalizeLimitedString(raw.wheelLastResult, 200),
    wheelLastResultColor: normalizeLimitedString(raw.wheelLastResultColor, 80),
    wheelSessionUpdatedAt: normalizeNonNegativeFloor(raw.wheelSessionUpdatedAt, fallbackUpdatedAt),
    wheelPendingInventoryIssues: pendingInventoryIssues.length > 0 ? pendingInventoryIssues : skippedDeductions,
    wheelSkippedDeductions: skippedDeductions
  };
}

function hasValidSalesByLotCollection(value) {
  return isSyncEntityRecord(value)
    && Object.entries(value).every(([lotId, sales]) => normalizeOptionalSyncId(lotId) != null && Array.isArray(sales) && sales.every((entry) => normalizeSyncSaleDto(entry) != null));
}

function hasValidWheelConfigCollection(value) {
  return Array.isArray(value) && value.every((entry) => normalizeSyncWheelConfigDto(entry) != null);
}

function parseSyncSnapshotDto(value) {
  const rawSnapshot = isSyncEntityRecord(value) ? value : {};
  const rawVersion = Number(rawSnapshot.version ?? 0);
  const snapshot = {
    lots: toSyncLotDtos(rawSnapshot.lots),
    salesByLot: toSyncSalesByLotDto(rawSnapshot.salesByLot),
    wheelConfigs: toSyncWheelConfigDtos(rawSnapshot.wheelConfigs),
    activeWheelConfigId: normalizeOptionalSyncId(rawSnapshot.activeWheelConfigId),
    version: Number.isFinite(rawVersion) ? rawVersion : 0,
    updatedAt: typeof rawSnapshot.updatedAt === "string" || rawSnapshot.updatedAt === null ? rawSnapshot.updatedAt : undefined
  };
  return {
    snapshot,
    hasRequiredCollections: hasValidSalesByLotCollection(rawSnapshot.salesByLot) && hasValidWheelConfigCollection(rawSnapshot.wheelConfigs)
  };
}

module.exports = {
  isSyncEntityRecord,
  normalizeSyncGameSessionDto,
  normalizeSyncMetadataDto,
  normalizeOptionalSyncId,
  normalizeSyncLivePricingDto,
  normalizeSyncLotDto,
  normalizeSyncSaleDto,
  normalizeSyncSinglesPurchaseDto,
  normalizeSyncWheelConfigDto,
  parseSyncSnapshotDto,
  toSyncLotDtos,
  toSyncSaleDtos,
  toSyncSinglesPurchaseDtos,
  toSyncSalesByLotDto,
  toSyncWheelConfigDtos
};
