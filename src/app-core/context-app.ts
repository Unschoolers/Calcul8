import type { AppState } from "../types/app.ts";
import type { AuthComputedState, AuthMethodState } from "./context/auth.ts";
import type { BuyerMethodState } from "./context/buyers.ts";
import type { CommerceComputedState, CommerceMethodState } from "./context/commerce.ts";
import type { EntitlementMethodState } from "./context/entitlements.ts";
import type { GameMethodState } from "./context/game.ts";
import type { PortfolioComputedState, PortfolioMethodState } from "./context/portfolio.ts";
import type { SyncComputedState, SyncMethodState } from "./context/sync.ts";
import type {
  AppVueContext,
  RuntimeComputedState,
  RuntimeMethodState
} from "./context/runtime.ts";
import type { WhatnotComputedState, WhatnotMethodState } from "./context/whatnot.ts";
import type { WorkspaceComputedState, WorkspaceMethodState } from "./context/workspace.ts";

/**
 * Composition-root contracts. Feature modules should import their focused
 * context from `app-core/context/*` instead of depending on this aggregate.
 */
export interface AppComputedState extends
  RuntimeComputedState,
  AuthComputedState,
  CommerceComputedState,
  PortfolioComputedState,
  SyncComputedState,
  WorkspaceComputedState,
  WhatnotComputedState {}

export interface AppMethodState extends
  RuntimeMethodState,
  AuthMethodState,
  BuyerMethodState,
  EntitlementMethodState,
  CommerceMethodState,
  PortfolioMethodState,
  SyncMethodState,
  WorkspaceMethodState,
  WhatnotMethodState,
  GameMethodState {}

export type { AppVueContext } from "./context/runtime.ts";

export type AppContext = AppState & AppComputedState & AppMethodState & AppVueContext;
