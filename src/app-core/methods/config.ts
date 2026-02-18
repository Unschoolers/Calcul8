import { configIoMethods } from "./config-io.ts";
import { configLotMethods } from "./config-lots.ts";
import { configPricingMethods } from "./config-pricing.ts";
import { type ConfigMethods } from "./config-shared.ts";
import { configStorageMethods } from "./config-storage.ts";

export const configMethods: ConfigMethods = {
  ...configStorageMethods,
  ...configLotMethods,
  ...configIoMethods,
  ...configPricingMethods
};
