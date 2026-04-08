import { CosmosClient, type Container } from "@azure/cosmos";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

type JsonRecord = Record<string, unknown>;

type CardSyncDoc = JsonRecord & {
  id: string;
  pk: string;
  kind: "card";
  game: string;
};

type PokemonSetSummary = {
  id: string;
  name: string;
  series: string;
  printedTotal: number | null;
  total: number | null;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function toTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarketPrice(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  if (parsed < 0) return null;
  return parsed;
}

function loadEnvFiles(): void {
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(sourceDir, "..");
  const workspaceRoot = path.resolve(projectRoot, "..");
  const candidates = [
    path.join(projectRoot, ".env.local"),
    path.join(projectRoot, ".env"),
    path.join(workspaceRoot, "CardSync/.env.local"),
    path.join(workspaceRoot, "CardSync/.env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env")
  ];

  for (const candidate of candidates) {
    dotenv.config({ path: candidate, override: false });
  }
}

// Load local env files for CLI usage.
loadEnvFiles();

export type FetchUnionArenaCardsOptions = {
  limit?: number;
  initialOffset?: number;
  publishedOnly?: boolean;
  logProgress?: boolean;
  name?: string;
  series?: string;
  seriesName?: string;
  abbreviation?: string;
};

export type ImportCardsToCosmosOptions = {
  game: string;
  databaseId: string;
  containerId: string;
  batchSize?: number;
  concurrency?: number;
  dryRun?: boolean;
  missingOnly?: boolean;
  pokemonSetsById?: Map<string, PokemonSetSummary>;
};

type FilterJsonRowsOptions = {
  contains?: string;
  series?: string;
  seriesName?: string;
  abbreviation?: string;
};

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function toBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function normalizeFilterText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toIlikePattern(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return `ilike.%${trimmed}%`;
}

function normalizeSecret(value: string | undefined): string {
  let normalized = (value ?? "").trim();
  if (
    (normalized.startsWith("\"") && normalized.endsWith("\""))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function getExburstHeaders(): Record<string, string> {
  const apikey = normalizeSecret(process.env.EXBURST_API_KEY);
  const bearerRaw = normalizeSecret(process.env.EXBURST_BEARER_TOKEN) || apikey;
  const bearer = bearerRaw.replace(/^Bearer\s+/i, "").trim();
  const userAgent = (process.env.EXBURST_USER_AGENT
    ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36")
    .trim();

  if (!apikey || !bearer) {
    throw new Error("Missing EXBURST_API_KEY / EXBURST_BEARER_TOKEN.");
  }

  return {
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-CA,en;q=0.9,fr-CA;q=0.8,fr;q=0.7,en-GB;q=0.6,en-US;q=0.5",
    "accept-profile": "public",
    "apikey": apikey,
    "authorization": `Bearer ${bearer}`,
    "dnt": "1",
    "origin": "https://exburst.dev",
    "priority": "u=1, i",
    "referer": "https://exburst.dev/",
    "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": userAgent,
    "x-client-info": "supabase-js-web"
  };
}

export async function fetchUnionArenaCards(
  options: FetchUnionArenaCardsOptions = {}
): Promise<JsonRecord[]> {
  const baseUrl = (process.env.EXBURST_API_BASE ?? "https://auth.exburst.dev").replace(/\/+$/, "");
  const limit = Math.max(1, Math.floor(options.limit ?? 1000));
  let offset = Math.max(0, Math.floor(options.initialOffset ?? 0));
  const publishedOnly = options.publishedOnly ?? true;
  const logProgress = options.logProgress ?? true;
  const headers = getExburstHeaders();
  const nameFilter = toIlikePattern(options.name);
  const seriesFilter = toIlikePattern(options.series);
  const seriesNameFilter = toIlikePattern(options.seriesName);
  const abbreviationFilter = toIlikePattern(options.abbreviation);

  const selectFields = [
    "name",
    "color",
    "attributeData",
    "effectData",
    "bpData",
    "originalId",
    "cardNo",
    "rarity",
    "image",
    "seriesName",
    "created_at",
    "updated_at",
    "apData",
    "generatedEnergyData",
    "needEnergyData",
    "triggerData",
    "categoryData",
    "mainalternate",
    "series",
    "published",
    "getInfoData",
    "marketPrice",
    "tcgPlayerLink",
    "tcgPlayerName",
    "format",
    "abbreviation",
    "tcgPlayerProductId",
    "comment_count"
  ].join(",");

  const allCards: JsonRecord[] = [];

  while (true) {
    const url = new URL(`${baseUrl}/rest/v1/uaen_cards`);
    url.searchParams.set("select", selectFields);
    if (publishedOnly) {
      url.searchParams.set("published", "eq.1");
    }
    url.searchParams.set("order", "cardNo.asc");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    if (nameFilter) {
      url.searchParams.set("name", nameFilter);
    }
    if (seriesFilter) {
      url.searchParams.set("series", seriesFilter);
    }
    if (seriesNameFilter) {
      url.searchParams.set("seriesName", seriesNameFilter);
    }
    if (abbreviationFilter) {
      url.searchParams.set("abbreviation", abbreviationFilter);
    }

    if (logProgress) {
      console.log(`Fetching offset ${offset}...`);
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fetch failed (${response.status}): ${body}`);
    }

    const batch = await response.json() as unknown;
    if (!Array.isArray(batch) || batch.length === 0) {
      if (logProgress) {
        console.log(`No more results at offset ${offset}. Done.`);
      }
      break;
    }

    if (logProgress) {
      console.log(`Got ${batch.length} record(s).`);
    }

    for (const row of batch) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        allCards.push(row as JsonRecord);
      }
    }
    offset += limit;
  }

  if (logProgress) {
    console.log(`Total records fetched: ${allCards.length}`);
  }

  return allCards;
}

function sanitizeIdPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[\/\\?#]/g, "_")
    .replace(/[^a-zA-Z0-9:_\-.]/g, "");
}

function getStableCardKey(row: JsonRecord, game: string): string {
  const normalizedGame = game.trim().toLowerCase();

  // Pokemon card numbers (e.g. "64/128") are not globally unique,
  // so prefer original source ids for deterministic upserts.
  if (normalizedGame === "pokemon" || normalizedGame === "pkmn") {
    const originalId = sanitizeIdPart(row.originalId);
    if (originalId) return originalId;
    const sourceId = sanitizeIdPart(row.id);
    if (sourceId) return sourceId;
    const cardNo = sanitizeIdPart(row.cardNo);
    if (cardNo) return cardNo;
    throw new Error("Missing originalId/id/cardNo; cannot generate stable id for pokemon row.");
  }

  const cardNo = sanitizeIdPart(row.cardNo);
  if (cardNo) return cardNo;
  const originalId = sanitizeIdPart(row.originalId);
  if (originalId) return originalId;
  const sourceId = sanitizeIdPart(row.id);
  if (sourceId) return sourceId;
  throw new Error("Missing cardNo/originalId/id; cannot generate stable id.");
}

function parsePokemonSetIdFromCardId(cardId: string): string {
  const trimmed = cardId.trim();
  if (!trimmed) return "";
  const dashIndex = trimmed.indexOf("-");
  if (dashIndex <= 0) return "";
  return trimmed.slice(0, dashIndex).trim().toLowerCase();
}

async function loadPokemonSetsById(filePath: string): Promise<Map<string, PokemonSetSummary>> {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Pokemon sets file must be a JSON array.");
  }

  const map = new Map<string, PokemonSetSummary>();
  for (const row of parsed) {
    const record = asRecord(row);
    if (!record) continue;
    const id = toTrimmedString(record.id).toLowerCase();
    if (!id) continue;

    map.set(id, {
      id,
      name: toTrimmedString(record.name),
      series: toTrimmedString(record.series),
      printedTotal: toFiniteNumber(record.printedTotal),
      total: toFiniteNumber(record.total)
    });
  }
  return map;
}

function extractPokemonMarketPrice(row: JsonRecord): number | null {
  const directMarket = normalizeMarketPrice(row.marketPrice);
  if (directMarket != null) return directMarket;

  const tcgplayer = asRecord(row.tcgplayer);
  const tcgPrices = asRecord(tcgplayer?.prices);
  if (tcgPrices) {
    let best: number | null = null;
    for (const value of Object.values(tcgPrices)) {
      const variant = asRecord(value);
      const market = normalizeMarketPrice(variant?.market);
      if (market == null) continue;
      if (best == null || market > best) best = market;
    }
    if (best != null) return best;
  }

  const cardmarket = asRecord(row.cardmarket);
  const cardmarketPrices = asRecord(cardmarket?.prices);
  if (cardmarketPrices) {
    const averageSellPrice = normalizeMarketPrice(cardmarketPrices.averageSellPrice);
    if (averageSellPrice != null) return averageSellPrice;
    const trendPrice = normalizeMarketPrice(cardmarketPrices.trendPrice);
    if (trendPrice != null) return trendPrice;
  }

  return null;
}

function normalizePokemonCardRow(
  row: JsonRecord,
  pokemonSetsById?: Map<string, PokemonSetSummary>
): JsonRecord {
  const setFromRow = asRecord(row.set);
  const images = asRecord(row.images);

  const rawId = toTrimmedString(row.id);
  const idPrefix = parsePokemonSetIdFromCardId(rawId);
  const setCode = (toTrimmedString(setFromRow?.id) || idPrefix).toLowerCase();
  const setFromIndex = setCode ? pokemonSetsById?.get(setCode) : undefined;

  const number = toTrimmedString(row.number);
  const printedTotal =
    toFiniteNumber(setFromRow?.printedTotal)
    ?? setFromIndex?.printedTotal
    ?? setFromIndex?.total
    ?? null;
  const numberWithTotal = number && printedTotal ? `${number}/${Math.floor(printedTotal)}` : number;
  const cardNo = toTrimmedString(row.cardNo) || numberWithTotal || rawId;

  const name = toTrimmedString(row.name) || (rawId ? `Pokemon ${rawId}` : "Unknown Pokemon");
  const series = toTrimmedString(row.series) || setFromIndex?.series || setCode || "pokemon";
  const seriesName = toTrimmedString(row.seriesName) || setFromIndex?.name || toTrimmedString(setFromRow?.name) || "Pokemon";
  const image =
    toTrimmedString(row.image)
    || toTrimmedString(images?.small)
    || toTrimmedString(images?.large);
  const rarity = toTrimmedString(row.rarity);
  const marketPrice = extractPokemonMarketPrice(row);

  return {
    ...row,
    cardNo,
    originalId: toTrimmedString(row.originalId) || rawId,
    setId: setCode || undefined,
    name,
    series,
    seriesName,
    number,
    setPrintedTotal: printedTotal,
    image,
    rarity,
    marketPrice
  };
}

function normalizeCardRowForGame(
  row: JsonRecord,
  game: string,
  pokemonSetsById?: Map<string, PokemonSetSummary>
): JsonRecord {
  const normalizedGame = game.trim().toLowerCase();
  if (normalizedGame === "pokemon" || normalizedGame === "pkmn") {
    return normalizePokemonCardRow(row, pokemonSetsById);
  }
  return row;
}

function filterJsonRows(rows: JsonRecord[], options: FilterJsonRowsOptions): JsonRecord[] {
  const contains = normalizeFilterText(options.contains);
  const series = normalizeFilterText(options.series);
  const seriesName = normalizeFilterText(options.seriesName);
  const abbreviation = normalizeFilterText(options.abbreviation);

  return rows.filter((row) => {
    const rowSeries = normalizeFilterText(row.series);
    const rowSeriesName = normalizeFilterText(row.seriesName);
    const rowAbbreviation = normalizeFilterText(row.abbreviation);
    const searchable = normalizeFilterText([
      row.id,
      row.name,
      row.cardNo,
      row.originalId,
      row.series,
      row.seriesName,
      row.abbreviation
    ].join(" "));

    if (contains && !searchable.includes(contains)) return false;
    if (series && !rowSeries.includes(series)) return false;
    if (seriesName && !rowSeriesName.includes(seriesName)) return false;
    if (abbreviation && !rowAbbreviation.includes(abbreviation)) return false;
    return true;
  });
}

function toCardSyncDoc(row: JsonRecord, game: string, pk: string): CardSyncDoc {
  const stableKey = getStableCardKey(row, game);
  return {
    ...row,
    id: `${game}:${stableKey}`,
    pk,
    kind: "card",
    game
  };
}

async function readJsonArray(filePath: string): Promise<JsonRecord[]> {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Input must be a JSON array.");
  }
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Row ${index} is not a JSON object.`);
    }
    return row as JsonRecord;
  });
}

async function writeJsonArray(filePath: string, rows: JsonRecord[]): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await fs.writeFile(absolutePath, JSON.stringify(rows, null, 2), "utf8");
}

function getContainerFromEnv(databaseId: string, containerId: string): Container {
  const connectionString = process.env.COSMOS_CONNECTION_STRING?.trim();
  const endpoint = process.env.COSMOS_ENDPOINT?.trim();
  const key = process.env.COSMOS_KEY?.trim();

  if (!connectionString && !(endpoint && key)) {
    throw new Error("Set COSMOS_CONNECTION_STRING or both COSMOS_ENDPOINT and COSMOS_KEY.");
  }

  const client = connectionString
    ? new CosmosClient(connectionString)
    : new CosmosClient({ endpoint: endpoint as string, key: key as string });

  return client.database(databaseId).container(containerId);
}

async function upsertWithConcurrency(
  container: Container,
  docs: CardSyncDoc[],
  batchSize: number,
  concurrency: number
): Promise<void> {
  for (let offset = 0; offset < docs.length; offset += batchSize * concurrency) {
    const wave: Promise<unknown>[] = [];
    for (let lane = 0; lane < concurrency; lane += 1) {
      const batchStart = offset + (lane * batchSize);
      if (batchStart >= docs.length) break;
      const batch = docs.slice(batchStart, Math.min(batchStart + batchSize, docs.length));
      wave.push(Promise.all(batch.map((doc) => container.items.upsert(doc))));
    }
    await Promise.all(wave);
    const processed = Math.min(offset + (batchSize * concurrency), docs.length);
    console.log(`Upserted ${processed}/${docs.length}`);
  }
}

async function fetchExistingDocIds(
  container: Container,
  pk: string,
  ids: string[],
  chunkSize = 250
): Promise<Set<string>> {
  const existingIds = new Set<string>();
  const uniqueIds = Array.from(new Set(ids.filter((value) => value.trim().length > 0)));

  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    if (chunk.length === 0) continue;

    const querySpec = {
      query: "SELECT VALUE c.id FROM c WHERE c.pk = @pk AND ARRAY_CONTAINS(@ids, c.id)",
      parameters: [
        { name: "@pk", value: pk },
        { name: "@ids", value: chunk }
      ]
    };

    const { resources } = await container.items.query<string>(querySpec).fetchAll();
    for (const id of resources) {
      if (typeof id === "string" && id.trim()) {
        existingIds.add(id);
      }
    }
  }

  return existingIds;
}

export async function importCardsToCosmosFromRows(
  rows: JsonRecord[],
  options: ImportCardsToCosmosOptions
): Promise<void> {
  const game = options.game.trim().toLowerCase();
  if (!game) throw new Error("Missing options.game.");
  const pk = game;
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 100));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  const dryRun = Boolean(options.dryRun);
  const missingOnly = Boolean(options.missingOnly);

  let docs = rows
    .map((row) => normalizeCardRowForGame(row, game, options.pokemonSetsById))
    .map((row) => toCardSyncDoc(row, game, pk));
  console.log(`Prepared ${docs.length} docs for game=${game}, pk=${pk}.`);

  let container: Container | null = null;
  if (missingOnly || !dryRun) {
    container = getContainerFromEnv(options.databaseId, options.containerId);
  }

  if (missingOnly && container) {
    console.log(`Checking existing docs in ${options.databaseId}/${options.containerId}...`);
    const existingIds = await fetchExistingDocIds(container, pk, docs.map((doc) => doc.id));
    const beforeCount = docs.length;
    docs = docs.filter((doc) => !existingIds.has(doc.id));
    console.log(`Filtered out ${beforeCount - docs.length} existing doc(s); ${docs.length} missing doc(s) remain.`);
  }

  if (dryRun) {
    console.log("Dry run enabled. No writes executed.");
    return;
  }

  if (docs.length === 0) {
    console.log("No docs to write.");
    return;
  }

  console.log(
    `Upserting into ${options.databaseId}/${options.containerId} with batchSize=${batchSize}, concurrency=${concurrency}...`
  );
  await upsertWithConcurrency(container as Container, docs, batchSize, concurrency);
  console.log("Done.");
}

export async function importCardsToCosmosFromFile(
  filePath: string,
  options: ImportCardsToCosmosOptions
): Promise<void> {
  console.log(`Reading ${filePath}...`);
  const rows = await readJsonArray(filePath);
  console.log(`Loaded ${rows.length} row(s).`);
  await importCardsToCosmosFromRows(rows, options);
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function fetchPokemonData(options: { repoDir: string; outFile: string; setsOutFile: string }): Promise<void> {
  const { repoDir, outFile, setsOutFile } = options;
  const resolvedRepo = path.resolve(repoDir);
  const cardsDir = path.join(resolvedRepo, "cards", "en");
  const setsFile = path.join(resolvedRepo, "sets", "en.json");

  // git pull
  console.log(`Pulling latest from ${resolvedRepo}...`);
  await runGit(resolvedRepo, ["fetch", "origin"]);
  const pullOutput = await runGit(resolvedRepo, ["merge", "origin/master"]);
  console.log(pullOutput || "(already up to date)");

  // merge card files
  const files = (await fs.readdir(cardsDir)).filter((f) => f.endsWith(".json")).sort();
  console.log(`Merging ${files.length} set file(s) from cards/en/...`);
  const allCards: unknown[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(cardsDir, file), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      allCards.push(...parsed);
    }
  }

  const resolvedOut = path.resolve(outFile);
  await fs.writeFile(resolvedOut, JSON.stringify(allCards, null, 2), "utf8");
  console.log(`Wrote ${allCards.length} card(s) to ${resolvedOut}`);

  // copy sets file
  const resolvedSetsOut = path.resolve(setsOutFile);
  await fs.copyFile(setsFile, resolvedSetsOut);
  console.log(`Copied sets to ${resolvedSetsOut}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const databaseId = (process.env.COSMOS_DATABASE ?? "").trim();
  const containerId = (process.env.COSMOS_CONTAINER ?? "").trim();
  const game = ((args.game as string | undefined) ?? process.env.CARDSYNC_GAME ?? "ua").trim().toLowerCase();
  const pokemonSetsFile = ((args["pokemon-sets-file"] as string | undefined)
    ?? process.env.CARDSYNC_POKEMON_SETS_FILE
    ?? "").trim();
  const batchSize = toInt((args["batch-size"] as string | undefined) ?? process.env.CARDSYNC_BATCH_SIZE, 100);
  const concurrency = toInt((args.concurrency as string | undefined) ?? process.env.CARDSYNC_CONCURRENCY, 4);
  const dryRun = Boolean(args["dry-run"]) || toBool(process.env.CARDSYNC_DRY_RUN, false);
  const missingOnly = Boolean(args["missing-only"]) || toBool(process.env.CARDSYNC_MISSING_ONLY, false);

  if (command === "fetch-ua") {
    const cards = await fetchUnionArenaCards({
      limit: toInt((args.limit as string | undefined), 1000),
      initialOffset: toInt((args.offset as string | undefined), 0),
      publishedOnly: !Boolean(args["include-unpublished"]),
      logProgress: true,
      name: (args.name as string | undefined)?.trim(),
      series: (args.series as string | undefined)?.trim(),
      seriesName: (args["series-name"] as string | undefined)?.trim(),
      abbreviation: (args.abbreviation as string | undefined)?.trim()
    });
    const outPath = (args.out as string | undefined)?.trim();
    if (outPath) {
      const absoluteOutPath = path.resolve(outPath);
      await fs.writeFile(absoluteOutPath, JSON.stringify(cards, null, 2), "utf8");
      console.log(`Saved to ${absoluteOutPath}`);
    }
    return;
  }

  if (command === "fetch-pokemon") {
    const sourceDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(sourceDir, "..");
    const workspaceRoot = path.resolve(projectRoot, "..");
    const repoDir = ((args["repo"] as string | undefined)?.trim())
      || path.join(workspaceRoot, "pokemondata_real");
    const outFile = ((args.out as string | undefined)?.trim())
      || path.join(projectRoot, "pokemon-all.json");
    const setsOutFile = ((args["sets-out"] as string | undefined)?.trim())
      || path.join(projectRoot, "en.json");
    await fetchPokemonData({ repoDir, outFile, setsOutFile });
    return;
  }

  if (command === "filter-file") {
    const file = (args.file as string | undefined)?.trim();
    const out = (args.out as string | undefined)?.trim();
    if (!file) throw new Error("Missing --file <path-to-json-array>.");
    if (!out) throw new Error("Missing --out <path-to-output-json>.");

    const rows = await readJsonArray(file);
    const filtered = filterJsonRows(rows, {
      contains: (args.contains as string | undefined)?.trim(),
      series: (args.series as string | undefined)?.trim(),
      seriesName: (args["series-name"] as string | undefined)?.trim(),
      abbreviation: (args.abbreviation as string | undefined)?.trim()
    });

    await writeJsonArray(out, filtered);
    console.log(`Filtered ${filtered.length}/${rows.length} row(s) to ${path.resolve(out)}`);
    return;
  }

  if (command === "import-file") {
    const file = (args.file as string | undefined)?.trim();
    if (!file) throw new Error("Missing --file <path-to-json-array>.");
    if (!databaseId) throw new Error("Missing COSMOS_DATABASE.");
    if (!containerId) throw new Error("Missing COSMOS_CONTAINER.");
    let pokemonSetsById: Map<string, PokemonSetSummary> | undefined;
    if ((game === "pokemon" || game === "pkmn") && pokemonSetsFile) {
      console.log(`Loading Pokemon sets from ${pokemonSetsFile}...`);
      pokemonSetsById = await loadPokemonSetsById(pokemonSetsFile);
      console.log(`Loaded ${pokemonSetsById.size} pokemon set record(s).`);
    } else if (game === "pokemon" || game === "pkmn") {
      console.log("Pokemon sets file not provided. Card numbers will not include set totals.");
    }

    await importCardsToCosmosFromFile(file, {
      game,
      databaseId,
      containerId,
      batchSize,
      concurrency,
      dryRun,
      missingOnly,
      pokemonSetsById
    });
    return;
  }

  throw new Error(
    "Missing or invalid command. Use: fetch-ua | fetch-pokemon | filter-file | import-file"
  );
}

main().catch((error) => {
  console.error("[CardSync] Failed:", error);
  process.exitCode = 1;
});
