import { wheelConfigComputeds } from "../inspector/wheelConfigComputeds.ts";
import { gameStageComputeds } from "../stage/gameStageComputeds.ts";

export const gameGeneralComputeds = {
  ...gameStageComputeds,
  ...wheelConfigComputeds
};

