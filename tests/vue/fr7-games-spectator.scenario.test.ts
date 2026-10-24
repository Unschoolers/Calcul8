import { fireEvent, screen } from "@testing-library/vue";
import { reactive } from "vue";
import { expect, test, vi } from "vitest";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import GameSpectatorDialog from "../../src/components/windows/game/dialogs/GameSpectatorDialog.vue";
import { gameStageComputeds } from "../../src/components/windows/game/stage/gameStageComputeds.ts";
import { renderWithApp } from "./render.ts";

test("mounted spectator dialog renders localized live invitation, status, and actions", async () => {
  const context = reactive({
    preferredLanguage: "fr-CA",
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("fr-CA", key, params),
    gameSpectatorDialog: true,
    gameSpectatorSessionId: "abc123",
    gameSpectatorSessionStatus: "live",
    gameSpectatorConnectedCount: 1,
    gameSpectatorSessionUrl: "https://example.test/spectator?session=abc123",
    gameSpectatorSessionQrUrl: "qr:abc123",
    gameSpectatorPublishPending: false,
    gameSpectatorDialogHint: gameStageComputeds.gameSpectatorDialogHint.call({
      preferredLanguage: "fr-CA", gameSpectatorSessionStatus: "live"
    } as never),
    gameSpectatorStartButtonLabel: gameStageComputeds.gameSpectatorStartButtonLabel.call({
      preferredLanguage: "fr-CA", gameSpectatorSessionStatus: "live"
    } as never),
    startGameSpectatorMode: vi.fn(),
    copyGameSpectatorLink: vi.fn(),
    openGameSpectatorPage: vi.fn(),
    endGameSpectatorMode: vi.fn(),
    closeGameSpectatorDialog: vi.fn()
  });

  renderWithApp(GameSpectatorDialog, { props: { ctx: context } });

  expect(await screen.findByText("Affichez ce code QR pendant votre diffusion en direct pour que les spectateurs suivent le jeu sur leur téléphone.")).toBeVisible();
  expect(screen.getByText("En direct")).toBeVisible();
  expect(screen.getByRole("button", { name: "Copier le lien" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Terminer le mode spectateur" })).toBeVisible();

  await fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
  expect(context.copyGameSpectatorLink).toHaveBeenCalledOnce();
});

test("spectator end dialog asks viewers to share a fresh link and exposes a localized restart action", async () => {
  const context = reactive({
    preferredLanguage: "fr-CA",
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("fr-CA", key, params),
    gameSpectatorDialog: true,
    gameSpectatorSessionId: "abc123",
    gameSpectatorSessionStatus: "ended",
    gameSpectatorConnectedCount: 0,
    gameSpectatorSessionUrl: "https://example.test/spectator?session=abc123",
    gameSpectatorSessionQrUrl: "qr:abc123",
    gameSpectatorPublishPending: false,
    gameSpectatorDialogHint: gameStageComputeds.gameSpectatorDialogHint.call({
      preferredLanguage: "fr-CA", gameSpectatorSessionStatus: "ended"
    } as never),
    gameSpectatorStartButtonLabel: gameStageComputeds.gameSpectatorStartButtonLabel.call({
      preferredLanguage: "fr-CA", gameSpectatorSessionStatus: "ended"
    } as never),
    startGameSpectatorMode: vi.fn(),
    copyGameSpectatorLink: vi.fn(),
    openGameSpectatorPage: vi.fn(),
    endGameSpectatorMode: vi.fn(),
    closeGameSpectatorDialog: vi.fn()
  });

  renderWithApp(GameSpectatorDialog, { props: { ctx: context } });

  expect(await screen.findByText("Cette session est terminée. Pour une nouvelle diffusion en direct, démarrez une nouvelle session spectateur, puis partagez le nouveau lien ou code QR.")).toBeVisible();
  expect(screen.getByText("Récapitulatif")).toBeVisible();
  const restart = screen.getByRole("button", { name: "Démarrer une nouvelle session spectateur" });
  expect(restart).toBeVisible();
  await fireEvent.click(restart);
  expect(context.startGameSpectatorMode).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Terminer le mode spectateur" })).toBeNull();
});

test("spectator stage count preserves zero label and localizes singular and plural counts", () => {
  const countLabel = (preferredLanguage: string, count: number, status = "live") =>
    gameStageComputeds.gameSpectatorActionLabel.call({
      preferredLanguage,
      gameSpectatorConnectedCount: count,
      gameSpectatorSessionStatus: status
    } as never);

  expect(countLabel("fr-CA", 0)).toBe("Spectateurs");
  expect(countLabel("fr-CA", 1)).toBe("1 spectateur");
  expect(countLabel("fr-CA", 3)).toBe("3 spectateurs");
  expect(countLabel("en", 0)).toBe("Spectators");
  expect(countLabel("en", 1)).toBe("1 Spectator");
  expect(countLabel("en", 3)).toBe("3 Spectators");
  expect(countLabel("", 1)).toBe("1 Spectator");
  expect(countLabel("fr-CA", 8, "ended")).toBe("Récapitulatif");
});

test("restored starting session renders English and a fresh default-language dialog offers start only", async () => {
  const restored = reactive({
    preferredLanguage: "en",
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("en", key, params),
    gameSpectatorDialog: true,
    gameSpectatorSessionId: "restored123",
    gameSpectatorSessionStatus: "starting",
    gameSpectatorConnectedCount: 0,
    gameSpectatorSessionUrl: "https://example.test/spectator?session=restored123",
    gameSpectatorSessionQrUrl: "qr:restored123",
    gameSpectatorPublishPending: false,
    gameSpectatorDialogHint: gameStageComputeds.gameSpectatorDialogHint.call({
      preferredLanguage: "en", gameSpectatorSessionStatus: "starting"
    } as never),
    gameSpectatorStartButtonLabel: gameStageComputeds.gameSpectatorStartButtonLabel.call({
      preferredLanguage: "en", gameSpectatorSessionStatus: "starting"
    } as never),
    startGameSpectatorMode: vi.fn(),
    copyGameSpectatorLink: vi.fn(),
    openGameSpectatorPage: vi.fn(),
    endGameSpectatorMode: vi.fn(),
    closeGameSpectatorDialog: vi.fn()
  });
  const restoredView = renderWithApp(GameSpectatorDialog, { props: { ctx: restored } });

  expect(await screen.findByText("Show this QR code on stream so viewers can follow the game from their own phone.")).toBeVisible();
  expect(screen.getByText("Starting")).toBeVisible();
  expect(screen.getByRole("button", { name: "End spectator mode" })).toBeVisible();
  restoredView.unmount();

  const fresh = reactive({
    preferredLanguage: "",
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("", key, params),
    gameSpectatorDialog: true,
    gameSpectatorSessionId: "",
    gameSpectatorSessionStatus: "inactive",
    gameSpectatorConnectedCount: 0,
    gameSpectatorSessionUrl: "",
    gameSpectatorSessionQrUrl: "",
    gameSpectatorPublishPending: false,
    gameSpectatorDialogHint: gameStageComputeds.gameSpectatorDialogHint.call({
      preferredLanguage: "", gameSpectatorSessionStatus: "inactive"
    } as never),
    gameSpectatorStartButtonLabel: gameStageComputeds.gameSpectatorStartButtonLabel.call({
      preferredLanguage: "", gameSpectatorSessionStatus: "inactive"
    } as never),
    startGameSpectatorMode: vi.fn(),
    copyGameSpectatorLink: vi.fn(),
    openGameSpectatorPage: vi.fn(),
    endGameSpectatorMode: vi.fn(),
    closeGameSpectatorDialog: vi.fn()
  });
  renderWithApp(GameSpectatorDialog, { props: { ctx: fresh } });

  expect(await screen.findByRole("button", { name: "Start spectator mode" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "End spectator mode" })).toBeNull();
});
