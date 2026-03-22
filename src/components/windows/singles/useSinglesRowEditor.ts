import type { SinglesPurchaseEntry } from "../../../types/app.ts";

type SinglesRowEditorContext = {
  currency: "CAD" | "USD";
  singlesPurchases: SinglesPurchaseEntry[];
  editingSinglesRowId: number | null;
  editingSinglesRow: {
    item: string;
    cardNumber: string;
    externalSku?: string;
    image?: string;
    condition: string;
    language: string;
    cost: number;
    currency: "CAD" | "USD";
    quantity: number;
    marketValue: number;
  };
  showSinglesRowEditor: boolean;
  singlesItemSearchText: string;
  singlesItemMenuOpen: boolean;
  singlesEditorPreviewLoading: boolean;
  singlesItemSuggestions: unknown[];
  singlesItemSearchLoading: boolean;
  suppressNextSinglesItemSearchUpdate: boolean;
  notify(message: string, color?: string): void;
  askConfirmation(
    payload: { title: string; text: string; color?: string },
    action: () => void
  ): void;
  onSinglesPurchaseRowsChange(): void;
  removeSinglesPurchaseRow(rowId: number): void;
  cancelSinglesItemSearch(): void;
  preloadSinglesEditorPreview(): Promise<void>;
  resetSinglesRowDraft(options?: {
    currency?: "CAD" | "USD";
    condition?: string;
    language?: string;
  }): void;
  closeSinglesRowEditor(): void;
  confirmRemoveSinglesPurchaseRow(rowId: number, closeEditor?: boolean): void;
  openSinglesRowEditor(entry?: SinglesPurchaseEntry): void;
  getEditingSinglesQuantity(): number;
  setEditingSinglesQuantity(nextQuantity: unknown): void;
};

function createNextSinglesEntryId(entries: SinglesPurchaseEntry[]): number {
  const highestId = entries.reduce((maxId, entry) => {
    const candidateId = Number(entry.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) return maxId;
    return Math.max(maxId, Math.floor(candidateId));
  }, 0);
  return Math.max(Date.now(), highestId + 1);
}

export const singlesRowEditorMethods = {
  getEditingSinglesQuantity(this: SinglesRowEditorContext): number {
    const quantity = Number(this.editingSinglesRow?.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) return 1;
    return Math.floor(quantity);
  },

  setEditingSinglesQuantity(this: SinglesRowEditorContext, nextQuantity: unknown): void {
    const parsedQuantity = Number(nextQuantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      this.editingSinglesRow.quantity = 1;
      return;
    }
    this.editingSinglesRow.quantity = Math.floor(parsedQuantity);
  },

  increaseEditingSinglesQuantity(this: SinglesRowEditorContext): void {
    this.setEditingSinglesQuantity(this.getEditingSinglesQuantity() + 1);
  },

  decreaseEditingSinglesQuantity(this: SinglesRowEditorContext): void {
    this.setEditingSinglesQuantity(this.getEditingSinglesQuantity() - 1);
  },

  resetSinglesRowDraft(
    this: SinglesRowEditorContext,
    options?: {
      currency?: "CAD" | "USD";
      condition?: string;
      language?: string;
    }
  ): void {
    const nextCurrency = options?.currency === "USD" || options?.currency === "CAD"
      ? options.currency
      : (this.currency === "USD" ? "USD" : "CAD");
      this.editingSinglesRow = {
        item: "",
        cardNumber: "",
        externalSku: "",
        image: "",
        condition: String(options?.condition || ""),
      language: String(options?.language || ""),
      cost: 0,
      currency: nextCurrency,
      quantity: 1,
      marketValue: 0
    };
    this.singlesItemSearchText = "";
    this.singlesItemMenuOpen = false;
    this.singlesEditorPreviewLoading = false;
    this.singlesItemSuggestions = [];
    this.singlesItemSearchLoading = false;
    this.cancelSinglesItemSearch();
  },

  handleAddSinglesPurchase(this: SinglesRowEditorContext): void {
    this.openSinglesRowEditor();
  },

  openSinglesRowEditor(this: SinglesRowEditorContext, entry?: SinglesPurchaseEntry): void {
    if (entry) {
      this.editingSinglesRowId = entry.id;
      this.editingSinglesRow = {
        item: String(entry.item || ""),
        cardNumber: String(entry.cardNumber || ""),
        externalSku: String(entry.externalSku || ""),
        image: String(entry.image || ""),
        condition: String(entry.condition || ""),
        language: String(entry.language || ""),
        cost: Number(entry.cost) || 0,
        currency: entry.currency === "USD" || entry.currency === "CAD"
          ? entry.currency
          : (this.currency === "USD" ? "USD" : "CAD"),
        quantity: Number(entry.quantity) || 1,
        marketValue: Number(entry.marketValue) || 0
      };
      this.suppressNextSinglesItemSearchUpdate = true;
      this.singlesItemSearchText = "";
    } else {
      this.editingSinglesRowId = null;
      this.resetSinglesRowDraft();
    }
    this.showSinglesRowEditor = true;
    this.singlesItemMenuOpen = false;
    void this.preloadSinglesEditorPreview();
  },

  closeSinglesRowEditor(this: SinglesRowEditorContext): void {
    this.showSinglesRowEditor = false;
    this.singlesEditorPreviewLoading = false;
    this.editingSinglesRowId = null;
    this.resetSinglesRowDraft();
  },

  saveSinglesRowEditor(this: SinglesRowEditorContext, mode: "close" | "new" = "close"): void {
    const nextItem = String(this.editingSinglesRow.item || "").trim();
    const nextCardNumber = String(this.editingSinglesRow.cardNumber || "").trim();
    const nextExternalSku = String(this.editingSinglesRow.externalSku || "").trim();
    const nextImage = String(this.editingSinglesRow.image || "").trim();
    const nextCondition = String(this.editingSinglesRow.condition || "").trim();
    const nextLanguage = String(this.editingSinglesRow.language || "").trim();
    const parsedCost = Number(this.editingSinglesRow.cost);
    const nextCurrency = this.editingSinglesRow.currency === "USD" ? "USD" : "CAD";
    const parsedQuantity = Number(this.editingSinglesRow.quantity);
    const parsedMarketValue = Number(this.editingSinglesRow.marketValue);

    if (!nextItem) {
      this.notify("Item is required.", "warning");
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      this.notify("Cost is required.", "warning");
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      this.notify("Quantity must be 0 or greater.", "warning");
      return;
    }

    const nextCost = parsedCost;
    const nextQuantity = Math.floor(parsedQuantity);
    const nextMarketValue = Number.isFinite(parsedMarketValue) && parsedMarketValue >= 0 ? parsedMarketValue : 0;
    const isAdding = this.editingSinglesRowId == null;

    if (isAdding) {
      const nextId = createNextSinglesEntryId(this.singlesPurchases);
      this.singlesPurchases = [
        ...this.singlesPurchases,
        {
          id: nextId,
          item: nextItem,
          cardNumber: nextCardNumber,
          externalSku: nextExternalSku,
          image: nextImage,
          condition: nextCondition,
          language: nextLanguage,
          cost: nextCost,
          currency: nextCurrency,
          quantity: nextQuantity,
          marketValue: nextMarketValue
        }
      ];
    } else {
      this.singlesPurchases = this.singlesPurchases.map((entry) => (
        entry.id === this.editingSinglesRowId
          ? {
            ...entry,
            item: nextItem,
            cardNumber: nextCardNumber,
            externalSku: nextExternalSku,
            image: nextImage,
            condition: nextCondition,
            language: nextLanguage,
            cost: nextCost,
            currency: nextCurrency,
            quantity: nextQuantity,
            marketValue: nextMarketValue
          }
          : entry
      ));
    }

    this.onSinglesPurchaseRowsChange();
    if (isAdding && mode === "new") {
      this.editingSinglesRowId = null;
      this.resetSinglesRowDraft({
        currency: nextCurrency,
        condition: nextCondition,
        language: nextLanguage
      });
      this.showSinglesRowEditor = true;
      return;
    }
    this.closeSinglesRowEditor();
  },

  removeSinglesRowFromEditor(this: SinglesRowEditorContext): void {
    if (this.editingSinglesRowId == null) {
      this.closeSinglesRowEditor();
      return;
    }
    this.confirmRemoveSinglesPurchaseRow(this.editingSinglesRowId, true);
  },

  confirmRemoveSinglesPurchaseRow(this: SinglesRowEditorContext, rowId: number, closeEditor = false): void {
    this.askConfirmation(
      {
        title: "Delete Row?",
        text: "Remove this singles purchase row?",
        color: "error"
      },
      () => {
        this.removeSinglesPurchaseRow(rowId);
        if (closeEditor) {
          this.closeSinglesRowEditor();
        }
      }
    );
  }
};
