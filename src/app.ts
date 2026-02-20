import { LivePriceCard } from "./components/LivePriceCard.ts";
import { ConfigWindow } from "./components/windows/ConfigWindow.ts";
import { LiveWindow } from "./components/windows/LiveWindow.ts";
import { SalesWindow } from "./components/windows/SalesWindow.ts";
import { PortfolioWindow } from "./components/windows/PortfolioWindow.ts";
import { appComputed } from "./app-core/computed.ts";
import { appLifecycle } from "./app-core/lifecycle.ts";
import { appMethods } from "./app-core/methods/index.ts";
import { createInitialState } from "./app-core/state.ts";
import { appWatch } from "./app-core/watch.ts";

export const appOptions = {
  components: {
    LivePriceCard,
    ConfigWindow,
    LiveWindow,
    SalesWindow,
    PortfolioWindow
  },
  data: createInitialState,
  provide() {
    return {
      appCtx: this
    };
  },
  mounted: appLifecycle.mounted,
  beforeUnmount: appLifecycle.beforeUnmount,
  watch: { ...appWatch },
  computed: { ...appComputed },
  methods: { ...appMethods }
};
