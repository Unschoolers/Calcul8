import { inject, type InjectionKey } from "vue";
import type { AuthComputedState } from "../../../app-core/context/auth.ts";
import type { BuyerMethodState } from "../../../app-core/context/buyers.ts";
import type { CommerceMethodState } from "../../../app-core/context/commerce.ts";
import type {
  PortfolioComputedState,
  PortfolioMethodState
} from "../../../app-core/context/portfolio.ts";
import type { RuntimeMethodState } from "../../../app-core/context/runtime.ts";
import type { WorkspaceMethodState } from "../../../app-core/context/workspace.ts";
import type { AppState } from "../../../types/app.ts";
import { createCapabilityPorts } from "../../../app-core/context/capabilityPorts.ts";

/**
 * Read and command capabilities owned by the Portfolio window. Keeping this
 * contract here prevents the view from depending on the application aggregate.
 */
export type PortfolioWindowPorts = Pick<
  AppState,
  | "currentLotId"
  | "googleAvatarLoadFailed"
  | "lots"
  | "portfolioChartView"
  | "portfolioDashboardPreset"
  | "portfolioLotFilterIds"
  | "portfolioLotTypeFilter"
  | "portfolioSalesByUserMetric"
  | "salesByLotId"
  | "workspaceMembers"
> &
  Pick<AuthComputedState, "googleProfilePicture"> &
  Pick<
    PortfolioComputedState,
    | "allLotPerformance"
    | "averagePortfolioForecastScenario"
    | "hasPortfolioData"
    | "hasPortfolioSalesByUserData"
    | "portfolioLotFilterItems"
    | "portfolioSalesByUserChartData"
    | "portfolioSalesByUserDrilldownRows"
    | "portfolioTotals"
  > &
  Pick<PortfolioMethodState, "togglePortfolioChartView"> &
  Pick<CommerceMethodState, "formatDate"> &
  Pick<RuntimeMethodState, "t" | "formatCurrency"> &
  Pick<BuyerMethodState, "getBuyerProfile"> &
  Pick<WorkspaceMethodState, "getWorkspaceMemberPresenceState">;

export const portfolioWindowPortsKey: InjectionKey<PortfolioWindowPorts> = Symbol("portfolioWindowPorts");

const portfolioWindowPortKeys = [
  "currentLotId",
  "googleAvatarLoadFailed",
  "lots",
  "portfolioChartView",
  "portfolioDashboardPreset",
  "portfolioLotFilterIds",
  "portfolioLotTypeFilter",
  "portfolioSalesByUserMetric",
  "salesByLotId",
  "workspaceMembers",
  "googleProfilePicture",
  "allLotPerformance",
  "averagePortfolioForecastScenario",
  "hasPortfolioData",
  "hasPortfolioSalesByUserData",
  "portfolioLotFilterItems",
  "portfolioSalesByUserChartData",
  "portfolioSalesByUserDrilldownRows",
  "portfolioTotals",
  "togglePortfolioChartView",
  "formatDate",
  "t",
  "formatCurrency",
  "getBuyerProfile",
  "getWorkspaceMemberPresenceState"
] as const satisfies readonly (keyof PortfolioWindowPorts)[];

export function createPortfolioWindowPorts(source: PortfolioWindowPorts): PortfolioWindowPorts {
  return createCapabilityPorts(source, portfolioWindowPortKeys);
}

export function usePortfolioWindowPorts(): PortfolioWindowPorts {
  const ports = inject(portfolioWindowPortsKey, null);
  if (!ports) {
    throw new Error("Portfolio capabilities were not provided.");
  }
  return ports;
}
