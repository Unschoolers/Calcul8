import { createHash } from "node:crypto";
import type { ApiConfig } from "../../types";
import { getContainers, isConflictError, isNotFoundError, withCosmosRetry } from "./core";

interface RateLimitCounterDocument {
  id: string;
  userId: string;
  docType: "rate_limit_counter";
  count: number;
  windowStartMs: number;
  windowSeconds: number;
  ttl: number;
}

export interface IncrementRateLimitCounterInput {
  clientKey: string;
  windowStartMs: number;
  windowSeconds: number;
}

function buildCounterIdentity(input: IncrementRateLimitCounterInput): { id: string; partitionKey: string } {
  const clientHash = createHash("sha256").update(input.clientKey).digest("hex");
  const partitionKey = `rate_limit:${clientHash}`;
  return {
    partitionKey,
    id: `${partitionKey}:${input.windowSeconds}:${input.windowStartMs}`
  };
}

/** Atomically increments a fixed-window counter shared by every API instance. */
export async function incrementRateLimitCounter(
  config: ApiConfig,
  input: IncrementRateLimitCounterInput
): Promise<number> {
  const { sessions } = getContainers(config);
  const { id, partitionKey } = buildCounterIdentity(input);
  const document: RateLimitCounterDocument = {
    id,
    userId: partitionKey,
    docType: "rate_limit_counter",
    count: 1,
    windowStartMs: input.windowStartMs,
    windowSeconds: input.windowSeconds,
    ttl: Math.max(input.windowSeconds * 2, 120)
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.items.create<RateLimitCounterDocument>(document)
    );
    return Number(resource?.count ?? 1);
  } catch (error) {
    if (!isConflictError(error)) throw error;
  }

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(id, partitionKey).patch<RateLimitCounterDocument>([
        { op: "incr", path: "/count", value: 1 }
      ])
    );
    const count = Number(resource?.count);
    if (!Number.isFinite(count)) throw new Error("Rate-limit counter increment returned no count.");
    return count;
  } catch (error) {
    // A TTL boundary can remove the document between conflict and patch.
    if (isNotFoundError(error)) {
      const { resource } = await withCosmosRetry(() =>
        sessions.items.create<RateLimitCounterDocument>(document)
      );
      return Number(resource?.count ?? 1);
    }
    throw error;
  }
}
