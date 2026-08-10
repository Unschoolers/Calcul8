# Mobile Context Action Dock Design

Date: 2026-08-10

## Problem

The first mobile-shell refinement made persistent actions quieter, but it also hid two frequent seller tasks. Game `Session` became reachable only when the Controls FAB happened to open the Session inspector, and Live `Save prices` moved into a low-visibility toolbar overflow. On compact Game layouts, the inspector tab switcher is hidden, so Session cannot be reached from Builder after opening the sheet.

## Decision

Use one reusable two-control action dock for mobile Game and Live screens:

- one direct primary action for the screen's most frequent task;
- one secondary `More actions` control that opens the remaining labeled actions;
- a horizontal dock above the bottom navigation, never a vertical FAB stack;
- existing methods, entitlement checks, confirmation flows, and inspector state remain authoritative.

The dock is a shared presentation component. It receives typed action descriptors and emits an action id; it does not own business state or call storage/network methods.

## Game Behavior

- `Session` is the direct primary action in both config/preview and live modes.
- Selecting Session calls the existing `openWheelInspector("session")` path.
- `More actions` exposes Builder when config editing is available, History in every mode, and End Game in live mode.
- End Game continues through the existing confirmation/review flow.
- The dock is hidden during presentation mode and while the mobile inspector is open, matching the current compact-action visibility rules.

## Live Behavior

- Bulk lots use `Save prices` as the direct primary action and call the existing `applyLivePricesToDefaults` method.
- Bulk `More actions` exposes Calculator and Reset.
- Singles lots keep Calculator as the direct primary action because there is no bulk-default save operation.
- Singles `More actions` exposes Reset and Clear selection.
- Clear selection retains the existing destructive confirmation and remains disabled when there are no selected items.
- The low-visibility top `...` toolbar is removed after its actions move into the dock.

## Interaction And Accessibility

- Both persistent controls are at least 44 by 44 pixels.
- Direct and secondary controls have localized accessible labels.
- Secondary actions are labeled menu rows rather than unexplained floating icons.
- The dock uses the existing safe-area and bottom-navigation offsets and is theme-aware.
- Only the dock is persistent; expanded menu items are transient and do not count as additional persistent FABs.

## Component Boundary

Add a focused shell component for the reusable dock. The component accepts a primary action and secondary action list, renders the controls consistently, and emits `activate`. App shell code maps those ids to the existing Live and Game capability methods. No sales, lot, sync, or persistence logic moves into the component.

## Regression Coverage

- Game Session is rendered as the direct compact action in both config and live modes.
- Game secondary actions preserve Builder, History, and live End Game routing.
- Bulk Live renders direct Save and retains Calculator and Reset in secondary actions.
- Singles Live renders direct Calculator and retains Reset plus confirmed Clear.
- The former Live toolbar overflow is absent.
- The shared dock never renders more than two persistent controls and clears the bottom navigation.

