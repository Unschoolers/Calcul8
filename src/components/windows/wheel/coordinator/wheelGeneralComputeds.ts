import { wheelConfigComputeds } from "../inspector/wheelConfigComputeds.ts";
import { wheelStageComputeds } from "../stage/wheelStageComputeds.ts";

export const wheelGeneralComputeds = {
  ...wheelStageComputeds,
  ...wheelConfigComputeds
};
