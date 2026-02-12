import { LivePriceCard } from "./components/LivePriceCard.ts";
import { appComputed } from "./app-core/computed.ts";
import { appLifecycle } from "./app-core/lifecycle.ts";
import { appMethods } from "./app-core/methods/index.ts";
import { createInitialState } from "./app-core/state.ts";
import { appWatch } from "./app-core/watch.ts";

export const appOptions = {
  components: {
    LivePriceCard
  },
  data: createInitialState,
  mounted: appLifecycle.mounted,
  beforeUnmount: appLifecycle.beforeUnmount,
  watch: { ...appWatch },
  computed: { ...appComputed },
  methods: { ...appMethods }
};
