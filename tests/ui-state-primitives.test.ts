import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { AppEmptyState } from "../src/components/ui/AppEmptyState.ts";
import { AppErrorState } from "../src/components/ui/AppErrorState.ts";
import { AppLoadingState } from "../src/components/ui/AppLoadingState.ts";

test("shared state primitives expose consistent surface and compact contracts", () => {
  assert.equal(AppEmptyState.name, "AppEmptyState");
  assert.equal(AppLoadingState.name, "AppLoadingState");
  assert.equal(AppErrorState.name, "AppErrorState");

  assert.equal(AppLoadingState.props.title.default, "");
  assert.equal(AppLoadingState.props.body.default, "");
  assert.equal(AppLoadingState.props.compact.default, false);
  assert.equal(AppLoadingState.props.surface.default, false);

  assert.equal(AppErrorState.props.title.default, "");
  assert.equal(AppErrorState.props.body.default, "");
  assert.equal(AppErrorState.props.actionLabel.default, "");
  assert.equal(AppErrorState.props.compact.default, false);
  assert.equal(AppErrorState.props.surface.default, false);
});

test("Whatnot dialogs register and use shared state primitives", () => {
  const csvScript = readFileSync("src/components/windows/whatnot/WhatnotCsvImportDialog.ts", "utf8");
  const csvTemplate = readFileSync("src/components/windows/whatnot/WhatnotCsvImportDialog.html", "utf8");
  const reviewScript = readFileSync("src/components/windows/whatnot/WhatnotReviewDialog.ts", "utf8");
  const reviewTemplate = readFileSync("src/components/windows/whatnot/WhatnotReviewDialog.html", "utf8");

  assert.match(csvScript, /AppErrorState/);
  assert.match(csvTemplate, /<app-error-state/);
  assert.match(reviewScript, /AppEmptyState/);
  assert.match(reviewTemplate, /<app-empty-state/);
});

test("Workspace members modal uses the shared empty state primitive", () => {
  const script = readFileSync("src/components/shell/WorkspaceModals.ts", "utf8");
  const template = readFileSync("src/components/shell/WorkspaceModals.html", "utf8");

  assert.match(script, /AppEmptyState/);
  assert.match(template, /<app-empty-state/);
  assert.doesNotMatch(template, /workspace-members-empty/);
});
