# 11. Require bilingual user-facing UI

Date: 2026-05-20

## Status

Accepted

## Context

Calcul8 is used in English and French. The authenticated PWA already has shared translation catalogs, but public spectator pages and fallback strings could drift into English-only copy.

User-facing text is part of the product contract, not a cosmetic layer. Public pages are especially important because buyers may see them without any app context or account settings.

## Decision

Every visible user-facing string in the PWA and public spectator entry must resolve through the shared English/French i18n catalogs unless it is a brand name, product name, file format, or third-party term.

French copy must use proper diacritics. New UI surfaces must add aligned English and French keys with tests that keep the catalogs synchronized.

## Consequences

Spectator pages, dialogs, cards, buttons, chips, tables, and fallback states are expected to be usable in English and French.

Component literals remain acceptable for non-user-facing implementation details, test fixtures, constants, and external terms.

UI work has a small translation/test cost, but it prevents public surfaces from regressing into English-only behavior.
