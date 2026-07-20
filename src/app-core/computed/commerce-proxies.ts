import type { CommerceComputedObject } from "../context/commerce.ts";

export const commerceProxyComputed: Pick<CommerceComputedObject, "lotNameDraft"> = {
  lotNameDraft: {
    get() {
      return this.newLotName;
    },
    set(newValue) {
      this.newLotName = String(newValue ?? "");
    }
  }
};
