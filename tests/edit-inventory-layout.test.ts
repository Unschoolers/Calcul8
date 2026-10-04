import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "@vue/compiler-dom";

test("edit inventory uses the dialog footer and compact stacked fields", () => {
  const source = readFileSync("src/App.html", "utf8");
  const edit = source.slice(source.indexOf('<app-dialog-shell :model-value="showRenameLotModal'), source.indexOf('<!-- Verify Play Purchase Modal -->'));
  const root = parse(edit).children[0] as any;
  const actions = root.children.find((child: any) => child.tag === "template" && child.props.some((prop: any) => prop.name === "slot" && prop.arg?.content === "actions"));
  expect(actions).toBeTruthy();
  expect(edit).toContain('<app-form-layout compact :responsive="false">');
  expect(edit).toContain("configInventoryReferenceHint");
  expect(edit).toContain("currentLotType === 'singles' || (!shopifyEditListing && shopifyEditListingStatus !== 'loading')");
});

test("dialog surfaces have an opaque theme background beneath their contents", () => {
  const tokens = readFileSync("src/styles/design-tokens.css", "utf8");
  expect(tokens).toMatch(/--app-dialog-card-bg:\s*rgb\(var\(--v-theme-surface\)\)/);
});
