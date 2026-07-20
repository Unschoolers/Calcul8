import type {
  BeforeInstallPromptEvent,
  LotType,
  UiColor
} from "../../types/app.ts";
import type { AppTranslationKey } from "../i18n/index.ts";

export interface RuntimeComputedState {
  isDark: boolean;
  liveProfitTargetBadgeVisible: boolean;
  liveProfitTargetBadgeLabel: string;
}

export interface RuntimeMethodState {
  t(key: AppTranslationKey, params?: Record<string, string | number | null | undefined>): string;
  setPreferredLanguage(language: string): void;
  syncGuidedOnboarding(): void;
  startGuidedOnboarding(lotType: LotType): void;
  dismissGuidedOnboarding(): void;
  stopGuidedOnboarding(): void;
  handleGuidedOnboardingLotCreated(lotType: LotType, lotId: number): void;
  toggleTheme(): void;
  notify(message: string, color?: UiColor): void;
  askConfirmation(
    payload: { title: string; text: string; color?: UiColor },
    action: () => void
  ): void;
  runConfirmAction(): void;
  cancelConfirmAction(): void;
  getExchangeRate(): Promise<void>;
  formatCurrency(value: number | null | undefined, decimals?: number): string;
  safeFixed(value: number, decimals?: number): string;
  setupPwaUiHandlers(): void;
  startOfflineReconnectScheduler(): void;
  stopOfflineReconnectScheduler(): void;
  promptInstall(): Promise<void>;
  applyAppUpdate(): void;
  dismissAppUpdate(): void;
  unregisterServiceWorkersForDev(): Promise<void>;
  registerServiceWorker(): void;
}

export interface AppVueContext {
  $nextTick(callback: () => void): Promise<void>;
  $refs: {
    salesChart?: HTMLCanvasElement;
    salesTrendChart?: HTMLCanvasElement;
    portfolioChart?: HTMLCanvasElement;
  };
  $vuetify: {
    theme: {
      change(name: "unionArenaDark" | "unionArenaLight"): void;
      global: {
        name: string;
      };
    };
  };
}

export type RuntimeComputedContext = Pick<AppVueContext, "$vuetify">;

export type RuntimeComputedObject = FeatureComputedObject<
  Pick<RuntimeComputedState, "isDark">,
  RuntimeComputedContext
>;

export type FeatureComputedObject<ComputedState, Context> = {
  [Key in keyof ComputedState]: (this: Context) => ComputedState[Key];
};
