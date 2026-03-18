import type {
  ApiConfig,
  EntitlementDocument,
  PlayPurchaseDocument,
  PurchaseVerificationResultDocument,
  UserProfileDisplayNameSource,
  UserProfileDocument
} from "../../types";
import { getContainers, isConflictError, isNotFoundError, withCosmosRetry } from "./core";
import {
  entitlementId,
  playPurchaseId,
  purchaseVerificationResultId,
  userProfileId
} from "./ids";

export async function getEntitlement(
  config: ApiConfig,
  userId: string
): Promise<EntitlementDocument | null> {
  const { entitlements } = getContainers(config);
  const id = entitlementId(userId);

  try {
    const { resource } = await withCosmosRetry(() => entitlements.item(id, userId).read<EntitlementDocument>());
    return resource ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertEntitlement(
  config: ApiConfig,
  entitlement: EntitlementDocument
): Promise<EntitlementDocument> {
  const { entitlements } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<EntitlementDocument>({
      ...entitlement,
      id: entitlementId(entitlement.userId)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert entitlement.");
  }

  return resource;
}

export async function getUserProfile(
  config: ApiConfig,
  userId: string
): Promise<UserProfileDocument | null> {
  const { entitlements } = getContainers(config);
  const id = userProfileId(userId);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, userId).read<UserProfileDocument>()
    );
    if (!resource || resource.docType !== "user_profile") {
      return null;
    }
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function listUserProfiles(
  config: ApiConfig,
  userIds: string[]
): Promise<UserProfileDocument[]> {
  const normalizedUserIds = [...new Set(
    userIds
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0)
  )];

  const profiles = await Promise.all(
    normalizedUserIds.map((userId) => getUserProfile(config, userId))
  );

  return profiles.filter((profile): profile is UserProfileDocument => profile != null);
}

interface UpsertUserProfileInput {
  userId: string;
  displayName: string;
  displayNameSource: UserProfileDisplayNameSource;
  photoUrl?: string;
}

export async function upsertUserProfile(
  config: ApiConfig,
  input: UpsertUserProfileInput
): Promise<UserProfileDocument> {
  const { entitlements } = getContainers(config);
  const now = new Date().toISOString();
  const normalizedUserId = String(input.userId || "").trim();
  const normalizedDisplayName = String(input.displayName || "").trim();
  const normalizedPhotoUrl = String(input.photoUrl || "").trim();
  const existing = await getUserProfile(config, normalizedUserId);

  const shouldPreserveUserManagedName =
    existing?.displayNameSource === "user"
    && existing.displayName.trim().length > 0;

  const document: UserProfileDocument = {
    id: userProfileId(normalizedUserId),
    docType: "user_profile",
    userId: normalizedUserId,
    displayName: shouldPreserveUserManagedName
      ? existing.displayName
      : normalizedDisplayName,
    displayNameSource: shouldPreserveUserManagedName
      ? "user"
      : input.displayNameSource,
    photoUrl: shouldPreserveUserManagedName
      ? (existing?.photoUrl || normalizedPhotoUrl || undefined)
      : (normalizedPhotoUrl || existing?.photoUrl || undefined),
    updatedAt: now
  };

  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<UserProfileDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert user profile.");
  }

  return resource;
}

export async function getPlayPurchaseByTokenHash(
  config: ApiConfig,
  purchaseTokenHash: string
): Promise<PlayPurchaseDocument | null> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.docType = @docType AND c.purchaseTokenHash = @purchaseTokenHash",
    parameters: [
      { name: "@docType", value: "play_purchase" },
      { name: "@purchaseTokenHash", value: purchaseTokenHash }
    ]
  };

  const iterator = entitlements.items.query<PlayPurchaseDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

export async function listPlayPurchasesForUser(
  config: ApiConfig,
  userId: string
): Promise<PlayPurchaseDocument[]> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "play_purchase" }
    ]
  };

  const iterator = entitlements.items.query<PlayPurchaseDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function upsertPlayPurchase(
  config: ApiConfig,
  purchase: PlayPurchaseDocument
): Promise<PlayPurchaseDocument> {
  const { entitlements } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<PlayPurchaseDocument>({
      ...purchase,
      id: playPurchaseId(purchase.purchaseTokenHash)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert play purchase.");
  }

  return resource;
}

interface PurchaseVerificationResultLookupInput {
  userId: string;
  provider: string;
  idempotencyKey: string;
}

export async function getPurchaseVerificationResult(
  config: ApiConfig,
  input: PurchaseVerificationResultLookupInput
): Promise<PurchaseVerificationResultDocument | null> {
  const { entitlements } = getContainers(config);
  const id = purchaseVerificationResultId(input.userId, input.provider, input.idempotencyKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, input.userId).read<PurchaseVerificationResultDocument>()
    );
    if (!resource || resource.docType !== "purchase_verification_result") {
      return null;
    }
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

interface CreatePurchaseVerificationResultInput {
  userId: string;
  provider: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  createdAt: string;
}

export async function createPurchaseVerificationResult(
  config: ApiConfig,
  input: CreatePurchaseVerificationResultInput
): Promise<PurchaseVerificationResultDocument> {
  const { entitlements } = getContainers(config);
  const document: PurchaseVerificationResultDocument = {
    id: purchaseVerificationResultId(input.userId, input.provider, input.idempotencyKey),
    docType: "purchase_verification_result",
    userId: input.userId,
    provider: input.provider,
    idempotencyKey: input.idempotencyKey,
    responseStatus: input.responseStatus,
    responseBody: input.responseBody,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.items.create<PurchaseVerificationResultDocument>(document)
    );

    if (!resource) {
      throw new Error("Failed to create purchase verification result.");
    }

    return resource;
  } catch (error) {
    if (isConflictError(error)) {
      const existing = await getPurchaseVerificationResult(config, {
        userId: input.userId,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function deleteEntitlement(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const id = entitlementId(userId);

  try {
    await withCosmosRetry(() => entitlements.item(id, userId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function deleteUserProfile(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const id = userProfileId(userId);

  try {
    await withCosmosRetry(() => entitlements.item(id, userId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function deletePlayPurchasesForUser(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const purchases = await listPlayPurchasesForUser(config, userId);

  for (const purchase of purchases) {
    try {
      await withCosmosRetry(() => entitlements.item(purchase.id, userId).delete());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}
