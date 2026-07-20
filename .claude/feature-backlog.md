# Penny - Feature Backlog

This document contains potential features for the Penny app. Use the architect agent to design these features before implementation.


## Quality of Life Backlog (UX audit 2026-07-19)

Findings from a code-level UX audit. Each item is small-scope (no major rework) and user-visible. Items marked **[verified]** were confirmed against the code by hand; the rest carry file:line evidence from the audit agents.

### QoL-1. Budgets — dormant by design, do NOT wire up
**Status**: ❄️ Won't do (intentional)
**Note**: budgets are fully implemented in code (`BudgetModal.js`, `BudgetProgressBar.js`, contexts, DB, tests) but the UI entry points were deliberately removed by the owner — the feature is dormant on purpose, not an oversight. Don't propose re-surfacing it. If it ever comes back: `BudgetModal.js:540` has a hardcoded untranslated string to fix.

### QoL-2. Split operation parses decimal comma wrong (bug)
**Status**: 🚧 In Progress
**Problem**: `SplitOperationModal.js:89-92` stores raw input; `parseFloat` at `:74` turns "12,50" into `12` silently — wrong split amounts in comma-decimal locales (ru, de, fr, es, it, pt). Every other amount field normalizes (`OperationsScreen.js:782-794`, `OperationModal.js:283-300`).
**Fix**: `text.replace(',', '.')` in `handleAmountChange`.

### QoL-3. Category/label filters exist in the data layer but have no UI
**Status**: ⏸️ Deferred (owner decision, 2026-07-20) — not doing for now
**Problem**: `OperationsDataContext.js:209-216` filters by `categoryIds`/`labels`, the filter badge counts them, `FilterChipStrip` renders their chips and `OperationsScreen.js` can clear them — but `ExpandableFilters.js` only offers Type / Date / Amount / Accounts. The category and label filters can never be set.
**Fix**: add a Category section and a Labels multi-select to `ExpandableFilters`.

### QoL-4. Category delete: generic dead-end error, no impact preview
**Status**: 🚧 In Progress
**Problem**: `CategoriesDB.js:313-344` throws precise reasons ("N transactions use this category…"), but `CategoriesContext.js:184` always shows "Failed to delete category. Please try again." The confirm dialog (`CategoriesScreen.js:125-141`) also never previews how many transactions/subcategories are affected — contrast with the guided account-deletion flow.
**Fix**: surface the real reason in the dialog; ideally pre-check counts before confirming, like `AccountsScreen.js:533-574`.

### QoL-5. New category ignores the folder you're browsing
**Status**: ✅ Completed (#1272, 2026-07-20) — `openForm` now defaults `parentId` to `gridParentId` and inherits the folder's type
**Problem**: inside a folder, the AddFAB calls `openForm(null)` (`CategoriesScreen.js:344`) and `DEFAULT_FORM_VALUES` hardcodes `parentId: null` — the new category lands at the root instead of the open folder (`gridParentId` is ignored).
**Fix**: default `parentId` to the current `gridParentId`.

### QoL-6. Planned operations: Execute is swipe-only
**Status**: 🚧 In Progress
**Problem**: the long-press menu (`PlannedOperationsScreen.js:262-292`) offers only Edit/Delete; Execute / Mark as executed / Undo live exclusively behind an unhinted swipe (`renderRightActions`). Poor discoverability and accessibility for the core action.
**Fix**: add Execute/Mark-done/Undo to the long-press menu (and/or a visible affordance hinting the swipe).

### QoL-7. Quick actions on operation rows (delete + repeat)
**Status**: ✅ Completed (#1275, 2026-07-20) — long-press quick-action menu with Repeat + Delete
**Problem**: `OperationListItem.js:104-111` wires only `onPress` — deleting an operation always costs 3+ taps through the full edit modal. There is also no way to quickly repeat a frequent transaction.
**Fix**: long-press context menu (or swipe) on the row: Delete (with the existing confirm) and **Repeat** — duplicate the operation with today's date. Repeat is a high-value, low-cost feature for daily logging.

### QoL-8. Date-range filter presets
**Status**: 🚧 In Progress
**Problem**: "show this month" requires opening the native date picker twice (`ExpandableFilters.js:145-181`). No one-tap presets.
**Fix**: preset chips (Today / This week / This month / Last 30 days) above the manual pickers.

### QoL-9. Graphs period navigation: wheel-only scrubbing
**Status**: 🚧 In Progress
**Problem**: the only period control is a small floating wheel (`GraphsScreen.js:878-893`, 28px items); going back a year means many drag gestures, and there is no "jump to current month" once you drift away.
**Fix**: chevron prev/next taps and a "today" pill when not on the current month.

### QoL-10. Balance history feels slower than the other cards
**Status**: 🚧 In Progress
**Problem**: `useBalanceHistory.js:56-82` awaits 4 independent DB queries sequentially on every account/month switch.
**Fix**: `Promise.all` — perceived latency drop for free.

### QoL-11. Graphs: silent disappearances instead of empty states
**Status**: 🚧 In Progress
**Problem**: in Full Year view the balance/prediction section unmounts with zero explanation (`GraphsScreen.js:792`); with no visible accounts the screen shows a wall of individually-blank cards. `EmptyState.js` is reused by 3 screens but never by Graphs. Also the pie cards flash "no data" for a frame on cold load (`useExpenseData.js:19-20` starts `loading: false`).
**Fix**: placeholder text for year-view balance card, top-level `EmptyState` when no visible accounts, init `loading: true`.

### QoL-12. QuickAdd validation feedback is inconsistent
**Status**: ✅ Completed (#1278, 2026-07-20) — inline validation flash extended beyond missing-category
**Problem**: a missing category gets a lightweight non-blocking red flash, but a missing account / zero amount / same-account transfer pops a blocking dialog needing an extra OK tap (`OperationsScreen.js:618-626`).
**Fix**: extend the flash/inline treatment to the other one-field omissions.
**Implementation**: `handleQuickAdd` now maps each single-field validation failure to the offending field via `getQuickAddFlashField` and flashes it red inline instead of opening a dialog. The category-only `flashCategoryError` prop was generalized to `flashError={{ field, token }}`, threaded through `QuickAddForm` → `OperationFormFields`, which flashes the source-account picker, target-account picker/chips, category chips, or the `Calculator` amount display (new `flashError` bool → red display border). The blocking dialog remains only for non-field errors (missing type/date). Same behaviour is unchanged in `OperationModal` (no `flashError` passed).

### QoL-13. Settings polish (small items)
**Status**: ✅ Completed (#1277, 2026-07-20) — reset feedback, Sheets setup CTA, update snooze, amount-filter commit-on-submit + currency hint
- Database reset gives zero feedback — subpanel closes and the wipe runs invisibly (`SettingsScreen.js:524-532`); reuse the import progress pattern or at least spinner + toast.
- "Import from Google Sheets" without a configured spreadsheet dead-ends with plain text (`SettingsScreen.js:596-600`, `:1381-1385`); add an inline "Export now" CTA that opens the export subpanel.
- Update-available modal can interrupt mid-task and its snooze is session-only (`AppInitializer.js:70-128`); persist a "remind me later" and avoid firing over open modals.
- Amount-range filter commits only on blur and shows no currency hint (`ExpandableFilters.js:189-212`).

### QoL-14. Categories: no drag-reorder
**Status**: ⏸️ Deferred (owner decision, 2026-07-20) — not doing for now
**Problem**: accounts have `NestableDraggableFlatList` reordering (`AccountsScreen.js:874-881`), categories are a plain grid — frequent categories can't be put first. Also no "Categories tab" toggle analogous to `showAccountsTab` (`DisplaySettingsContext.js:16`), so Categories is always 2 taps deep behind Settings.
**Fix**: drag-reorder for the categories grid; optional `showCategoriesTab` toggle.

### QoL-15. Subpanel-convention stragglers
**Status**: 🚧 In Progress
**Problem**: two places still stack a second `Modal` instead of the app's subpanel pattern: the split-operation category picker (`SplitOperationModal.js:241-276`, hides the amount just typed) and `CategorySpendingCard`'s picker (`CategorySpendingCard.js:628-643`, also lacks search). The parent-category picker in `CategoriesScreen.js:560-585` has no type-to-filter either.
**Fix**: migrate to subpanels; add a search box to category pickers.


## High Priority Features

### 1. Budget Tracking
**Status**: ❄️ Dormant by design — code complete, UI entry points intentionally removed (see QoL-1)
**Description**: Allow users to set monthly budgets per category and track spending against those budgets.
**User Value**: Helps users control spending and achieve financial goals.

### 2. Data Export/Import
**Status**: ✅ Completed
**Description**: Allow users to export data to CSV/Excel and import from other apps.
**User Value**: Data portability, backup, and integration with other financial tools.
**Command**: Use architect agent to design data export/import feature

### 3. Multi-Currency Support Enhancement
**Status**: ✅ Completed
**Description**: Add exchange rate tracking, automatic conversion, and multi-currency reporting.
**User Value**: Better support for users with accounts in different currencies.
**Implementation**: Multi-currency transfers with offline exchange rates, bidirectional rate/amount editing, and precise currency arithmetic for currencies with different decimal places.

### 4. CSV Export - Missing Tables Fix
**Status**: Not Started
**Description**: Fix CSV export functionality to include all database tables (currently some tables are not being exported).
**User Value**: Complete data backup and export capabilities, ensuring no data is lost during export operations.
**Technical Notes**: Review BackupRestore service to identify which tables are missing from export and ensure all relevant tables are included.
**Command**: Use architect agent to design CSV export fix


## Medium Priority Features

### 5. Search and Filters
**Status**: ✅ Completed (with comprehensive test coverage)
**Description**: Enable users to search operations by text and filter by date range, category, account, or amount.
**User Value**: Makes it easy to find specific transactions in large datasets.
**Implementation** (updated 2026-07-19): search lives in `SearchBar`/`SearchOverlay` + `ExpandableFilters` with a filter-count badge and per-group clear chips (`FilterChipStrip`). Filters UI covers type, accounts, date range and amount range. ⚠️ Category and label filters are implemented in the data layer but have no UI to set them — see QoL-3.
**Testing**: 121 tests covering database queries, component behavior, integration workflows, edge cases, and null-safety.
**Command**: Use architect agent to design search and filters feature

### 6. Attachments (Receipts/Photos)
**Status**: Not Started
**Description**: Allow users to attach photos of receipts or documents to operations.
**User Value**: Keep all transaction-related information in one place.
**Command**: Use architect agent to design attachments feature

### 7. Goals and Savings Tracking
**Status**: Not Started
**Description**: Set financial goals and track progress toward them with visual indicators.
**User Value**: Motivation and clear visibility of progress toward objectives.
**Command**: Use architect agent to design goals and savings tracking feature

### 8. Widget Support
**Status**: Not Started
**Description**: Home screen widgets showing balance, recent transactions, or budgets.
**User Value**: Quick access to financial information without opening app.
**Command**: Use architect agent to design widget support feature

### 9. Tags and Labels
**Status**: Not Started
**Description**: Add custom tags to operations for additional categorization beyond folders.
**User Value**: More flexible organization (e.g., "tax-deductible", "business", "vacation").
**Command**: Use architect agent to design tags and labels feature


## Low Priority Features

### 10. Recurring Transactions
**Status**: ✅ Completed
**Description**: Automate regular expenses and income (salary, rent, subscriptions, etc.).
**User Value**: Saves time by automatically creating expected transactions.
**Implementation**: PlannedOperationsScreen with PlannedOperationModal; planned ops marked with isRecurring flag, executed monthly via lastExecutedMonth tracking.

### 11. Reports and Analytics
**Status**: ✅ Completed
**Description**: Provide insights into spending patterns, trends over time, and financial summaries.
**User Value**: Helps users understand their financial behavior and make better decisions.
**Implementation**: GraphsScreen with expense/income pie charts, category spending card, spending prediction card, and balance history chart with account picker.

### 12. Split Transactions
**Status**: ✅ Completed
**Description**: Enable dividing a single transaction across multiple categories.
**User Value**: More accurate categorization (e.g., grocery shopping with household items).
**Implementation**: SplitOperationModal in components/operations/; accessible from OperationModal.

### 13. Live Exchange Rates
**Status**: ✅ Completed
**Priority**: Low
**Description**: Integrate live exchange rate API to fetch real-time currency conversion rates with offline rates as fallback.
**User Value**: More accurate currency conversions for international transactions.
**Implementation**: `currency.js` fetches live rates with offline fallback; `useMultiCurrencyTransfer` hook integrates rate source tracking. (#288)

### 14. Transfer Screen UX Redesign
**Status**: ✅ Completed
**Priority**: Low
**Description**: Redesign the transfer form to improve UX for multi-currency transfers with clearer layout and bidirectional editing.
**User Value**: Easier and more intuitive transfer creation, especially for multi-currency scenarios.
**Implementation**: Category/to-account and date pickers shown side-by-side; bidirectional exchange rate and destination amount editing in OperationModal. (#348, #356)

## Future Considerations

### 15. Bill Reminders
**Status**: Not Started
**Description**: Set reminders for upcoming bills and payments.
**User Value**: Never miss a payment, avoid late fees.

### 16. Shared Accounts/Family Mode
**Status**: Not Started
**Description**: Allow multiple users to share and collaborate on accounts.
**User Value**: Household budget management, couples' finance tracking.

### 17. Investment Tracking
**Status**: Not Started
**Description**: Track stocks, bonds, and other investments with current values.
**User Value**: Complete financial picture including investments.

### 18. Loan/Debt Tracking
**Status**: Not Started
**Description**: Track loans, debts, and payment schedules.
**User Value**: Monitor progress on debt repayment.

### 19. Custom Reports
**Status**: Not Started
**Description**: Allow users to create custom reports with specific criteria.
**User Value**: Tailored insights for specific needs.

### 20. Notifications and Alerts
**Status**: Not Started
**Description**: Push notifications for budget warnings, large transactions, etc.
**User Value**: Proactive financial awareness.

### 21. Biometric Security
**Status**: Not Started
**Description**: Add fingerprint/face recognition for app access.
**User Value**: Protect sensitive financial data.

### 22. Cloud Sync
**Status**: Not Started
**Description**: Synchronize data across multiple devices via cloud storage.
**User Value**: Access data from any device.

### 23. Bank Integration
**Status**: Not Started
**Description**: Automatically import transactions from bank accounts (via Plaid or similar).
**User Value**: Reduced manual entry, always up-to-date data.

---

## How to Use This Backlog

1. **Review and Prioritize**: Decide which features are most important
2. **Design Phase**: Use the architect agent to design the feature
   ```
   Use the architect agent to design [feature name]
   ```
3. **Review Design**: Examine the specification and ask questions
4. **Implementation**: Once design is approved, implement the feature
5. **Update Status**: Mark features as "Designed", "In Progress", or "Completed"

## Notes

- Features are ordered roughly by priority, but this can be adjusted
- Each feature should go through the design phase before implementation
- Consider user feedback when prioritizing features
- Some features may require external services or paid APIs
- Break down complex features into smaller phases if needed
