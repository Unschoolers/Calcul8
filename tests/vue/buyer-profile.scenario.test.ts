import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import BuyerIdentityLabel from "../../src/components/customers/BuyerIdentityLabel.vue";
import BuyerQuickViewHost from "../../src/components/customers/BuyerQuickViewHost.vue";
import BuyerQuickViewModal from "../../src/components/customers/BuyerQuickViewModal.vue";
import {
  buyerProfilePortsKey,
  type BuyerProfilePorts
} from "../../src/components/customers/buyerProfilePorts.ts";
import type { BuyerProfile } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

const words: Record<string, string> = {
  buyerQuickViewTitle: "Buyer",
  buyerQuickViewCloseLabel: "Close",
  buyerQuickViewEditProfileLabel: "Edit buyer",
  buyerQuickViewPreferredNameLabel: "Preferred name",
  buyerQuickViewTagsLabel: "Tags",
  buyerQuickViewSaveProfileLabel: "Save profile",
  buyerQuickViewCancelEditLabel: "Cancel",
  buyerQuickViewConflictMessage: "This buyer changed in another session.",
  buyerQuickViewPendingMessage: "Saved offline. Sync pending.",
  buyerQuickViewErrorMessage: "The profile could not be saved.",
  buyerQuickViewRetryLabel: "Retry",
  buyerQuickViewReloadLabel: "Reload",
  buyerQuickViewTotalLotLabel: "Current lot",
  buyerQuickViewTotalAllLotsLabel: "All lots",
  buyerQuickViewPurchasesLotLabel: "Current purchases",
  buyerQuickViewPurchasesAllLotsLabel: "All purchases",
  buyerQuickViewLastPurchaseLabel: "Last purchase",
  buyerQuickViewPurchaseSingularLabel: "purchase",
  buyerQuickViewPurchasePluralLabel: "purchases",
  buyerQuickViewNoPurchasesLabel: "No purchases",
  buyerQuickViewGroupedTitle: "By lot",
  buyerQuickViewLotColumnLabel: "Lot",
  buyerQuickViewPurchasesColumnLabel: "Purchases",
  buyerQuickViewTotalColumnLabel: "Total",
  buyerQuickViewLastColumnLabel: "Last",
  buyerQuickViewCurrentLotBadge: "Current"
};
const t = (key: string) => words[key] ?? key;
const profile: BuyerProfile = {
  username: "cardking27",
  preferredName: "Marc",
  tags: ["VIP", "Pokémon", "Local"],
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  version: 1
};
const summary = {
  username: "cardking27",
  totalSpentForCurrentLot: 20,
  totalSpentAllLots: 50,
  purchasesForCurrentLot: 1,
  purchasesAllLots: 2,
  lastPurchaseDate: "2026-07-20",
  groupedByLot: []
};

describe("buyer profile scenarios", () => {
  test("loads and saves through the injected buyer capability port", async () => {
    const saveBuyerProfile = vi.fn(async () => "saved" as const);
    const ports: BuyerProfilePorts = {
      buyerProfilesByKey: { cardking27: profile },
      buyerProfileSaveStates: {},
      getBuyerProfile: (username) => username === profile.username ? profile : null,
      saveBuyerProfile,
      resolveBuyerProfileConflict: vi.fn(async () => "reloaded" as const)
    };

    renderWithApp(BuyerQuickViewHost, {
      props: {
        modelValue: true,
        summary,
        t,
        formatDate: (value: string) => value,
        fmtCurrency: (value: number) => value.toFixed(2)
      },
      global: { provide: { [buyerProfilePortsKey as symbol]: ports } }
    });

    expect(screen.getByText("Marc")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Edit buyer" }));
    await fireEvent.update(screen.getByLabelText("Preferred name"), "Marcel");
    await fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(saveBuyerProfile).toHaveBeenCalledWith(expect.objectContaining({ preferredName: "Marcel" }));
  });

  test("renders preferred name, username, and compact tag overflow accessibly", () => {
    renderWithApp(BuyerIdentityLabel, { props: { username: profile.username, profile, maxVisibleTags: 2 } });

    expect(screen.getByLabelText("Marc (@cardking27), VIP, Pokémon, Local")).toBeVisible();
    expect(screen.getByText("Marc")).toBeVisible();
    expect(screen.getByText("@cardking27")).toBeVisible();
    expect(screen.getByText("+1")).toBeVisible();
  });

  test("edits and emits normalized buyer metadata without changing the username", async () => {
    const onSaveProfile = vi.fn();
    renderWithApp(BuyerQuickViewModal, { props: {
      modelValue: true,
      summary,
      profile,
      saveState: "idle",
      t,
      formatDate: (value: string) => value,
      fmtCurrency: (value: number) => value.toFixed(2),
      onSaveProfile
    } });

    await fireEvent.click(screen.getByRole("button", { name: "Edit buyer" }));
    const preferredName = screen.getByLabelText("Preferred name");
    await fireEvent.update(preferredName, "Marcel");
    await fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onSaveProfile).toHaveBeenCalledWith({
      username: "cardking27",
      preferredName: "Marcel",
      tags: ["VIP", "Pokémon", "Local"]
    });
  });

  test("preserves conflict recovery actions", async () => {
    const onRetryProfile = vi.fn();
    const onReloadProfile = vi.fn();
    renderWithApp(BuyerQuickViewModal, { props: {
      modelValue: true,
      summary,
      profile,
      saveState: "conflict",
      t,
      formatDate: (value: string) => value,
      fmtCurrency: (value: number) => value.toFixed(2),
      onRetryProfile,
      onReloadProfile
    } });

    expect(screen.getByText("This buyer changed in another session.")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onRetryProfile).toHaveBeenCalledOnce();
    expect(onReloadProfile).toHaveBeenCalledOnce();
  });

  test("makes offline pending state visible", () => {
    renderWithApp(BuyerQuickViewModal, { props: {
      modelValue: true,
      summary,
      profile,
      saveState: "pending",
      t,
      formatDate: (value: string) => value,
      fmtCurrency: (value: number) => value.toFixed(2)
    } });

    expect(screen.getByText("Saved offline. Sync pending.")).toBeVisible();
  });
});
