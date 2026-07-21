import type { BuyerProfile } from "../../../../types/app.ts";
import type { BuyerMethodImplementation } from "../../../context/buyers.ts";
import { normalizeBuyerKey } from "../../../computed/buyer-quick-view.ts";
import {
  hydrateBuyerProfilesForActiveScope,
  resolveBuyerProfileConflictForApp,
  retryPendingBuyerProfilesForApp,
  saveBuyerProfileForApp,
  type BuyerProfileDraft
} from "./buyer-profile-store.ts";

export const uiBuyerProfileMethods = {
  async hydrateBuyerProfiles(): Promise<void> {
    await hydrateBuyerProfilesForActiveScope(this);
  },

  getBuyerProfile(username: string): BuyerProfile | null {
    const key = normalizeBuyerKey(username);
    return key ? this.buyerProfilesByKey[key] ?? null : null;
  },

  async saveBuyerProfile(draft: BuyerProfileDraft): Promise<"saved" | "pending" | "conflict" | "error"> {
    const result = await saveBuyerProfileForApp(this, draft);
    if (result === "saved") this.notify(this.t("buyerProfileSavedMessage"), "success");
    if (result === "pending") this.notify(this.t("buyerProfilePendingMessage"), "info");
    if (result === "conflict") this.notify(this.t("buyerProfileConflictMessage"), "warning");
    if (result === "error") this.notify(this.t("buyerProfileErrorMessage"), "error");
    return result;
  },

  async retryPendingBuyerProfiles(): Promise<void> {
    await retryPendingBuyerProfilesForApp(this);
  },

  async resolveBuyerProfileConflict(
    username: string,
    strategy: "retry" | "reload"
  ): Promise<"saved" | "pending" | "error" | "reloaded"> {
    return resolveBuyerProfileConflictForApp(this, username, strategy);
  }
} satisfies BuyerMethodImplementation;
