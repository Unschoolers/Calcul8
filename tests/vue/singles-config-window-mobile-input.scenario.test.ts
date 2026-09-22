import { fireEvent } from "@testing-library/vue";
import { afterEach, expect, test, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { createInitialState } from "../../src/app-core/state.ts";
import {
  createSinglesConfigPorts,
  singlesConfigPortsKey
} from "../../src/components/windows/singles/singlesConfigPorts.ts";
import SinglesConfigWindow from "../../src/components/windows/singles/SinglesConfigWindow.vue";
import { renderWithApp } from "./render.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function cardSearchResponse(name: string): Response {
  return new Response(JSON.stringify({
    items: [{
      name,
      cardNo: "UE01BT/BLC-1-025",
      rarity: "C",
      marketPrice: 0.03
    }]
  }), { status: 200 });
}

async function mountSinglesEditor(searchResponse: ReturnType<typeof vi.fn>) {
  const storage = new Map<string, string>([["whatfees_api_base_url", "https://api.example.test"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  vi.stubGlobal("fetch", searchResponse);

  const source = {
    ...createInitialState(),
    currentLotId: 1,
    lots: [{ id: 1, name: "Singles", lotType: "singles", singlesCatalogSource: "ua" }],
    currentLotCatalogSource: "ua",
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    sellingCurrency: "CAD",
    exchangeRate: 1,
    preferredLanguage: "en",
    currency: "CAD",
    conversionInfo: "",
    singlesPurchaseTotalCost: 0,
    singlesPurchaseTotalMarketValue: 0,
    saveLotsToStorage: vi.fn(),
    removeSinglesPurchaseRow: vi.fn(),
    onSinglesPurchaseRowsChange: vi.fn(),
    importSinglesPurchasesCsv: vi.fn(),
    confirmSinglesPurchasesCsvImport: vi.fn(),
    cancelSinglesPurchasesCsvImport: vi.fn(),
    formatCurrency: (value: number | null | undefined) => String(value ?? 0),
    t: (key: string) => key,
    onPurchaseConfigChange: vi.fn(),
    notify: vi.fn(),
    askConfirmation: vi.fn()
  };
  const editor = ref<Record<string, any>>();
  const Host = defineComponent({
    components: { SinglesConfigWindow },
    setup: () => ({ editor }),
    template: "<singles-config-window ref=\"editor\" />"
  });

  renderWithApp(Host, {
    global: {
      provide: { [singlesConfigPortsKey as symbol]: createSinglesConfigPorts(source as never) },
      stubs: { AdminSyncImportCard: true, SinglesCsvImportDialog: true }
    }
  });
  await nextTick();
  editor.value?.openSinglesRowEditor();
  await nextTick();

  const input = document.querySelector<HTMLInputElement>(".v-autocomplete input");
  expect(input).not.toBeNull();
  return { editor, input: input!, searchResponse };
}

async function typeNativeValue(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  await fireEvent(input, new InputEvent("input", {
    bubbles: true,
    data: value.at(-1) ?? "",
    inputType: "insertText"
  }));
  await nextTick();
}

function requestedQuery(searchResponse: ReturnType<typeof vi.fn>, callIndex: number): string | null {
  return new URL(String(searchResponse.mock.calls[callIndex]?.[0] || "")).searchParams.get("q");
}

test("sends each later two-character-plus native input value to card search", async () => {
  const searchResponse = vi.fn((url: string) => cardSearchResponse(
    `Match for ${new URL(url).searchParams.get("q")}`
  ));
  const { input } = await mountSinglesEditor(searchResponse);

  await fireEvent.focus(input);
  await typeNativeValue(input, "L");
  await typeNativeValue(input, "Lo");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledTimes(1), { timeout: 1_500 });

  await typeNativeValue(input, "Loy");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledTimes(2), { timeout: 1_500 });

  await typeNativeValue(input, "Loyd");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledTimes(3), { timeout: 1_500 });

  expect([0, 1, 2].map((index) => requestedQuery(searchResponse, index))).toEqual(["Lo", "Loy", "Loyd"]);
}, 10_000);

test("waits for slower mobile typing to settle before searching the final query", async () => {
  const searchResponse = vi.fn((url: string) => cardSearchResponse(
    `Match for ${new URL(url).searchParams.get("q")}`
  ));
  const { input } = await mountSinglesEditor(searchResponse);
  vi.useFakeTimers();

  try {
    await fireEvent.focus(input);
    for (const value of ["G", "Go", "Gon", "Gon ", "Gon s", "Gon sr", "Gon sr*", "Gon sr**"]) {
      await typeNativeValue(input, value);
      await vi.advanceTimersByTimeAsync(600);
    }

    expect(searchResponse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(900);
    expect(searchResponse).toHaveBeenCalledOnce();
    expect(requestedQuery(searchResponse, 0)).toBe("Gon sr**");
  } finally {
    vi.useRealTimers();
  }
}, 10_000);

test("ignores an older mobile search response after later characters are typed", async () => {
  let resolveLo: ((response: Response) => void) | undefined;
  let resolveLoyd: ((response: Response) => void) | undefined;
  const searchResponse = vi.fn((url: string) => {
    const query = new URL(url).searchParams.get("q");
    if (query === "Lo") {
      return new Promise<Response>((resolve) => {
        resolveLo = resolve;
      });
    }
    return new Promise<Response>((resolve) => {
      resolveLoyd = resolve;
    });
  });
  const { editor, input } = await mountSinglesEditor(searchResponse);

  await fireEvent.focus(input);
  await typeNativeValue(input, "Lo");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledTimes(1), { timeout: 1_500 });
  await typeNativeValue(input, "Loyd");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledTimes(2), { timeout: 1_500 });

  resolveLo?.(cardSearchResponse("Lo predecessor"));
  await nextTick();
  expect(editor.value?.singlesItemSearchText).toBe("Loyd");
  expect(document.body).not.toHaveTextContent("Lo predecessor");

  resolveLoyd?.(cardSearchResponse("Loyd final"));
  await vi.waitFor(() => expect(document.body).toHaveTextContent("Loyd final"));
}, 10_000);

test("shows a delayed result while the autocomplete input remains focused", async () => {
  let resolveSearch: ((response: Response) => void) | undefined;
  const searchResponse = vi.fn(() => new Promise<Response>((resolve) => {
    resolveSearch = resolve;
  }));
  const { editor, input } = await mountSinglesEditor(searchResponse);

  await fireEvent.focus(input);
  await typeNativeValue(input, "Lo");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledOnce(), { timeout: 1_500 });

  resolveSearch?.(cardSearchResponse("Loyd Lloyd"));
  await vi.waitFor(() => expect(editor.value?.singlesItemSuggestions).toHaveLength(1));
  expect(editor.value?.singlesItemMenuOpen).toBe(true);
  await vi.waitFor(() => expect(document.body).toHaveTextContent("Loyd Lloyd"));
}, 10_000);

test("leaves the query visible but closes the menu when card search is rate limited", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const searchResponse = vi.fn(() => new Response(JSON.stringify({
    error: "Too many card search requests. Please retry shortly."
  }), { status: 429 }));
  const { editor, input } = await mountSinglesEditor(searchResponse);

  await fireEvent.focus(input);
  await typeNativeValue(input, "Lo");
  await vi.waitFor(() => expect(searchResponse).toHaveBeenCalledOnce(), { timeout: 1_500 });
  await vi.waitFor(() => expect(editor.value?.singlesItemSearchLoading).toBe(false));

  expect(editor.value?.singlesItemSearchText).toBe("Lo");
  expect(editor.value?.singlesItemSuggestions).toEqual([]);
  expect(editor.value?.singlesItemMenuOpen).toBe(false);
  expect(warn).toHaveBeenCalledWith("Failed to fetch card suggestions", expect.any(Error));
}, 10_000);
