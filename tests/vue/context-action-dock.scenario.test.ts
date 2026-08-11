import { fireEvent, render, screen } from "@testing-library/vue";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import ContextActionDock from "../../src/components/shell/ContextActionDock.vue";
import { createShellActionPresence, shellActionPresenceKey } from "../../src/components/shell/shellActionPresence.ts";
import { vuetify } from "../../src/vuetify.ts";
import { VApp } from "vuetify/components";
import { renderWithApp } from "./render.ts";

function renderDock(props: Record<string, unknown>) {
  return renderWithApp(ContextActionDock, {
    props,
    global: {
      provide: {
        [shellActionPresenceKey as symbol]: createShellActionPresence({ visibleShellContextActionIds: [] })
      }
    }
  });
}

describe("context action dock", () => {
  afterEach(() => {
    document.querySelectorAll(".app-shell-action-zone").forEach((element) => element.remove());
  });

  test("keeps one direct action and reveals labeled secondary actions", async () => {
    const activate = vi.fn();
    const actionLayer = document.createElement("div");
    actionLayer.className = "app-shell-action-zone";
    document.body.append(actionLayer);
    renderDock({
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
    renderDock({
      active: false,
      primaryAction: {
        id: "save",
        icon: "mdi-content-save-outline",
        color: "primary",
        label: "Save prices"
      },
      secondaryLabel: "More actions"
    });

    expect(screen.queryByRole("button", { name: "Save prices" })).not.toBeInTheDocument();
    expect(actionLayer.children).toHaveLength(0);
  });

  test("synchronizes the shell action registry across active changes and unmount", async () => {
    const actionLayer = document.createElement("div");
    actionLayer.className = "app-shell-action-zone";
    document.body.append(actionLayer);
    const visibleShellContextActionIds: string[] = [];
    const DockHarness = defineComponent({
      props: {
        active: { type: Boolean, required: true }
      },
      setup(props) {
        return () => h(VApp, null, {
          default: () => h(ContextActionDock, {
            active: props.active,
            primaryAction: {
              id: "save",
              icon: "mdi-content-save-outline",
              color: "primary",
              label: "Save prices"
            },
            secondaryLabel: "More actions"
          })
        });
      }
    });
    const view = render(DockHarness, {
      props: {
        active: true
      },
      global: {
        plugins: [vuetify],
        provide: {
          [shellActionPresenceKey as symbol]: createShellActionPresence({ visibleShellContextActionIds })
        }
      }
    });

    expect(visibleShellContextActionIds).toHaveLength(1);

    await view.rerender({ active: false });
    expect(visibleShellContextActionIds).toEqual([]);

    view.unmount();
    expect(visibleShellContextActionIds).toEqual([]);
  });
});
