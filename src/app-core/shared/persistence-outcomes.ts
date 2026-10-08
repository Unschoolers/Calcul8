export type PersistenceOutcome =
  | {
      kind: "confirmed";
      persistence: "local" | "cloud";
      cache: "saved" | "not-applicable";
      cloud: "confirmed" | "skipped-offline" | "unavailable";
    }
  | {
      kind: "skipped";
      reason: "offline" | "auth" | "unavailable" | "duplicate" | "stale-scope" | "no-lot" | "not-ready" | "cancelled";
    }
  | {
      kind: "conflict";
      latestState: "loaded" | "unavailable";
    }
  | {
      kind: "failure";
      error: unknown;
      stage: "local" | "cloud" | "cache" | "sync";
      cloudConfirmed?: true;
      status?: number;
    };

export function handleBackgroundPersistenceOutcome(
  outcome: PersistenceOutcome,
  operation: string
): void {
  if (!outcome) return;
  if (outcome.kind === "failure") {
    console.warn(`[whatfees] ${operation} failed`, {
      error: outcome.error,
      stage: outcome.stage,
      cloudConfirmed: outcome.cloudConfirmed === true,
      status: outcome.status
    });
    return;
  }
  if (outcome.kind === "conflict") {
    console.warn(`[whatfees] ${operation} requires conflict recovery`, outcome);
    return;
  }
  if (outcome.kind === "skipped" && outcome.reason !== "offline") {
    console.info(`[whatfees] ${operation} skipped`, outcome.reason);
  }
}

export function voidBackgroundPersistence(work: Promise<PersistenceOutcome>, operation: string): void {
  void work
    .then((outcome) => handleBackgroundPersistenceOutcome(outcome, operation))
    .catch((error: unknown) => {
      console.warn(`[whatfees] ${operation} coordinator failed`, error);
    });
}
