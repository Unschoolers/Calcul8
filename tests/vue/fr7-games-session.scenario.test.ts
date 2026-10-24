import { screen } from "@testing-library/vue";
import { reactive } from "vue";
import { expect, test } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { ensureWheelControllerState } from "../../src/components/windows/game/coordinator/gameControllerState.ts";
import { beginWheelSpin } from "../../src/components/windows/game/services/wheelSpinState.ts";
import { wheelSessionMethods } from "../../src/components/windows/game/commands/wheelSessionMethods.ts";
import WheelHistoryPanel from "../../src/components/windows/game/inspector/WheelHistoryPanel.vue";
import type { PendingWheelChaseObligation, WheelConfig } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

function makeProofContext(language: string) {
  const context = reactive({
    ...createInitialState(),
    preferredLanguage: language,
    wheelMode: "live" as const
  });
  ensureWheelControllerState(context);
  return context;
}

test("beginWheelSpin preserves the exact English in-progress result", () => {
  const context = makeProofContext("en");
  beginWheelSpin(context, { hash: "commit-hash", algorithm: "whatfees-wheel-v1" });
  expect(context.wheelLastResult).toBe("Spinning…");
});

test("beginWheelSpin localizes its in-progress result in French", () => {
  const context = makeProofContext("fr-CA");
  beginWheelSpin(context, { hash: "commit-hash", algorithm: "whatfees-wheel-v1" });
  expect(context.wheelLastResult).toBe("Tirage en cours…");
});

test("WheelHistoryPanel renders the spinning result and proof in progress", () => {
  const context = makeProofContext("en");
  beginWheelSpin(context, { hash: "commit-hash", algorithm: "whatfees-wheel-v1" });

  renderWithApp(WheelHistoryPanel, {
    props: { ctx: context },
    global: { provide: { gameCtx: context } }
  });

  expect(screen.getByText("Spinning…")).toBeVisible();
  expect(screen.getByText("Hash")).toBeVisible();
  expect(screen.getByText("Result locked")).toBeVisible();
});

function renderLatestProof(language: string, verificationUrl?: string) {
  const context = makeProofContext(language);
  context.wheelFairnessHistory = [{
    spinNumber: 1,
    label: "Linked card",
    color: "#ff0000",
    hash: "proof-hash",
    clientSeed: "client-seed",
    seed: "proof-seed",
    timestamp: 1,
    ...(verificationUrl ? { verificationUrl } : {})
  }];
  return renderWithApp(WheelHistoryPanel, {
    props: { ctx: context, latestOnly: true },
    global: { provide: { gameCtx: context } }
  });
}

test("mounted latest server proof renders the approved French title, mode, hash and seeds", () => {
  renderLatestProof("fr-CA", "https://example.test/proof");

  expect(screen.getAllByText("Preuve du serveur")).toHaveLength(2);
  expect(screen.getByText("Empreinte (hash)")).toBeVisible();
  expect(screen.getByText("Graine du client")).toBeVisible();
  expect(screen.getByText("Graine (seed)")).toBeVisible();
  expect(screen.getByText("proof-hash")).toBeVisible();
  expect(screen.getByText("client-seed")).toBeVisible();
  expect(screen.getByText("proof-seed")).toBeVisible();
});

test("mounted latest local proof renders French mode and EN/default proof labels", () => {
  const frenchView = renderLatestProof("fr-CA");
  expect(screen.getAllByText("Preuve locale")).toHaveLength(2);
  expect(screen.getByText("Empreinte (hash)")).toBeVisible();
  expect(screen.getByText("Graine du client")).toBeVisible();
  expect(screen.getByText("Graine (seed)")).toBeVisible();

  frenchView.unmount();
  renderLatestProof("");
  expect(screen.getByText("Local verified")).toBeVisible();
  expect(screen.getByText("Local fallback")).toBeVisible();
  expect(screen.getByText("Hash")).toBeVisible();
  expect(screen.getByText("Client seed")).toBeVisible();
  expect(screen.getByText("Seed")).toBeVisible();
});

test("mounted locked proof keeps EN title and default labels", () => {
  const context = makeProofContext("");
  beginWheelSpin(context, { hash: "locked-hash", algorithm: "whatfees-wheel-v1" });
  renderWithApp(WheelHistoryPanel, {
    props: { ctx: context },
    global: { provide: { gameCtx: context } }
  });

  expect(screen.getByText("Result locked")).toBeVisible();
  expect(screen.getByText("Hash")).toBeVisible();
  expect(screen.getByText("locked-hash")).toBeVisible();
});

function makePendingChaseContext(sourceChanged: boolean) {
  const config: WheelConfig = {
    id: 42,
    name: "Original wheel",
    spinPrice: 5,
    targetMargin: 40,
    createdAt: "",
    tiers: [{
      id: "chase",
      label: "Prize",
      color: "#ff0000",
      slots: 1,
      costPerTier: 2,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }]
  };
  const context = makeProofContext("fr-CA");
  context.wheelConfigs = [{ ...config, ...(sourceChanged ? { name: "Changed wheel" } : {}) }];
  context.activeWheelConfigId = config.id;
  context.lots = [{ id: 7, name: "Bulk lot", lotType: "bulk" }] as unknown as typeof context.lots;
  context.wheelPendingChase = {
    version: 1,
    configId: config.id,
    spinNumber: 1,
    tierId: "chase",
    slotIndex: 0,
    originalConfig: config,
    originalSourceJson: JSON.stringify(config),
    originalTier: config.tiers[0]!,
    originalPrize: {
      slotLabel: "Prize",
      slotColor: "#ff0000",
      lotId: 7,
      singlesEntryId: null,
      lotType: "bulk",
      itemLabel: "Prize"
    },
    saleDraft: null
  } satisfies PendingWheelChaseObligation;
  return context;
}

test.each([
  [false, "Réglez ce prix vedette en choisissant Garder ou Remplacer avant de l’enregistrer avec les ventes prêtes."],
  [true, "Ce prix vedette reste en attente parce que la source d’origine du jeu ou du prix a changé. Restaurez cette source pour continuer."]
] as const)("reopenPendingChaseDecision localizes the real French %s-source warning", (sourceChanged, expected) => {
  const context = makePendingChaseContext(sourceChanged);
  wheelSessionMethods.reopenPendingChaseDecision.call(context as never);
  expect(Reflect.get(context, "wheelChaseDialog")).toBe(true);
  expect(context.wheelInventoryWarning).toBe(expected);
});
