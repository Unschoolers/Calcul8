import { inject, type InjectionKey } from "vue";
import type {
  BuyerMethodState,
  BuyerProfileCacheContext
} from "../../app-core/context/buyers.ts";
import { createCapabilityPorts } from "../../app-core/context/capabilityPorts.ts";

/** Capabilities the buyer quick-view UI needs from the composition root. */
export type BuyerProfilePorts = Pick<
  BuyerProfileCacheContext,
  "buyerProfilesByKey" | "buyerProfileSaveStates"
> & Pick<
  BuyerMethodState,
  "getBuyerProfile" | "saveBuyerProfile" | "resolveBuyerProfileConflict"
>;

export const buyerProfilePortsKey: InjectionKey<BuyerProfilePorts> = Symbol("buyerProfilePorts");

const buyerProfilePortKeys = [
  "buyerProfilesByKey",
  "buyerProfileSaveStates",
  "getBuyerProfile",
  "saveBuyerProfile",
  "resolveBuyerProfileConflict"
] as const satisfies readonly (keyof BuyerProfilePorts)[];

export function createBuyerProfilePorts(source: BuyerProfilePorts): BuyerProfilePorts {
  return createCapabilityPorts(source, buyerProfilePortKeys);
}

export function useBuyerProfilePorts(): BuyerProfilePorts {
  const ports = inject(buyerProfilePortsKey, null);
  if (!ports) {
    throw new Error("Buyer profile capabilities were not provided.");
  }
  return ports;
}
