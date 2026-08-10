import type { ShellNavigationMethodImplementation } from "../../../context/shell.ts";

export const uiShellNavigationMethods = {
  selectPrimaryTab(tab) {
    if (tab !== "config" && !this.hasLotSelected) {
      this.notify(this.t("shellSelectLotFirstNotice"), "warning");
      return;
    }

    this.currentTab = tab;
  }
} satisfies ShellNavigationMethodImplementation;

