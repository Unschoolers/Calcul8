import { screen, fireEvent } from "@testing-library/vue";
import { expect, test } from "vitest";
import { reactive } from "vue";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import LotSelectorOnboardingBlock from "../../src/components/shell/LotSelectorOnboardingBlock.vue";
import { shellPortsKey } from "../../src/components/shell/shellPorts.ts";
import { renderWithApp } from "./render.ts";

test.each([
  ["en", "Add inventory"],
  ["fr-CA", "Ajouter un inventaire"]
])("after skipping onboarding, the %s empty state opens the existing add inventory flow", async (language, actionLabel) => {
  const ports = reactive({
    activeScopeType: "personal",
    currentLotId: null,
    currentTab: "portfolio",
    guidedOnboardingStatus: "dismissed",
    hasLotSelected: false,
    showNewLotModal: false,
    preferredLanguage: language,
    lotItems: [],
    t: (key: string) => translateAppMessage(language, key)
  });
  renderWithApp(LotSelectorOnboardingBlock, { global: { provide: { [shellPortsKey as symbol]: ports } } });

  await fireEvent.click(screen.getByRole("button", { name: actionLabel }));

  expect(ports.showNewLotModal).toBe(true);
});
