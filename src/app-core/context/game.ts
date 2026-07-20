import type { Sale } from "../../types/app.ts";

export interface GameMethodState {
  addWheelSaleToLot(lotId: number, sale: Sale): void;
  loadWheelFromStorage(): void;
  saveWheelConfigsToStorage(): void;
  saveWheelSessionToStorage(): void;
}
