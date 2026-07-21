import type { BuyerProfileApiContext } from "../../../context/buyers.ts";
import type { BuyerProfile } from "../../../../types/app.ts";
import { normalizeBuyerProfileDto } from "../../../buyer-profile.ts";
import {
  canUseAuthoritativeSalesLiveApi,
  getScopeBody,
  getScopeQuery,
  requestJson
} from "../../entity-api-shared.ts";

export type BuyerProfileApiApp = BuyerProfileApiContext;

export interface BuyerProfileMutationRequest {
  username: string;
  preferredName?: string;
  tags: string[];
  baseVersion: number;
  mutationId: string;
}

type BuyerProfileListResponse = { profiles?: unknown };
type BuyerProfileSaveResponse = { profile?: unknown };
type BuyerProfileDeleteResponse = { version?: unknown };

export function canUseBuyerProfileApi(): boolean {
  return canUseAuthoritativeSalesLiveApi();
}

export async function fetchBuyerProfilesFromApi(app: BuyerProfileApiApp): Promise<BuyerProfile[]> {
  const body = await requestJson(
    app,
    `/buyer-profiles${getScopeQuery(app)}`,
    { method: "GET" },
    "Failed to load buyer profiles.",
    { expireAuthOn401: false }
  ) as BuyerProfileListResponse | null;
  const profiles = Array.isArray(body?.profiles) ? body.profiles : [];
  return profiles
    .map(normalizeBuyerProfileDto)
    .filter((profile): profile is BuyerProfile => profile != null);
}

export async function upsertBuyerProfileToApi(
  app: BuyerProfileApiApp,
  input: BuyerProfileMutationRequest
): Promise<BuyerProfile> {
  const body = await requestJson(
    app,
    "/buyer-profiles",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...getScopeBody(app), ...input })
    },
    "Failed to save buyer profile.",
    { expireAuthOn401: false }
  ) as BuyerProfileSaveResponse | null;
  const profile = normalizeBuyerProfileDto(body?.profile);
  if (!profile) throw new Error("Buyer profile API returned an invalid profile.");
  return profile;
}

export async function deleteBuyerProfileFromApi(
  app: BuyerProfileApiApp,
  input: Pick<BuyerProfileMutationRequest, "username" | "baseVersion" | "mutationId">
): Promise<{ version: number }> {
  const body = await requestJson(
    app,
    "/buyer-profiles",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...getScopeBody(app), ...input })
    },
    "Failed to delete buyer profile.",
    { expireAuthOn401: false }
  ) as BuyerProfileDeleteResponse | null;
  const version = Number(body?.version);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error("Buyer profile API returned an invalid version.");
  }
  return { version };
}
