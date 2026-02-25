import { CosmosClient, type Container } from "@azure/cosmos";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

type CardSyncDoc = JsonRecord & {
  id: string;
  pk: string;
  kind: "card";
  game: string;
};

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
};

export type ImportCardsToCosmosOptions = {
  game: string;
  databaseId: string;
  containerId: string;
  batchSize?: number;
  concurrency?: number;
  dryRun?: boolean;
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

function getStableCardKey(row: JsonRecord): string {
  const cardNo = sanitizeIdPart(row.cardNo);
  if (cardNo) return cardNo;
  const originalId = sanitizeIdPart(row.originalId);
  if (originalId) return originalId;
  throw new Error("Missing both cardNo and originalId; cannot generate stable id.");
}

function toCardSyncDoc(row: JsonRecord, game: string, pk: string): CardSyncDoc {
  const stableKey = getStableCardKey(row);
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

  const docs = rows.map((row) => toCardSyncDoc(row, game, pk));
  console.log(`Prepared ${docs.length} docs for game=${game}, pk=${pk}.`);

  if (dryRun) {
    console.log("Dry run enabled. No writes executed.");
    return;
  }

  const container = getContainerFromEnv(options.databaseId, options.containerId);
  console.log(
    `Upserting into ${options.databaseId}/${options.containerId} with batchSize=${batchSize}, concurrency=${concurrency}...`
  );
  await upsertWithConcurrency(container, docs, batchSize, concurrency);
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

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const databaseId = (process.env.COSMOS_DATABASE ?? "").trim();
  const containerId = (process.env.COSMOS_CONTAINER ?? "").trim();
  const game = ((args.game as string | undefined) ?? process.env.CARDSYNC_GAME ?? "ua").trim().toLowerCase();
  const batchSize = toInt((args["batch-size"] as string | undefined) ?? process.env.CARDSYNC_BATCH_SIZE, 100);
  const concurrency = toInt((args.concurrency as string | undefined) ?? process.env.CARDSYNC_CONCURRENCY, 4);
  const dryRun = Boolean(args["dry-run"]) || toBool(process.env.CARDSYNC_DRY_RUN, false);

  if (command === "fetch-ua") {
    const cards = await fetchUnionArenaCards({
      limit: toInt((args.limit as string | undefined), 1000),
      initialOffset: toInt((args.offset as string | undefined), 0),
      publishedOnly: !Boolean(args["include-unpublished"]),
      logProgress: true
    });
    const outPath = (args.out as string | undefined)?.trim();
    if (outPath) {
      const absoluteOutPath = path.resolve(outPath);
      await fs.writeFile(absoluteOutPath, JSON.stringify(cards, null, 2), "utf8");
      console.log(`Saved to ${absoluteOutPath}`);
    }
    return;
  }

  if (command === "import-file") {
    const file = (args.file as string | undefined)?.trim();
    if (!file) throw new Error("Missing --file <path-to-json-array>.");
    if (!databaseId) throw new Error("Missing COSMOS_DATABASE.");
    if (!containerId) throw new Error("Missing COSMOS_CONTAINER.");
    await importCardsToCosmosFromFile(file, {
      game,
      databaseId,
      containerId,
      batchSize,
      concurrency,
      dryRun
    });
    return;
  }

  throw new Error(
    "Missing or invalid command. Use: fetch-ua | import-file"
  );
}

main().catch((error) => {
  console.error("[CardSync] Failed:", error);
  process.exitCode = 1;
});
