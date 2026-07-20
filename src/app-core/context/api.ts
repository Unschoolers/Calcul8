import type { AppState } from "../../types/app.ts";
import type { RuntimeMethodState } from "./runtime.ts";

/** Capabilities shared by scope-aware authenticated API clients. */
export type ScopedApiContext = Pick<
  AppState,
  "activeScopeType" | "activeWorkspaceId" | "googleAuthEpoch" | "hasProAccess"
> & Pick<RuntimeMethodState, "notify">;
