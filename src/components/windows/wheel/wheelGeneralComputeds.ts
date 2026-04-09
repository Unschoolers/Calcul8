import { wheelConfigComputeds } from "./wheelConfigComputeds.ts";
import { wheelStageComputeds } from "./wheelStageComputeds.ts";

export const wheelGeneralComputeds = {
  ...wheelStageComputeds,
  ...wheelConfigComputeds
};
