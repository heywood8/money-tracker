# Google Sheets Import — Design Spec

**Date:** 2026-05-11
**Status:** Approved

## Summary

Add "From Google Sheets" to the existing Import subpanel in Settings. Import replaces all app data (same semantics as JSON/SQLite restore). Also fixes the current export to include missing columns required for lossless round-trips.

## Problem

The app already exports to Google Sheets but cannot import back. Additionally, the current export is lossy — it omits several DB columns and uses display names (not IDs) for foreign key references, preventing reliable re-import.

## Solution

Two parts:
1. Fix the export (`buildSheetsData`) to add missing columns and hybrid ID+name foreign keys.
2. Add `importFromSheets` to `GoogleSheetsService.js` and wire it into the Import subpanel UI.

---

## Part 1 — Export Fixes

`buildSheetsData` in `app/services/GoogleSheetsService.js` gets the following additional columns. Existing columns are unchanged — name columns stay for human readability and manual entry fallback.

| Sheet | New columns added |
|---|---|
| **Accounts** | `display_order`, `hidden`, `monthly_target` |
| **Categories** | `parent_id`, `color`, `is_shadow` |
| **Operations** | `account_id`, `category_id`, `to_account_id`, `exchange_rate`, `destination_amount`, `destination_currency` |
| **Budgets** | `category_id` |
| **Planned Operations** | `account_id`, `category_id`, `to_account_id` |
| **Balance History** | `account_id` |

After this change the sheet fully represents the DB schema, enabling lossless export → import round-trips.

---

## Part 2 — Import Service

### New function: `importFromSheets(accessToken, onProgress)`

Added to `app/services/GoogleSheetsService.js`.

**Progress steps** (same shape as `exportToSheets`):
- `connect` — load spreadsheet ID from preferences, fetch all 6 sheets in a single `batchGet` API call
- `parse` — parse header rows into column maps, build rows → objects, resolve foreign keys, construct backup object
- `restore` — call existing `restoreBackup(backup)` — full wipe-and-replace, no new DB logic

### Foreign key resolution (per-row, for Operations / Budgets / Planned / Balance History)

1. If `account_id` column exists and its value matches an ID from the Accounts sheet → use it directly
2. Else resolve by `account` display name → look up in the name→id map built from the Accounts sheet
3. If neither resolves → set null (consistent with `onDelete: set null` schema behaviour)

Same logic for `category_id` / `category` and `to_account_id` / `to_account`.

### Backup object shape

The constructed backup object matches the format returned by `createBackup()` exactly, so `restoreBackup()` can be called without modification.

### Error cases

| Error | Thrown as | Handling |
|---|---|---|
| No spreadsheet ID saved | `no_spreadsheet_configured` | Show inline message: "Export to Google Sheets first to set up your spreadsheet." No progress UI shown. |
| Spreadsheet not found / deleted | `spreadsheet_not_found` | Inline error in subpanel |
| Missing sheet tab | — | Treat as empty array, continue |
| Auth errors | `not_signed_in`, `refresh_failed` | Same handling as export (sign-in flow or inline error) |

---

## Part 3 — UI

### Import subpanel (`app/modals/SettingsModal.js`)

Add a third row to the existing Import subpanel:

```
[G icon]  From Google Sheets
          Import from your Penny spreadsheet       >
```

Tap flow:
1. If no spreadsheet ID saved → show inline message, no further action
2. Get access token via `getValidAccessToken()`, sign in via `googleSignIn()` if needed
3. Show inline progress (same `sheetsSteps` / three-step UI pattern reused from export)
4. On restore step completing → `ImportProgressModal` takes over (existing — handles wipe-and-restore progress events)
5. On error → inline error text in subpanel, back arrow to dismiss

No new modals. No new navigation patterns. Progress UI reuses the existing `sheetsSteps` component structure, just with import-specific step labels (`connect`, `parse`, `restore`).

---

## Files to Modify

| File | Change |
|---|---|
| `app/services/GoogleSheetsService.js` | Fix `buildSheetsData` (add columns); add `importFromSheets` function |
| `app/modals/SettingsModal.js` | Add "From Google Sheets" row to Import subpanel; wire up import state and handlers |

No new files. No DB changes. No new context providers.

---

## Testing

- Export → import round-trip: all 6 tables restore with full fidelity including multi-currency transfers and category folder structure
- Manual entry: operations with only name columns (no ID columns) resolve correctly on import
- No spreadsheet configured: correct inline message shown, no crash
- Auth failure: correct inline error shown
- Missing sheet tab: import continues without crashing, that table restores as empty
