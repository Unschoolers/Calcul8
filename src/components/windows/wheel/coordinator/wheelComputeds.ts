import { wheelFairnessComputeds } from "../inspector/wheelFairnessComputeds.ts";
import { wheelGeneralComputeds } from "./wheelGeneralComputeds.ts";
import { wheelInspectorComputeds } from "../inspector/wheelInspectorComputeds.ts";
import { wheelSessionComputeds } from "../inspector/wheelSessionComputeds.ts";

export const wheelComputeds = {
  ...wheelInspectorComputeds,
  ...wheelGeneralComputeds,
  ...wheelFairnessComputeds,
  ...wheelSessionComputeds
};
