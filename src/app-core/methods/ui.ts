import type { AppMethodImplementation } from "../context-app.ts";
import { uiAccountMethods } from "./ui/auth/account.ts";
import { uiBaseMethods } from "./ui/common/base.ts";
import { uiEntitlementMethods } from "./ui/entitlements/entitlements.ts";
import { uiOnboardingMethods } from "./ui/common/onboarding.ts";
import { uiSyncMethods } from "./ui/sync/sync.ts";
import { uiWhatnotMethods } from "./ui/whatnot/whatnot.ts";
import { uiWorkspaceMethods } from "./ui/workspace/workspaces.ts";
import { uiBuyerProfileMethods } from "./ui/buyers/buyer-profiles.ts";

export const uiMethods = {
  ...uiBaseMethods,
  ...uiOnboardingMethods,
  ...uiAccountMethods,
  ...uiEntitlementMethods,
  ...uiWhatnotMethods,
  ...uiSyncMethods,
  ...uiWorkspaceMethods,
  ...uiBuyerProfileMethods
} satisfies AppMethodImplementation;

