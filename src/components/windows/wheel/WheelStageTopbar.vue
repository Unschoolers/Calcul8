<script lang="ts">
import { WheelStageTopbar } from "./WheelStageTopbar.ts";

export default WheelStageTopbar;
</script>

<template src="./WheelStageTopbar.html"></template>

<style>
.wheel-presentation-toggle {
  align-self: flex-end;
  opacity: 0.72;
}

.wheel-presentation-toggle:hover {
  opacity: 1;
}

.wheel-layout.wheel-presentation .wheel-stage-topbar {
  width: min(100%, 980px);
  align-items: center;
  margin-bottom: 4px;
}

.wheel-layout.wheel-presentation .wheel-stage-title {
  font-size: 0.84rem;
  opacity: 0.9;
}

.wheel-layout.wheel-presentation .wheel-stage-pills {
  margin-top: 6px;
  gap: 6px;
}

.wheel-layout.wheel-presentation .wheel-stage-pill {
  padding: 4px 9px;
  font-size: 0.62rem;
}

.wheel-layout.wheel-presentation .wheel-mode-toggle .v-btn {
  min-width: 76px;
}

.wheel-stage-topbar {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.wheel-stage-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wheel-spectator-btn {
  min-width: 0;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.wheel-spectator-btn.v-btn--variant-tonal {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.wheel-spectator-btn--inactive.v-btn--variant-tonal {
  background: rgba(var(--v-theme-on-surface), 0.05) !important;
  color: rgba(var(--v-theme-on-surface), 0.84) !important;
}

.wheel-spectator-btn--live.v-btn--variant-tonal {
  background: rgba(var(--v-theme-success), 0.14) !important;
  color: rgb(var(--v-theme-success)) !important;
  border-color: rgba(var(--v-theme-success), 0.22) !important;
}

.wheel-spectator-btn--ended.v-btn--variant-elevated {
  background:
    linear-gradient(135deg, rgba(var(--v-theme-warning), 0.28), rgba(var(--v-theme-warning), 0.18)),
    rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-warning)) !important;
  border: 1px solid rgba(var(--v-theme-warning), 0.3) !important;
  box-shadow: 0 0 0 1px rgba(var(--v-theme-warning), 0.08) inset !important;
}

.wheel-spectator-btn--ended .v-icon {
  color: rgb(var(--v-theme-warning)) !important;
}

.wheel-mode-toggle {
  display: flex;
  width: min(100%, 248px);
  border-radius: 999px !important;
  overflow: hidden;
  background: var(--wheel-chip-bg);
  border: 1px solid var(--wheel-chip-border);
}

.wheel-mode-toggle .v-btn {
  flex: 1 1 50%;
  min-width: 0;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: none;
}

.wheel-mode-toggle .wheel-mode-toggle__btn--active-config.v-btn--active {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.wheel-mode-toggle .wheel-mode-toggle__btn--active-live.v-btn--active {
  background: rgba(var(--v-theme-success), 0.2);
  color: rgb(var(--v-theme-success));
}

.wheel-mode-toggle .wheel-mode-toggle__btn--active-live.v-btn--active .v-icon {
  color: rgb(var(--v-theme-success));
}

.wheel-stage-meta {
  min-width: 0;
}

.wheel-stage-title {
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: rgba(var(--v-theme-on-surface), 0.96);
}

.wheel-stage-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.wheel-stage-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--wheel-chip-bg);
  border: 1px solid var(--wheel-chip-border);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.wheel-stage-pill--kpi {
  gap: 6px;
}

.wheel-stage-pill__label {
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.wheel-stage-pill__value {
  font-size: 0.76rem;
  letter-spacing: 0.01em;
}

@media (max-width: 1100px) {
  .wheel-stage-topbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .wheel-stage-meta {
    width: 100%;
  }

  .wheel-stage-pills {
    margin-top: 6px;
    gap: 6px;
  }

  .wheel-stage-actions {
    width: 100%;
    justify-content: space-between;
    align-items: center;
  }

  .wheel-mode-toggle {
    flex: 1 1 auto;
  }

  .wheel-mode-toggle .v-btn {
    min-width: 0;
  }

  .wheel-stage-title {
    font-size: 0.86rem;
  }
}
</style>
