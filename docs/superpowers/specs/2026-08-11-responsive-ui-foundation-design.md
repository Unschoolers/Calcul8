# Responsive UI Foundation Design

Date: 2026-08-11

## Purpose

Calcul8's responsive UI has accumulated local dialog markup, fixed and sticky offsets, undersized controls, and narrow-screen text overrides. Each instance is understandable in isolation, but together they create recurring regressions: dialogs can begin under the app bar, floating actions can attach to page content instead of the shell action layer, controls can fall below a reliable touch size, and translated text can clip or collide on mobile.

This design implements recommendations 6, 7, and 8 from the mobile polish review as one reusable foundation:

1. remove remaining fixed and sticky positioning debt;
2. standardize every dialog and form-like overlay;
3. enforce a 44px interaction contract;
4. add an explicit mobile text-fit contract because control sizing alone does not prevent narrow-screen overflow.

The objective is not to make every screen visually identical. It is to give every screen the same reliable layout, focus, scrolling, safe-area, interaction, and text-containment behavior.

## Goals

- Keep fixed navigation, floating actions, sticky regions, dialogs, and page content in explicit shared layers.
- Migrate all direct dialog usages to one flexible application dialog component.
- Give bottom sheets the same safe-area, scrolling, footer, focus, and touch behavior where their presentation intentionally differs.
- Make every actionable control at least 44 by 44 CSS pixels without making dense desktop layouts unnecessarily large.
- Ensure English and French labels, values, helper text, and errors remain readable at supported mobile widths.
- Replace hardcoded screen offsets with semantic design tokens derived from the shell.
- Prevent these contracts from drifting through focused structural and behavior tests.

## Non-goals

- Redesigning the information architecture or business workflows inside dialogs.
- Replacing Vuetify's overlay, focus-trap, or transition implementation.
- Converting intentional bottom sheets into centered dialogs.
- Making all dialogs use the same width or content treatment.
- Globally reducing typography or truncating meaningful form guidance.
- Changing lot, sale, game, sync, entitlement, or persistence behavior.
- Introducing a separate mobile component tree or mobile-only state model.

## Chosen Architecture

Use a small set of shared primitives and tokens rather than a CSS-only retrofit or a highly configured monolithic dialog.

### `AppDialogShell`

`AppDialogShell` is the only component that directly renders `v-dialog`. It owns application-wide overlay behavior while leaving domain content and business actions in the calling feature.

Its public surface is intentionally small:

- `modelValue` controls visibility;
- `title` provides the accessible dialog name;
- an optional description id or description slot provides supporting semantics;
- `maxWidth` selects the desktop constraint;
- `persistent` preserves existing non-dismissible flows;
- `scrollable` defaults to true for forms and long content;
- `variant` selects one of a few layout treatments: `standard`, `report`, `checkout`, or `media`;
- an optional initial-focus target overrides the safe default;
- `title`, default content, and `actions` slots preserve feature-specific composition;
- `update:modelValue` is the sole visibility event.

The component owns:

- responsive width and height constraints;
- fullscreen presentation at widths up to and including 600px, except for an explicitly justified media treatment;
- top safe-area padding and keyboard-aware viewport sizing;
- one content scroll region;
- sticky title and action regions when present;
- accessible title and description wiring;
- initial focus, focus trapping through Vuetify, and focus restoration;
- Escape and outside-click behavior consistent with `persistent`;
- theme-aware surface, border, elevation, and divider styling.

The component does not accept arrays of generic field or action definitions. Domain components continue to render their own inputs and buttons, which avoids turning the shell into a form schema engine.

The `media` variant may remain inset on mobile only for a view-only image preview where preserving surrounding context is useful. It still obeys viewport, safe-area, focus, and dismissal rules. All editable, confirmation, report, checkout, and import dialogs use the fullscreen mobile treatment.

### `AppFormLayout`

`AppFormLayout` is a presentation-only scaffold used by editable forms whether they live in a dialog, bottom sheet, card, or full-page feature. `AppDialogShell` does not require it for non-form content.

The scaffold provides:

- consistent top, inline, section, and bottom spacing;
- a single-column mobile layout with an optional responsive multi-column desktop slot;
- standard placement for helper text, validation summaries, and section actions;
- text containment and `min-width: 0` behavior for field rows;
- an optional sticky action slot when the containing surface needs one;
- no validation, persistence, field schema, or domain state.

Existing forms migrate their outer layout to this scaffold while retaining their current fields and logic. Small inline editors that are already contained within a larger migrated form may use the shared form-row and text-fit utilities instead of nesting another scaffold.

### Existing confirmation and footer components

`AppConfirmDialog` delegates its overlay and layout behavior to `AppDialogShell`. It retains confirmation-specific copy, severity, loading, cancel, and confirm behavior.

`AppStickyActionFooter` remains the shared action-row presentation inside the dialog shell. Its spacing, wrapping, safe-area padding, and action hierarchy become part of the dialog contract. Callers keep close/cancel and confirm actions in this footer; section-owned actions remain with their sections.

### Intentional bottom sheets

The mobile lot switcher and singles row editor remain bottom sheets because their interaction model depends on a mobile sheet. They adopt the same overlay contract through the shared `app-overlay-frame` layout class, `AppFormLayout` when editable, and `AppStickyActionFooter` when actions are present:

- accessible name and optional description;
- one scroll region;
- safe-area-aware header and footer;
- focus restoration;
- 44px controls;
- mobile text containment.

The implementation must not create a second general-purpose dialog API for bottom sheets. Vuetify continues to own the bottom-sheet focus trap; the shared frame supplies layout and safe-area behavior.

## Full Dialog Migration

Every current direct `v-dialog` usage is migrated in this slice, including root lot and purchase flows, configuration, sales, portfolio, singles, Live, Game, spectator, bracket, wheel, workspace, import, report, checkout, and media dialogs.

Migration preserves each flow's:

- visibility and close conditions;
- validation and submit behavior;
- loading and disabled states;
- destructive confirmations;
- entitlement checks;
- existing domain components and methods;
- desktop maximum width where that width remains appropriate.

After migration, direct `v-dialog` markup is prohibited outside `AppDialogShell`. The rule is structural and test-enforced, so later features inherit the shared behavior by default.

## Full Form Migration

Every user-editable form surface in the root shell, configuration, sales, singles, Live, Game, workspace, import, and account/system flows adopts `AppFormLayout` or its shared row utilities. This includes page-level setup forms such as Purchasing Setup and small administrative forms such as Admin Sync Import; spacing is based on the form's content, not on filling the viewport.

The form scaffold removes accidental gaps between adjacent sections. It does not add minimum height, spacer elements, or flex growth merely to push a later form downward. Feature-owned intentional separation must use a named spacing token and have a visible structural reason.

## Shell Positioning And Clearance Contract

The app shell remains the sole owner of persistent chrome and action layers. Screen components may declare whether contextual actions exist, but they may not calculate viewport offsets from tabs, navigation heights, or floating-button dimensions.

Shared semantic tokens cover:

- shell top inset and compact header height;
- bottom-navigation height and bottom safe-area inset;
- navigation-only content clearance;
- navigation-plus-action content clearance;
- action-dock footprint and gap;
- sticky content top inset;
- dialog header and footer inset;
- snackbar placement.

The shell exposes the applicable values to descendants through CSS custom properties. Clearance is based on the rendered shell action layer, not duplicated active-tab logic. A screen without a persistent action receives navigation-only clearance; a screen with an action dock receives navigation-plus-action clearance.

Hardcoded replacements such as `72px`, `108px`, `7rem`, `2.7rem`, and `8.5rem` are removed where they represent shell chrome. Feature-local geometry that is genuinely unrelated to shell chrome may remain, but must use a feature-named token when reused.

Sticky content remains within its nearest scrolling surface. Fixed controls that belong to a top-level screen are teleported or rendered into the existing shell action zone. Dialog and bottom-sheet actions remain inside their overlay and never enter the shell action layer.

## Touch Target Contract

`--app-action-size-min` remains the authoritative minimum and resolves to 44px. Shared action primitives enforce it:

- `AppActionButton` applies the minimum inline and block size to icon-only and text actions;
- a shared touch-target utility covers domain controls that cannot use `AppActionButton`;
- icon glyphs may remain visually compact while their interactive box grows to 44px;
- tightly grouped steppers may share visual chrome, but each decrement and increment target independently meets the minimum;
- disabled controls retain their size and accessible name.

All icon-only actions receive localized accessible names that describe the action in context. Tooltip text may supplement, but does not replace, the accessible name. State must not be conveyed by color alone.

Desktop density is preserved by increasing the hit area without indiscriminately enlarging glyphs, cards, or typography.

## Mobile Text-Fit Contract

Mobile text must remain understandable without horizontal page scrolling or overlap at 320px through 600px. The app continues to optimize its primary visual checks for 360px, 390px, and 412px widths, while 320px acts as the containment floor.

### Wrapping and truncation

- Form labels, validation messages, helper text, empty-state guidance, dialog titles, and destructive warnings wrap naturally and are never ellipsized.
- User-authored or externally supplied names may use a single-line ellipsis only in compact selectors, list rows, chips, or app-bar summaries where the full value is available through the destination view or an accessible name.
- Primary actions prefer wrapping to two lines when needed. If a button row cannot fit, actions stack instead of shrinking below the touch or type contract.
- Compact metadata may wrap or move below its primary value. It must not collide with adjacent icons or values.
- Currency and numerical values use tabular alignment where useful and may scale only within an explicit bounded token; they are not clipped.

### Layout safeguards

- Flex and grid children containing text use `min-width: 0` where required for wrapping or ellipsis to work.
- Forms collapse multi-column layouts to one column before labels or fields become cramped.
- Dialog title rows reserve space for close or destructive header actions and allow the title block to wrap independently.
- Inputs retain at least 16px text on mobile to prevent browser zoom; standard body copy remains at least 14px.
- Long unbroken identifiers use safe word breaking in read-only metadata, while editable fields scroll internally according to native input behavior.
- No component uses global `overflow-x: hidden` to conceal a local overflow defect.

English and French are verified separately. French diacritics must be preserved, and translated strings are treated as first-class content rather than shortened solely to satisfy a layout.

## Data And Event Flow

The new foundation changes presentation boundaries only:

1. A feature owns its dialog-open state and domain data.
2. It binds that state to `AppDialogShell`.
3. The shell renders the overlay, labels it, selects the responsive treatment, and manages focus and scrolling.
4. Feature content emits its existing domain intents.
5. Existing methods perform validation, persistence, sync, and error handling.
6. On close, the shell restores focus to the element that opened it when that element still exists.

Likewise, top-level features publish contextual actions through the established shell action path. The shell determines placement and clearance; feature methods remain authoritative for behavior.

## Failure And Recovery Behavior

- A failed submit leaves the dialog open, preserves user input, and moves or announces focus to the existing error summary or first invalid field where supported.
- Async actions keep existing in-flight guards and disabled/loading states; closing behavior does not race a pending submit.
- If the original focus trigger no longer exists after close, focus falls back to the nearest stable feature heading or shell content region.
- Virtual-keyboard resizing keeps the focused field and footer reachable without creating nested full-page scrolling.
- Content taller than the viewport scrolls inside the dialog content region; headers and confirm/cancel controls remain reachable.
- Offline, auth, entitlement, validation, and destructive behavior stays in the existing feature layer.

## Accessibility

- Every dialog has a programmatic name; descriptions are connected when they add useful context.
- Focus enters predictably, stays within the active overlay, and returns after close.
- Every actionable control has a minimum 44 by 44 CSS-pixel target.
- Icon-only controls have contextual English and French accessible names.
- Button order and visible hierarchy match keyboard focus order.
- Text reflow works at 200% zoom without loss of content or functionality.
- Selected, destructive, loading, error, and disabled states are not communicated by color alone.
- Reduced-motion preferences continue to govern overlay and action transitions.

## Testing Strategy

Use focused fast tests while migrating, then run the web verification gate.

### Component behavior tests

- `AppDialogShell` supplies accessible title/description semantics.
- Standard dialogs become fullscreen at the mobile breakpoint and remain constrained on desktop.
- initial focus, Escape behavior, persistent behavior, and focus restoration work.
- long dialog content has one scroll region and reachable sticky actions.
- action rows wrap or stack without reducing target size.

### Structural regression tests

- no component except `AppDialogShell` directly renders `v-dialog`;
- only the intentional, documented bottom-sheet components render `v-bottom-sheet`;
- top-level persistent actions render in the shell action zone;
- known hardcoded shell-offset values do not return in migrated feature styles;
- shared action primitives and exceptions use the common touch-target contract.
- editable dialog and page-form fixtures use `AppFormLayout` or the documented inline form-row utility;
- migrated form surfaces do not use empty flex growth or viewport-sized minimum heights to create vertical separation.

### Feature scenarios

Representative scenarios cover simple forms, destructive confirmation, long import/review content, checkout, report, media preview, Game, Live, workspace, and a bottom sheet. Tests verify that migration preserves submit, close, loading, disabled, and confirmation behavior.

### Text-fit verification

Add English and French cases with deliberately long but realistic content for:

- dialog titles and helper text;
- field labels, validation errors, and identifiers;
- primary and secondary action labels;
- chips, selectors, KPI labels, currency values, and empty states.

DOM tests assert wrapping/stacking classes and accessible full names. Responsive visual checks cover 320px containment plus 360x740, 390x844, and 412x915 in mobile dark/French and mobile light/English. No horizontal document overflow, clipped required copy, obscured final field, or overlapping fixed control is acceptable.

## Migration Sequence

1. Add semantic positioning, dialog, touch-target, and text-fit tokens/utilities.
2. Add and test `AppDialogShell`; refactor `AppConfirmDialog` and `AppStickyActionFooter` onto it.
3. Add `AppFormLayout` and migrate root and feature forms without changing their domain logic.
4. Migrate dialogs by feature group while preserving domain behavior.
5. Align the two intentional bottom sheets with the shared overlay contract.
6. Replace legacy Game, Singles, and Live shell offsets with semantic tokens and shell action placement.
7. Apply the shared touch target to undersized controls and add localized names.
8. Fix mobile text containment in migrated dialogs/forms and known narrow-screen feature surfaces.
9. Add structural guards, focused feature scenarios, and responsive visual checks.
10. Run the complete web verification gate and inspect light/dark English/French results.

## Acceptance Criteria

- `AppDialogShell` is the only direct `v-dialog` owner in application code.
- Every existing dialog/form overlay uses the shared responsive behavior without losing feature actions or validation.
- Every user-editable page or overlay form uses the shared form scaffold or documented inline row utility, with no artificial viewport gap between form sections.
- The two intentional bottom sheets follow the same safe-area, scrolling, focus, touch, and text-fit rules.
- Dialogs and forms open below safe areas, expose all fields, and keep their final actions reachable with the mobile keyboard present.
- Persistent screen actions live in the shell action layer and do not change position during tab rendering.
- Migrated feature styles no longer encode shell chrome with hardcoded offsets.
- Every actionable control in the migrated surfaces has a 44 by 44 CSS-pixel hit area and a contextual accessible name.
- Required English and French text remains readable at 320px without page-level horizontal scrolling, collision, or inappropriate truncation.
- Form input text remains at least 16px and normal body copy remains at least 14px on mobile.
- Existing workflow, persistence, sync, confirmation, entitlement, and desktop behavior remains intact.
- Focus, keyboard, screen-reader, light/dark theme, and reduced-motion behavior pass the defined focused checks.
- `npm run verify` passes before the implementation is considered complete.
