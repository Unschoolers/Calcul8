import { fireEvent, screen } from "@testing-library/vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import ContextActionDock from "../../src/components/shell/ContextActionDock.vue";
import { renderWithApp } from "./render.ts";

describe("context action dock", () => {
  afterEach(() => {
    document.querySelectorAll(".app-shell-action-zone").forEach((element) => element.remove());
  });

  test("keeps one direct action and reveals labeled secondary actions", async () => {
    const activate = vi.fn();
    const actionLayer = document.createElement("div");
    actionLayer.className = "app-shell-action-zone";
    document.body.append(actionLayer);
    renderWithApp(ContextActionDock, {
      props: {
        active: true,
        primaryAction: {
          id: "save",
          icon: "mdi-content-save-outline",
          color: "primary",
          label: "Save prices"
        },
        secondaryActions: [
          { id: "calculator", icon: "mdi-calculator", color: "secondary", label: "Calculator" },
          { id: "reset", icon: "mdi-restore", color: "surface", label: "Reset", disabled: true }
        ],
        badgeLabel: "20%",
        secondaryLabel: "More actions",
        onActivate: activate
      }
    });

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("20%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save prices" }).closest(".app-context-action-dock")?.parentElement).toBe(actionLayer);

    await fireEvent.click(screen.getByRole("button", { name: "Save prices" }));
    expect(activate).toHaveBeenCalledWith("save");

    await fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Calculator")).toBeVisible();
    const resetRow = screen.getByText("Reset").closest(".v-list-item");
    expect(resetRow).toHaveAttribute("aria-disabled", "true");
    expect(resetRow).not.toHaveClass("text-surface");

    await fireEvent.click(screen.getByText("Calculator"));
    expect(activate).toHaveBeenCalledWith("calculator");
  });

  test("does not expose an eager inactive tab's actions", () => {
    const actionLayer = document.createElement("div");
    actionLayer.className = "app-shell-action-zone";
    document.body.append(actionLayer);
    renderWithApp(ContextActionDock, {
      props: {
        active: false,
        primaryAction: {
          id: "save",
          icon: "mdi-content-save-outline",
          color: "primary",
          label: "Save prices"
        },
        secondaryLabel: "More actions"
      }
    });

    expect(screen.queryByRole("button", { name: "Save prices" })).not.toBeInTheDocument();
    expect(actionLayer.children).toHaveLength(0);
  });
});
