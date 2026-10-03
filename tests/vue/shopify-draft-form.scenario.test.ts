import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import { defineComponent, ref } from "vue";
import ShopifyDraftForm from "../../src/components/windows/shopify/ShopifyDraftForm.vue";
import { renderWithApp } from "./render.ts";
const preview = { title: "Set — Booster box", variantTitle: "Booster box", sku: "SKU", price: "20.00", currency: "CAD", quantity: 3, locations: [{ id: "gid://shopify/Location/4", name: "Main" }], previewToken: "a".repeat(64) };
function scenario() {
  const load = vi.fn(async (overrides?: { title: string; price: string }) => ({ ...preview, ...(overrides ? { title: overrides.title, price: overrides.price, previewToken: "b".repeat(64) } : {}) }));
  const create = vi.fn(async () => {});
  const Harness = defineComponent({ components: { ShopifyDraftForm }, setup: () => ({ form: ref(), load, create, t: (key: string) => key }), template: '<ShopifyDraftForm ref="form" :load-preview="load" :create-draft="create" :t="t" /><button @click="form.submit()">Submit</button>' });
  renderWithApp(Harness); return { load, create };
}
test("edited title and independent price request a final validated preview before creation", async () => {
  const h = scenario();
  const title = await screen.findByRole("textbox", { name: "shopifyDraftTitleLabel" });
  await fireEvent.update(title, "Custom product"); await fireEvent.update(screen.getByRole("textbox", { name: "shopifyDraftPriceLabel" }), "27.50");
  await fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(h.create).toHaveBeenCalledWith({ title: "Custom product", price: "27.50", locationId: preview.locations[0]!.id }, "b".repeat(64)));
  expect(h.load).toHaveBeenLastCalledWith({ title: "Custom product", price: "27.50", locationId: preview.locations[0]!.id });
  expect(screen.queryByRole("dialog")).toBeNull();
});
test("a failed creation locks its exact input and retries its recorded preview without refreshing", async () => {
  const h = scenario(); h.create.mockRejectedValueOnce(new TypeError("lost response"));
  await screen.findByRole("textbox", { name: "shopifyDraftTitleLabel" }); await fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox", { name: "shopifyDraftTitleLabel" })).toBeDisabled();
  const reads = h.load.mock.calls.length;
  await fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));
  expect(h.load).toHaveBeenCalledTimes(reads);
  expect(h.create.mock.calls[1]).toEqual(h.create.mock.calls[0]);
});
test("invalid price never previews or creates a new payload", async () => {
  const h = scenario(); await screen.findByRole("textbox", { name: "shopifyDraftTitleLabel" });
  await fireEvent.update(screen.getByRole("textbox", { name: "shopifyDraftPriceLabel" }), "0");
  await fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(h.load).toHaveBeenCalledTimes(1); expect(h.create).not.toHaveBeenCalled();
});
