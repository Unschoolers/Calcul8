import type { ConfigurationMethodImplementation } from "../context/portfolio.ts";
import { configIoMethods } from "./config-io.ts";
import { configLotMethods } from "./config-lots.ts";
import { configPricingMethods } from "./config-pricing.ts";
import { configStorageMethods } from "./config-storage.ts";
import { liveSinglesMethods } from "./live-singles.ts";

export const configMethods = {
  ...configStorageMethods,
  ...liveSinglesMethods,
  ...configLotMethods,
  ...configIoMethods,
  ...configPricingMethods
} satisfies ConfigurationMethodImplementation;
