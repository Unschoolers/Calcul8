# Mobile Shell Refinement Design

Date: 2026-08-10

## Purpose

Calcul8's mobile shell currently gives permanent space to the brand and active scope, then renders the current-lot selector as a second card below it. Fixed navigation and multiple floating actions compete with the content at the bottom of the screen. The result is functional, but the seller's active lot and current task do not dominate the interface.

This slice refines the shared mobile shell across Config, Live, Sales, Game, and Portfolio. It combines the first five agreed improvements:

1. make the active lot the center of the mobile shell;
2. replace the narrow lot dropdown with a mobile lot-switcher sheet;
3. show only one floating primary action per screen;
4. establish one safe-area and content-clearance contract;
5. refine the bottom navigation.

It also adds a restrained mobile typography pass. Dense supporting text becomes slightly smaller, while primary values, body copy, form inputs, and touch targets remain comfortably readable.

## Goals

- Put the current lot above brand and personal-scope information in the mobile hierarchy.
- Recover meaningful vertical space without hiding important data-scope context.
- Make lot switching, creation, and editing comfortable with one hand.
- Ensure persistent navigation and actions never cover the last meaningful content.
- Present one obvious primary action per top-level screen.
- Make the bottom navigation quieter, shorter, and easier to understand.
- Improve information density without creating tiny body text or browser zoom problems.
- Preserve the existing desktop behavior unless a shared extraction is needed for maintainability.

## Non-goals

- Redesigning the content inside every Config, Live, Sales, Game, or Portfolio card.
- Changing lot persistence, workspace scoping, sync behavior, or route semantics.
- Replacing the five existing top-level destinations.
- Introducing a separate mobile application or divergent mobile state model.
- Globally shrinking all application typography.
- Hiding shared-workspace context where that could cause a seller to edit the wrong data.

## Chosen Direction

Use a unified mobile app bar with three regions:

```text
+------------------------------------------------+
| [logo]  My Hero Academia                  [user] |
|         Grouped - Jun 3                         |
+------------------------------------------------+
```

- The logo is a compact brand anchor, not the dominant element.
- The center is a button representing the active lot. It receives all remaining width.
- The lot name is the primary line, truncated to one line.
- The secondary line contains lot type and date. In shared-workspace mode, the truncated workspace name precedes that metadata.
- The account avatar remains the account, sync, Pro, language, and workspace-menu entry point.
- Personal mode does not render a permanent `Personal` or `Personnel` label in the app bar.
- A shared workspace remains identifiable in the lot subtitle and inside the switcher sheet/account menu.

The app bar uses 64px of content height plus the platform safe-area inset. It must not become a second stacked toolbar.

The unified header applies at widths up to and including 600px. Wider layouts retain the current brand/scope app bar and separate lot card.

## Mobile Lot Switcher

Tapping the center lot control opens a bottom sheet instead of the standard select menu. The sheet owns presentation and selection only; existing lot selection methods remain authoritative.

### Sheet content

- A drag handle and localized title.
- A compact active-scope line. Personal mode is shown here rather than in the permanent app bar.
- A search field when six or more lots exist. With fewer lots, all rows remain directly visible.
- Existing lot groups and ordering, with type, date, and completion metadata preserved.
- A clear selected state using iconography and text in addition to color.
- A primary `Create lot` action.
- A secondary `Edit current lot` action when a lot is selected.
- An empty state that points directly to lot creation.

### Behavior

- Selecting a lot calls the existing selection path and closes the sheet after selection succeeds.
- Opening, searching, and dismissing the sheet never mutates data.
- Create and edit continue to use the existing lot dialogs and methods.
- Long English and French names truncate predictably without moving the account button.
- All sheet rows and actions have touch targets of at least 44px.
- Focus returns to the lot control after the sheet closes.

The reusable lot display and selection logic should be extracted from `LotSelectorOnboardingBlock` rather than duplicated in the app bar. The onboarding and no-lot states remain separate responsibilities.

## Contextual Actions

Each top-level screen may expose no more than one persistent floating primary action. Secondary, destructive, reset, history, statistics, and configuration actions move to the section that owns them or to a labeled overflow/control sheet.

### Action mapping

- Config, singles: keep `Add purchase` as the one primary action.
- Config, bulk: no floating action.
- Live: keep the price calculator as the primary action. Move reset, clear, and apply-default actions into a labeled overflow menu in the Live surface header. Destructive clear requires confirmation.
- Sales: keep one `Add sale` action. When multiple sale types are available, tapping it opens the existing choices in a sheet/menu; multiple choices must not remain simultaneously floating.
- Game: use one `Controls` action to open the existing mobile inspector and expose configuration, live controls, history, statistics, and spectator controls. Game-specific actions remain inside the game surface when they directly manipulate the game.
- Portfolio: keep the report/table action as the one primary action when portfolio data exists.

The visible action must use a localized accessible name. Secondary actions must remain discoverable and must not be moved into the account menu.

## Safe Areas And Scroll Clearance

One shared token contract must account for:

- platform safe-area bottom inset;
- bottom-navigation height;
- the single floating-action footprint when present;
- spacing between content, the action, and navigation;
- snackbar and sticky-footer placement.

The content bottom clearance should allow the final meaningful element to scroll completely above both the bottom navigation and the floating action. Screens without a floating action may use the smaller navigation-only clearance.

The contract applies to Config, Live, Sales, Game, Portfolio, dialogs that coexist with the shell, and shared snackbar placement. Screen-specific compensating margins should be removed where the shared contract supersedes them.

Verification must cover 360x740, 390x844, and 412x915 with safe-area insets. The last card, row, chart, field, and primary action must remain readable and tappable.

## Bottom Navigation

Keep all five destinations, but reduce visual weight:

- Use 64px plus the bottom safe-area inset rather than the current 72px base height.
- Keep every navigation target at least 44px high.
- Replace the full-width active block with a compact theme-aware active indicator around the icon/label group.
- Keep inactive destinations transparent with readable theme-aware contrast.
- Use the concise mobile label `Lot` for the Config destination in both languages; the screen itself can retain its fuller title.
- Keep `Live`, `Sales`/`Ventes`, `Game`/`Jeu`, and `Portfolio`/`Portefeuille` localized.
- Avoid label wrapping at 360px. Truncate only as a last resort.
- When a destination requires a selected lot, keep it focusable/tappable and explain the missing requirement instead of silently disabling it. The attempted navigation must not change the current tab.

The current tab model and five values remain unchanged.

## Mobile Typography

The typography change is targeted rather than global.

### May become slightly smaller

- bottom-navigation labels;
- lot metadata and scope metadata;
- compact card captions;
- secondary KPI labels;
- helper text where it remains readable.

### Must not shrink

- form input text, which remains at least 16px to avoid mobile browser zoom;
- primary currency and profit values;
- standard body copy below 14px;
- buttons below a legible accessible size;
- error, offline, sync, or destructive guidance that users must understand before acting.

Add semantic mobile typography tokens for these roles rather than scattering new pixel values through screen CSS. French text must be checked independently because it is commonly longer than English.

The initial token targets are 11px for bottom-navigation labels, 12px for metadata/captions, 13px for secondary helper copy, and at least 14px for standard body copy. Existing larger primary values remain unchanged.

## Component Boundaries

The implementation should preserve thin responsibilities:

- `AppShellTopBar` coordinates the responsive app-bar composition and account menu.
- A reusable lot-control component renders the selected-lot summary and emits open/select intent.
- A mobile lot-switcher component owns sheet state, filtering, grouped rendering, and accessible focus behavior.
- `LotSelectorOnboardingBlock` retains onboarding, no-lot recovery, and the non-mobile selector composition.
- A small shell helper/composable maps the active tab to its single primary action and disabled-navigation explanation.
- Shared design tokens own safe-area, navigation, floating-action, and typography measurements.

No component should duplicate lot normalization, scope switching, persistence, or sync behavior. Existing `src/app-core` methods remain the behavior boundary.

## Data And Event Flow

1. The root state supplies the current lot, lot items, active scope, language, and current tab.
2. The app bar derives a presentation-only lot summary.
3. Tapping the summary opens local sheet state.
4. Selecting a row emits the lot id to the existing `selectLot` method.
5. Existing state and sync paths update the current lot.
6. The sheet closes and the app bar rerenders from authoritative state.
7. Tab presses use the existing tab values. If a tab requires a lot and none exists, the shell emits a localized explanation and leaves the tab unchanged.

## Failure And Recovery Behavior

- A stale lot that disappears during selection falls back to the existing lot-selection recovery behavior and shows the existing notification path.
- Empty lot collections show a creation action instead of an unusable selector.
- Offline mode does not prevent switching among locally available lots.
- Workspace access-loss handling remains session-first and uses the existing fallback to personal mode.
- No new network call is required merely to open the lot switcher.
- Moving actions must not weaken existing confirmation dialogs, Pro entitlement checks, or disabled-state rules.

## Accessibility

- All interactive targets are at least 44x44px.
- The lot control exposes its current value, purpose, and expanded state.
- The sheet uses dialog semantics, has a useful title, traps focus while open, and restores focus on close.
- Selected, unavailable, destructive, sync, and scope states are not communicated by color alone.
- Navigation remains usable with keyboard and screen-reader input.
- Reduced-motion behavior applies to the sheet, active indicator, and any header transition.

## Testing And Visual Verification

Focused automated coverage should include:

- personal mode hides the permanent personal label on mobile;
- shared-workspace mode includes workspace context in the mobile lot summary;
- opening, filtering, selecting, and dismissing the lot sheet;
- create/edit action routing through existing methods;
- long English and French lot/workspace labels;
- no-lot navigation attempts produce an explanation without changing tabs;
- exactly zero or one persistent contextual action for each tab/type combination;
- destructive and Pro-gated actions retain their existing guards;
- desktop continues to render its established shell composition;
- light/dark theme classes and localized labels remain correct.

Responsive visual verification should capture the top and bottom of all five tabs at 360x740, 390x844, and 412x915 in mobile dark/French and mobile light/English. The implementation should run the smallest relevant Vue tests while iterating, then the web verification gate and the existing visual smoke command before completion.

## Acceptance Criteria

- The current lot, not `Personal`/`Personnel`, is the dominant mobile header information.
- The permanent mobile header contains a compact logo, lot control, and account control without overflow at 360px.
- Lot selection, creation, and editing are available from the mobile switcher with 44px targets.
- Personal mode is discoverable in the sheet/account menu; shared-workspace context remains visible enough to prevent scope mistakes.
- No top-level screen renders more than one persistent floating primary action.
- The last meaningful content on every tab can scroll completely clear of fixed chrome.
- The bottom navigation uses a compact active state, does not wrap labels, and explains lot-required destinations.
- Mobile supporting typography is slightly denser without shrinking body copy below 14px or inputs below 16px.
- English and French copy, including diacritics, fit in light and dark themes at the required mobile widths.
- Existing lot, scope, sync, entitlement, confirmation, and tab-state behavior remains intact.
