import { screen, fireEvent } from "@testing-library/vue";
import { expect, test } from "vitest";
import ShopifyLinkIndicator from "../../src/components/windows/shopify/ShopifyLinkIndicator.vue";
import { renderWithApp } from "./render.ts";
import MobileLotSwitcher from "../../src/components/shell/MobileLotSwitcher.vue";
import LotSelectorOnboardingBlock from "../../src/components/shell/LotSelectorOnboardingBlock.vue";
import { shellPortsKey } from "../../src/components/shell/shellPorts.ts";
import { resolveLotSelectorDisplayItem } from "../../src/components/shell/lotSelectorDisplay.ts";

const t = (key: string) => ({ shopifyLotLinked: "Linked to Shopify", shopifyLotManaged: "Managed by Calcul8 in Shopify", shopifyLotStale: "Last known link; refresh unavailable", shopifyLotDisconnected: "Shopify disconnected; link retained", shopifyLotAttention: "This Shopify link needs attention" })[key] ?? key;

test("a linked marker is accessible and is not a tiny interactive control", () => {
  renderWithApp(ShopifyLinkIndicator, { props: { t, link: { mode: "linked", stale: false, disconnected: false, attention: false } } });
  const marker = screen.getByRole("img", { name: "Linked to Shopify" });
  expect(marker).toHaveAttribute("title", "Linked to Shopify");
  expect(marker.querySelector("svg path")?.getAttribute("d")).toBeTruthy();
  expect(marker.querySelector(".mdi-shopify")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("known disconnected links have a clear label and no invented attention warning", () => {
  renderWithApp(ShopifyLinkIndicator, { props: { t, link: { mode: "managed", stale: true, disconnected: true, attention: false } } });
  const marker = screen.getByRole("img", { name: "Managed by Calcul8 in Shopify. Shopify disconnected; link retained" });
  expect(marker).toHaveClass("shopify-link-indicator--stale");
  expect(marker.querySelector(".mdi-alert-circle-outline")).toBeNull();
});

test("an explicitly confirmed link error carries attention text", () => {
  renderWithApp(ShopifyLinkIndicator, { props: { t, link: { mode: "linked", stale: true, disconnected: false, attention: true } } });
  expect(screen.getByRole("img", { name: "Linked to Shopify. Last known link; refresh unavailable. This Shopify link needs attention" })).toBeTruthy();
});

function ports() {
  const link = { mode: "linked" as const, stale: false, disconnected: false, attention: false };
  return { activeScopeType: "personal", currentLotId: 7, currentWorkspaceName: "Personal", currentTab: "config", guidedOnboardingStatus: "completed", hasLotSelected: true, preferredLanguage: "en", t,
    resolveLotSelectorDisplayItem, selectLot: () => {}, openRenameLotModal: () => {},
    lotItems: [7, 8].map(id => ({ title: `Lot ${id}`, value: id, subtitle: "Grouped", lotType: "bulk", isComplete: id === 7, symbolIcon: "mdi-cube-outline", completionIcon: id === 7 ? "mdi-check-circle" : null, shopifyLink: link })) };
}

test("mobile current inventory and each linked row retain separate Shopify markers", async () => {
  renderWithApp(MobileLotSwitcher, { global: { provide: { [shellPortsKey as symbol]: ports() } } });
  expect(screen.getAllByRole("img", { name: "Linked to Shopify" })).toHaveLength(1);
  const trigger = screen.getByRole("button", { name: "shellOpenLotSwitcherAction" });
  expect(trigger.children).toHaveLength(3);
  expect(trigger.lastElementChild?.querySelector(".shopify-link-indicator")).toBeTruthy();
  expect(trigger.lastElementChild?.querySelector(".mobile-lot-switcher__chevron")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "shellOpenLotSwitcherAction" }));
  expect(await screen.findAllByRole("img", { name: "Linked to Shopify" })).toHaveLength(3);
  expect(screen.getByRole("option", { name: /Lot 7/ })).toHaveAttribute("aria-selected", "true");
});

test("desktop selected inventory and menu rows expose the same link marker", async () => {
  renderWithApp(LotSelectorOnboardingBlock, { global: { provide: { [shellPortsKey as symbol]: ports() } } });
  expect(screen.getAllByRole("img", { name: "Linked to Shopify" })).toHaveLength(1);
  await fireEvent.mouseDown(screen.getAllByRole("combobox").find(element => element.tagName === "INPUT")!);
  expect(await screen.findAllByRole("img", { name: "Linked to Shopify" })).toHaveLength(3);
});
