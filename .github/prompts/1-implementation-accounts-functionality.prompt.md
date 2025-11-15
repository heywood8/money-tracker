## Plan: Accounts Functionality (ISO Currencies, Inline Editing, Validation, Local Storage)

Implement "Accounts" with:
- Editable/deletable accounts
- ISO currency dropdown (from JSON)
- Inline editing (no confirmation)
- Basic validation and error handling
- Local storage persistence

### Steps
1. Download and add the ISO currency JSON (from the gist) to the project (e.g., `assets/currencies.json`).
2. Define the `Account` model: id, name, balance, currency code.
3. Use React state for the accounts list; load/save to AsyncStorage for persistence.
4. Build the "Accounts" screen:
   - List accounts with inline editable fields (name, balance, currency).
   - Add/delete buttons for each account.
   - Show validation errors (e.g., empty name, invalid balance).
5. On any change (edit/add/delete), update state and persist to AsyncStorage.
6. Use a dropdown for currency selection, populated from the ISO currency JSON.
7. Use a unique id (e.g., uuid) for each account.
8. Show error messages inline, clear on valid input.
9. Keep UI minimal for fast LLM-driven iteration.
