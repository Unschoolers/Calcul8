import { render, type RenderOptions } from "@testing-library/vue";
import { defineComponent, h, type Component } from "vue";
import { VApp } from "vuetify/components";
import { vuetify } from "../../src/vuetify.ts";

type RenderableComponent = Component | Record<string, unknown>;

export function renderWithApp(component: RenderableComponent, options: RenderOptions<Component> = {}) {
  const { props, ...renderOptions } = options;
  const AppShell = defineComponent({
    setup() {
      return () => h(VApp, null, {
        default: () => h(component as Component, props)
      });
    }
  });
  return render(AppShell, {
    ...renderOptions,
    global: {
      ...renderOptions.global,
      plugins: [vuetify, ...(renderOptions.global?.plugins ?? [])]
    }
  });
}
