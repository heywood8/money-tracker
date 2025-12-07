# Penny - Feature Backlog

This document contains potential features for the Penny app. Use the architect agent to design these features before implementation.


## High Priority Features

### 1. Budget Tracking
**Status**: ✅ Completed
**Description**: Allow users to set monthly budgets per category and track spending against those budgets.
**User Value**: Helps users control spending and achieve financial goals.
**Command**: Use architect agent to design budget tracking feature

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


## Medium Priority Features

### 4. Search and Filters
**Status**: ✅ Completed (with comprehensive test coverage)
**Description**: Enable users to search operations by text and filter by date range, category, account, or amount.
**User Value**: Makes it easy to find specific transactions in large datasets.
**Implementation**: Floating action button (FAB) opens filter modal with comprehensive search across description, amount, account names, and category names. Filters include type (expense/income/transfer), accounts, categories, date range, and amount range. Week-based lazy loading maintained with filters applied to each batch. Filter state persists across navigation using AsyncStorage.
**Testing**: 121 tests covering database queries, component behavior, integration workflows, edge cases, and null-safety.
**Command**: Use architect agent to design search and filters feature

### 5. Attachments (Receipts/Photos)
**Status**: Not Started
**Description**: Allow users to attach photos of receipts or documents to operations.
**User Value**: Keep all transaction-related information in one place.
**Command**: Use architect agent to design attachments feature

### 6. Goals and Savings Tracking
**Status**: Not Started
**Description**: Set financial goals and track progress toward them with visual indicators.
**User Value**: Motivation and clear visibility of progress toward objectives.
**Command**: Use architect agent to design goals and savings tracking feature

### 7. Widget Support
**Status**: Not Started
**Description**: Home screen widgets showing balance, recent transactions, or budgets.
**User Value**: Quick access to financial information without opening app.
**Command**: Use architect agent to design widget support feature

### 8. Tags and Labels
**Status**: Not Started
**Description**: Add custom tags to operations for additional categorization beyond folders.
**User Value**: More flexible organization (e.g., "tax-deductible", "business", "vacation").
**Command**: Use architect agent to design tags and labels feature


## Low Priority Features

### 9. Recurring Transactions
**Status**: Not Started
**Description**: Automate regular expenses and income (salary, rent, subscriptions, etc.).
**User Value**: Saves time by automatically creating expected transactions.
**Command**: Use architect agent to design recurring transactions feature

### 10. Reports and Analytics
**Status**: Not Started
**Description**: Provide insights into spending patterns, trends over time, and financial summaries.
**User Value**: Helps users understand their financial behavior and make better decisions.
**Command**: Use architect agent to design reports and analytics feature

### 11. Split Transactions
**Status**: Not Started
**Description**: Enable dividing a single transaction across multiple categories.
**User Value**: More accurate categorization (e.g., grocery shopping with household items).
**Command**: Use architect agent to design split transactions feature

### 12. Live Exchange Rates
**Status**: Not Started
**Priority**: Low
**Description**: Integrate live exchange rate API (e.g., https://github.com/fawazahmed0/exchange-api) to fetch real-time currency conversion rates and update offline rates periodically.
**User Value**: More accurate currency conversions for international transactions.
**Technical Notes**: Should maintain offline rates as fallback when API is unavailable.
**Command**: Use architect agent to design live exchange rates feature

### 13. Transfer Screen UX Redesign
**Status**: Not Started
**Priority**: Low
**Description**: Redesign the "add new transfer" screen to improve user experience with multi-currency transfers, making exchange rate and destination amount calculations more intuitive and visually clear.
**User Value**: Easier and more intuitive transfer creation, especially for multi-currency scenarios.
**Considerations**: Clear visual feedback for bidirectional editing, better layout for currency-specific fields, inline validation.
**Command**: Use architect agent to design transfer screen UX improvements

## Future Considerations

### 14. Bill Reminders
**Status**: Not Started
**Description**: Set reminders for upcoming bills and payments.
**User Value**: Never miss a payment, avoid late fees.

### 15. Shared Accounts/Family Mode
**Status**: Not Started
**Description**: Allow multiple users to share and collaborate on accounts.
**User Value**: Household budget management, couples' finance tracking.

### 16. Investment Tracking
**Status**: Not Started
**Description**: Track stocks, bonds, and other investments with current values.
**User Value**: Complete financial picture including investments.

### 17. Loan/Debt Tracking
**Status**: Not Started
**Description**: Track loans, debts, and payment schedules.
**User Value**: Monitor progress on debt repayment.

### 18. Custom Reports
**Status**: Not Started
**Description**: Allow users to create custom reports with specific criteria.
**User Value**: Tailored insights for specific needs.

### 19. Notifications and Alerts
**Status**: Not Started
**Description**: Push notifications for budget warnings, large transactions, etc.
**User Value**: Proactive financial awareness.

### 20. Biometric Security
**Status**: Not Started
**Description**: Add fingerprint/face recognition for app access.
**User Value**: Protect sensitive financial data.

### 21. Cloud Sync
**Status**: Not Started
**Description**: Synchronize data across multiple devices via cloud storage.
**User Value**: Access data from any device.

### 22. Bank Integration
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
