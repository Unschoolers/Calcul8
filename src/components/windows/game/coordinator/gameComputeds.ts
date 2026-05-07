import { wheelFairnessComputeds } from "../inspector/wheelFairnessComputeds.ts";
import { gameGeneralComputeds } from "./gameGeneralComputeds.ts";
import { wheelInspectorComputeds } from "../inspector/wheelInspectorComputeds.ts";
import { wheelSessionComputeds } from "../inspector/wheelSessionComputeds.ts";

export const gameComputeds = {
  ...wheelInspectorComputeds,
  ...gameGeneralComputeds,
  ...wheelFairnessComputeds,
  ...wheelSessionComputeds
};

