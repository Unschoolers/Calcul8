<script lang="ts">
import { WheelStageTopbar } from "./WheelStageTopbar.ts";

export default WheelStageTopbar;
</script>

<template src="./WheelStageTopbar.html"></template>

<style>
.wheel-presentation-toggle {
  align-self: center;
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
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.wheel-stage-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.wheel-stage-commandbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(310px, 0.72fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.wheel-stage-actions {
  display: grid;
  grid-template-columns: minmax(148px, 1fr) minmax(138px, 0.82fr);
  align-items: center;
  justify-content: stretch;
  gap: 8px;
  min-width: 0;
}

.wheel-stage-utility-controls {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: max-content;
}

.wheel-effects-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 36px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.wheel-effects-controls .v-btn,
.wheel-presentation-toggle {
  width: 32px !important;
  height: 32px !important;
}

.wheel-effects-toggle {
  opacity: 0.76;
}

.wheel-effects-toggle:hover {
  opacity: 1;
}

.wheel-spectator-btn {
  min-width: 0;
  min-height: 38px;
  border-radius: 999px !important;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.wheel-spectator-btn__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
  min-width: 0;
  width: 100%;
  max-width: none;
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

.wheel-mode-toggle__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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

.wheel-stage-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@container (max-width: 520px) {
  .wheel-stage-commandbar {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 10px;
  }

  .wheel-stage-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(88px, 0.54fr);
    grid-template-areas:
      "mode spectator";
    gap: 8px;
  }

  .wheel-mode-toggle {
    grid-area: mode;
    width: 100%;
  }

  .wheel-spectator-btn {
    grid-area: spectator;
    width: 100%;
    min-width: 0;
    padding-inline: 10px !important;
    justify-self: stretch;
  }

  .wheel-spectator-btn .v-icon {
    margin-inline-end: 6px !important;
  }

  .wheel-spectator-btn__label {
    display: inline-block;
  }

  .wheel-mode-toggle .v-btn {
    min-width: 0;
  }
}

@container (max-width: 340px) {
  .wheel-mode-toggle .v-icon {
    margin-inline-end: 0 !important;
  }

  .wheel-mode-toggle__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .wheel-spectator-btn {
    padding-inline: 0 !important;
  }

  .wheel-spectator-btn .v-icon {
    margin-inline-end: 0 !important;
  }

  .wheel-spectator-btn__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
