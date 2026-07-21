import type {
  AppState,
  BuyerProfile
} from "../../types/app.ts";
import type { ScopedApiContext } from "./api.ts";
import type { FeatureMethodImplementation, RuntimeMethodState } from "./runtime.ts";

export interface BuyerMethodState {
  hydrateBuyerProfiles(): Promise<void>;
  getBuyerProfile(username: string): BuyerProfile | null;
  saveBuyerProfile(draft: {
    username: string;
    preferredName?: string;
    tags: string[];
  }): Promise<"saved" | "pending" | "conflict" | "error">;
  retryPendingBuyerProfiles(): Promise<void>;
  resolveBuyerProfileConflict(
    username: string,
    strategy: "retry" | "reload"
  ): Promise<"saved" | "pending" | "error" | "reloaded">;
}

/** Scope-aware transport required by the buyer profile API. */
export type BuyerProfileApiContext = ScopedApiContext;

/** Local-first buyer state persisted independently for each active scope. */
export type BuyerProfileCacheContext = Pick<
  AppState,
  | "buyerProfilesByKey"
  | "buyerProfilesScopeKey"
  | "buyerProfilesLoadStatus"
  | "buyerProfileSaveStates"
  | "buyerProfilePendingMutations"
>;

/** Complete state used by the buyer profile cache/outbox coordinator. */
export type BuyerProfileStoreContext = BuyerProfileApiContext &
  BuyerProfileCacheContext &
  Pick<AppState, "isOffline">;

export type BuyerMethodContext = BuyerProfileStoreContext &
  Pick<RuntimeMethodState, "t">;

export type BuyerMethodImplementation = FeatureMethodImplementation<
  BuyerMethodContext,
  BuyerMethodState
>;
