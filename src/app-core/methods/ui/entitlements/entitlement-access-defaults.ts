import type { TargetProfitAccessContext } from "../../../context/entitlements.ts";

export function applyTargetProfitAccessDefaults(app: TargetProfitAccessContext): void {
  if (!app.hasLotSelected) return;

  if (!app.hasProAccess) {
    if (Number(app.targetProfitPercent) !== 0) {
      app.targetProfitPercent = 0;
      app.autoSaveSetup();
    }
    return;
  }

  const currentTarget = Number(app.targetProfitPercent);
  if (!Number.isFinite(currentTarget) || currentTarget <= 0) {
    app.targetProfitPercent = 15;
    app.autoSaveSetup();
  }
}
