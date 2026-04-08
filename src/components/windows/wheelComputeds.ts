import { wheelFairnessComputeds } from "./wheelFairnessComputeds.ts";
import { wheelGeneralComputeds } from "./wheelGeneralComputeds.ts";
import { wheelInspectorComputeds } from "./wheelInspectorComputeds.ts";
import { wheelSessionComputeds } from "./wheelSessionComputeds.ts";

export const wheelComputeds = {
  ...wheelInspectorComputeds,
  ...wheelGeneralComputeds,
  ...wheelFairnessComputeds,
  ...wheelSessionComputeds
};
