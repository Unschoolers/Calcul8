import { defineComponent, h } from "vue";
import { render, screen } from "@testing-library/vue";
import { describe, expect, test } from "vitest";
import { VApp, VSpeedDial } from "vuetify/components";
import { vuetify } from "../../src/vuetify.ts";
import SalesFabActivator from "../../src/components/shell/SalesFabActivator.vue";

describe("sales cart action accessibility reproduction", () => {
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
