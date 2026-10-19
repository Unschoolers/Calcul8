import { defineComponent, h } from "vue";
import { render, screen } from "@testing-library/vue";
import { describe, expect, test } from "vitest";
import { VApp, VSpeedDial } from "vuetify/components";
import { vuetify } from "../../src/vuetify.ts";
import SalesFabActivator from "../../src/components/shell/SalesFabActivator.vue";

describe("sales cart action accessibility reproduction", () => {
  test.each(["Add sale", "Ajouter une vente"])("renders the cart icon alongside the visible label %s", (label) => {
    render(SalesFabActivator, {
      props: { label, disabled: false },
      global: { plugins: [vuetify] }
    });

    const button = screen.getByRole("button", { name: label });
    expect(button).toHaveTextContent(label);
    expect(button.querySelector(".mdi-cart-plus")).not.toBeNull();
    expect(button).not.toHaveClass("v-btn--icon");
  });

  test("keeps the sales action disabled when no lot is selected", () => {
    render(SalesFabActivator, {
      props: { label: "Add sale", disabled: true },
      global: { plugins: [vuetify] }
    });

    expect(screen.getByRole("button", { name: "Add sale" })).toBeDisabled();
  });

  test("renders a named sales activator for pro users on the sales tab", () => {
    const harness = defineComponent({
      setup() {
        const currentTab = "sales";
        const hasProAccess = true;
        const label = "Add sale";
        return () => h(VApp, null, {
          default: () => currentTab === "sales" && hasProAccess
            ? h(VSpeedDial, { modelValue: false, location: "top center" }, {
              activator: ({ props }: { props: Record<string, unknown> }) => h(SalesFabActivator, {
                activatorProps: props,
                label,
                disabled: false
              })
            })
            : null
        });
      }
    });

    render(harness, { global: { plugins: [vuetify] } });

    expect(screen.getByRole("button", { name: "Add sale" })).toBeInTheDocument();
  });
});
