import type { Sale } from "../../types/app.ts";
import type { AppContext } from "../context.ts";
import { getStoredGoogleIdToken } from "../auth/index.ts";
import { fetchAuthenticatedApiResponse, resolveApiBaseUrl } from "./ui/shared.ts";

export class SalesLiveApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SalesLiveApiError";
    this.status = status;
  }
}

type SalesLiveApiApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "getSalesStorageKey"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "notify"
>;

type SaleResponse = {
  sales?: unknown;
  sale?: unknown;
};

type LivePricingResponse = {
  livePricing?: unknown;
};

type RealtimeTokenResponse = {
  room?: unknown;
  rooms?: unknown;
  token?: unknown;
  expiresAt?: unknown;
};

export type LotLivePricingRecord = {
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
  version: number | null;
  updatedAt?: string;
  updatedBy?: string;
  mutationId?: string;
};

export type WorkspaceRealtimeSubscribeToken = {
  room: string;
  rooms: string[];
  token: string | null;
  expiresAt: number | null;
};

function isSignedInForEntityApis(): boolean {
  try {
    return Boolean(resolveApiBaseUrl() && getStoredGoogleIdToken());
  } catch {
    return false;
  }
}

function getScopeQuery(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): string {
  if (app.activeScopeType !== "workspace" || !app.activeWorkspaceId) return "";
  return `?workspaceId=${encodeURIComponent(app.activeWorkspaceId)}`;
}

function getScopeBody(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): { workspaceId?: string } {
  if (app.activeScopeType !== "workspace" || !app.activeWorkspaceId) {
    return {};
  }
  return {
    workspaceId: app.activeWorkspaceId
  };
}

async function parseApiError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    const error = String(body.error ?? "").trim();
    if (error) return error;
    const message = String(body.message ?? "").trim();
    if (message) return message;
  } catch {
    // Ignore non-JSON error payloads.
  }

  return fallbackMessage;
}

export function normalizeSale(value: unknown): Sale | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const id = Number(candidate.id);
  if (!Number.isFinite(id)) return null;

  return {
    id,
    type: candidate.type === "box" || candidate.type === "rtyh" ? candidate.type : "pack",
    quantity: Math.max(0, Math.floor(Number(candidate.quantity) || 0)),
    packsCount: Math.max(0, Math.floor(Number(candidate.packsCount) || 0)),
    singlesPurchaseEntryId: Number.isFinite(Number(candidate.singlesPurchaseEntryId))
      ? Math.floor(Number(candidate.singlesPurchaseEntryId))
      : undefined,
    singlesItems: Array.isArray(candidate.singlesItems)
      ? candidate.singlesItems
        .map((line) => {
          if (!line || typeof line !== "object" || Array.isArray(line)) return null;
          const next = line as Record<string, unknown>;
          const quantity = Math.max(0, Math.floor(Number(next.quantity) || 0));
          if (quantity <= 0) return null;
          const parsedEntryId = Number(next.singlesPurchaseEntryId);
          return {
            singlesPurchaseEntryId: Number.isFinite(parsedEntryId) && parsedEntryId > 0
              ? Math.floor(parsedEntryId)
              : undefined,
            quantity,
            price: Math.max(0, Number(next.price) || 0)
          };
        })
        .filter((line): line is NonNullable<typeof line> => line != null)
      : undefined,
    price: Math.max(0, Number(candidate.price) || 0),
    priceIsTotal: candidate.priceIsTotal === true ? true : undefined,
    memo: typeof candidate.memo === "string" ? candidate.memo : undefined,
    buyerShipping: Number(candidate.buyerShipping) || 0,
    date: typeof candidate.date === "string" ? candidate.date : "",
    version: Number.isFinite(Number(candidate.version)) ? Math.floor(Number(candidate.version)) : undefined,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
    updatedBy: typeof candidate.updatedBy === "string" ? candidate.updatedBy : undefined,
    mutationId: typeof candidate.mutationId === "string" ? candidate.mutationId : undefined
  };
}

function normalizeSales(value: unknown): Sale[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSale(entry))
    .filter((entry): entry is Sale => entry != null);
}

export function normalizeLivePricing(value: unknown): LotLivePricingRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return {
    livePackPrice: Number(candidate.livePackPrice) || 0,
    liveBoxPriceSell: Number(candidate.liveBoxPriceSell) || 0,
    liveSpotPrice: Number(candidate.liveSpotPrice) || 0,
    version: Number.isFinite(Number(candidate.version)) ? Math.floor(Number(candidate.version)) : null,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined,
    updatedBy: typeof candidate.updatedBy === "string" ? candidate.updatedBy : undefined,
    mutationId: typeof candidate.mutationId === "string" ? candidate.mutationId : undefined
  };
}

function persistSalesCache(app: Pick<AppContext, "getSalesStorageKey">, lotId: number, sales: Sale[]): void {
  try {
    localStorage.setItem(app.getSalesStorageKey(lotId), JSON.stringify(sales));
  } catch {
    // Ignore cache write failures.
  }
}

async function requestJson(
  app: Pick<AppContext, "googleAuthEpoch" | "hasProAccess" | "notify">,
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: {
    expireAuthOn401?: boolean;
  } = {}
): Promise<unknown> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    throw new SalesLiveApiError(0, "API base URL is not configured.");
  }

  const response = await fetchAuthenticatedApiResponse(app, path, init, options);

  if (response.status === 401) {
    throw new SalesLiveApiError(401, "Your sign-in expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new SalesLiveApiError(response.status, await parseApiError(response, fallbackMessage));
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function canUseAuthoritativeSalesLiveApi(): boolean {
  return isSignedInForEntityApis();
}

export function createMutationId(prefix: string): string {
  const cryptoApi = window.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}:${cryptoApi.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
}

export async function fetchAuthoritativeSales(
  app: SalesLiveApiApp,
  lotId: number
): Promise<Sale[] | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to load lot sales."
  ) as SaleResponse | null;

  const sales = normalizeSales(body?.sales);
  persistSalesCache(app, lotId, sales);
  return sales;
}

export async function saveAuthoritativeSale(
  app: SalesLiveApiApp,
  lotId: number,
  sale: Sale,
  baseVersion: number
): Promise<Sale> {
  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(app),
        sale,
        baseVersion,
        mutationId: createMutationId("sale")
      })
    },
    "Failed to save sale."
  ) as SaleResponse | null;

  const savedSale = normalizeSale(body?.sale);
  if (!savedSale) {
    throw new SalesLiveApiError(500, "Sale saved, but the API response was invalid.");
  }
  return savedSale;
}

export async function deleteAuthoritativeSale(
  app: SalesLiveApiApp,
  lotId: number,
  saleId: number,
  baseVersion: number
): Promise<void> {
  await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/sales/${encodeURIComponent(String(saleId))}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(app),
        baseVersion,
        mutationId: createMutationId("sale-delete")
      })
    },
    "Failed to delete sale."
  );
}

export async function fetchAuthoritativeLivePricing(
  app: SalesLiveApiApp,
  lotId: number
): Promise<LotLivePricingRecord | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/live-pricing${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to load live pricing."
  ) as LivePricingResponse | null;

  return normalizeLivePricing(body?.livePricing);
}

export async function fetchWorkspaceRealtimeSubscribeToken(
  app: SalesLiveApiApp,
  lotId: number
): Promise<WorkspaceRealtimeSubscribeToken | null> {
  if (!canUseAuthoritativeSalesLiveApi()) return null;
  if (app.activeScopeType !== "workspace" || !app.activeWorkspaceId) return null;

  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/realtime-token${getScopeQuery(app)}`,
    {
      method: "GET"
    },
    "Failed to create realtime subscribe token.",
    {
      expireAuthOn401: false
    }
  ) as RealtimeTokenResponse | null;

  const room = String(body?.room ?? "").trim();
  if (!room) return null;
  const rooms = Array.isArray(body?.rooms)
    ? body?.rooms.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [room];

  const rawToken = String(body?.token ?? "").trim();
  const expiresAt = Number(body?.expiresAt);
  return {
    room,
    rooms,
    token: rawToken || null,
    expiresAt: Number.isFinite(expiresAt) ? Math.floor(expiresAt) : null
  };
}

export async function saveAuthoritativeLivePricing(
  app: SalesLiveApiApp,
  lotId: number,
  pricing: Pick<AppContext, "livePackPrice" | "liveBoxPriceSell" | "liveSpotPrice" | "currentLivePricingVersion">
): Promise<LotLivePricingRecord> {
  const body = await requestJson(
    app,
    `/lots/${encodeURIComponent(String(lotId))}/live-pricing`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getScopeBody(app),
        livePackPrice: pricing.livePackPrice,
        liveBoxPriceSell: pricing.liveBoxPriceSell,
        liveSpotPrice: pricing.liveSpotPrice,
        baseVersion: pricing.currentLivePricingVersion ?? 0,
        mutationId: createMutationId("live-pricing")
      })
    },
    "Failed to save live pricing."
  ) as LivePricingResponse | null;

  const livePricing = normalizeLivePricing(body?.livePricing);
  if (!livePricing) {
    throw new SalesLiveApiError(500, "Live pricing saved, but the API response was invalid.");
  }
  return livePricing;
}

export function cacheAuthoritativeSales(
  app: Pick<AppContext, "getSalesStorageKey">,
  lotId: number,
  sales: Sale[]
): void {
  persistSalesCache(app, lotId, sales);
}
