/** A transactional batch reported an optimistic concurrency conflict. */
export class CosmosBatchConflictError extends Error {
  readonly statusCode: 409 | 412;

  constructor(statusCode: 409 | 412) {
    super(`Cosmos transactional batch conflicted (${statusCode}).`);
    this.name = "CosmosBatchConflictError";
    this.statusCode = statusCode;
  }
}

/** A transactional batch response was incomplete or contained a failed operation. */
export class CosmosBatchFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CosmosBatchFailureError";
  }
}

function readStatusCode(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { statusCode?: unknown; code?: unknown };
  const status = candidate.statusCode ?? candidate.code;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

function assertSuccessfulStatus(statusCode: number | null, where: string): void {
  if (statusCode === 409 || statusCode === 412) {
    throw new CosmosBatchConflictError(statusCode);
  }
  if (statusCode === null || statusCode < 200 || statusCode >= 300) {
    throw new CosmosBatchFailureError(`Cosmos transactional batch ${where} returned an invalid status.`);
  }
}

/**
 * Cosmos can resolve a batch promise even when an individual operation failed.
 * Treat malformed/incomplete responses as failures so callers never mistake a
 * partially failed transaction response for a committed write.
 */
export function assertSuccessfulCosmosBatch(response: unknown, expectedOperationCount: number): void {
  if (!Number.isSafeInteger(expectedOperationCount) || expectedOperationCount < 1) {
    throw new CosmosBatchFailureError("Cosmos transactional batch has an invalid expected operation count.");
  }
  if (!response || typeof response !== "object") {
    throw new CosmosBatchFailureError("Cosmos transactional batch returned a malformed response.");
  }

  const record = response as { result?: unknown; statusCode?: unknown; code?: unknown };
  const responseStatus = readStatusCode(record);
  if (responseStatus === 409 || responseStatus === 412) {
    throw new CosmosBatchConflictError(responseStatus);
  }
  if (!Array.isArray(record.result) || record.result.length !== expectedOperationCount) {
    throw new CosmosBatchFailureError("Cosmos transactional batch returned an incomplete operation result list.");
  }
  // Cosmos may report 424 Failed Dependency for peers of an operation that
  // failed with 409/412. Find the actual conflict before classifying peers.
  for (const operation of record.result) {
    const statusCode = readStatusCode(operation);
    if (statusCode === 409 || statusCode === 412) {
      throw new CosmosBatchConflictError(statusCode);
    }
  }
  assertSuccessfulStatus(responseStatus, "response");
  for (let index = 0; index < record.result.length; index += 1) {
    assertSuccessfulStatus(readStatusCode(record.result[index]), `operation ${index + 1}`);
  }
}
