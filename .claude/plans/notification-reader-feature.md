# Notification Reader Feature - Implementation Plan

## Overview

Enable the Penny app to read bank transaction notifications, automatically parse transaction details, and create operations. The feature introduces smart bindings that learn from user preferences:
- **Card → Account binding**: Map masked card numbers to user accounts
- **Purchase Source → Category binding**: Map merchant names to transaction categories

## Example Notification

```
ARCA transactions
PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD
```

**Parsed fields:**
- Transaction type: `PRE-PURCHASE` (expense)
- Amount: `1,300.00 AMD`
- Card mask: `4083***7027`
- Purchase source: `YANDEX.GO, AM`
- Date: `11.12.2025 12:09`
- Balance after: `475,760.04 AMD`

## Database Schema Changes

### Table 1: card_bindings

Maps masked card numbers to accounts:

```javascript
export const cardBindings = sqliteTable('card_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardMask: text('card_mask').notNull().unique(), // e.g., "4083***7027"
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  bankName: text('bank_name'), // e.g., "ARCA" (optional, for display)
  lastUsed: text('last_used').notNull(), // ISO 8601
  createdAt: text('created_at').notNull(),
}, (table) => ({
  cardMaskIdx: index('idx_card_bindings_card_mask').on(table.cardMask),
  accountIdx: index('idx_card_bindings_account').on(table.accountId),
}));
```

### Table 2: merchant_bindings

Maps merchant/purchase source names to categories:

```javascript
export const merchantBindings = sqliteTable('merchant_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantName: text('merchant_name').notNull().unique(), // e.g., "YANDEX.GO, AM"
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  lastUsed: text('last_used').notNull(), // ISO 8601
  createdAt: text('created_at').notNull(),
}, (table) => ({
  merchantNameIdx: index('idx_merchant_bindings_merchant_name').on(table.merchantName),
  categoryIdx: index('idx_merchant_bindings_category').on(table.categoryId),
}));
```

---

## Implementation Phases

### Phase 1: Database Foundation

**Goal**: Add new tables and migration, create database service layer.

#### Tasks:

1. **Update schema.js** - Add `cardBindings` and `merchantBindings` tables
2. **Create migration 0004** - SQL to create both tables with indexes
3. **Create CardBindingsDB.js** service:
   - `getByCardMask(cardMask)` - Find binding by card mask
   - `create(cardMask, accountId, bankName)` - Create new binding
   - `update(id, accountId)` - Update existing binding
   - `delete(id)` - Remove binding
   - `getAll()` - List all bindings
   - `updateLastUsed(id)` - Update last used timestamp
4. **Create MerchantBindingsDB.js** service:
   - `getByMerchantName(merchantName)` - Find binding by merchant name
   - `create(merchantName, categoryId)` - Create new binding
   - `update(id, categoryId)` - Update existing binding
   - `delete(id)` - Remove binding
   - `getAll()` - List all bindings
   - `updateLastUsed(id)` - Update last used timestamp
5. **Update BackupRestore.js** - Include new tables in backup/restore

#### Files to Create/Modify:
- `app/db/schema.js` (modify)
- `drizzle/0004_notification_bindings.js` (create)
- `drizzle/migrations.js` (modify)
- `app/services/CardBindingsDB.js` (create)
- `app/services/MerchantBindingsDB.js` (create)
- `app/services/BackupRestore.js` (modify)

#### Testing:
- `__tests__/services/CardBindingsDB.test.js`
- `__tests__/services/MerchantBindingsDB.test.js`

---

### Phase 2: Notification Parser

**Goal**: Create a parser that extracts transaction data from notification text.

#### Tasks:

1. **Create NotificationParser.js** service:
   - `parseNotification(title, body)` - Main parse function
   - Returns structured data: `{ type, amount, currency, cardMask, merchantName, date, balance, rawText, bankName }`
   - Support for ARCA format initially (extensible for other banks)
   - Handle various transaction types: `PRE-PURCHASE`, `PURCHASE`, `WITHDRAWAL`, `TRANSFER`, etc.

2. **Bank-specific parsers** (modular design):
   - `parsers/ArcaParser.js` - Parse ARCA notification format
   - `parsers/index.js` - Registry of parsers, auto-detect bank from notification title

3. **Normalization utilities**:
   - Normalize merchant names (trim, standardize case)
   - Parse amount with locale-aware number parsing
   - Parse date from various formats

#### Files to Create:
- `app/services/notification/NotificationParser.js` (create)
- `app/services/notification/parsers/ArcaParser.js` (create)
- `app/services/notification/parsers/index.js` (create)

#### Testing:
- `__tests__/services/notification/NotificationParser.test.js`
- `__tests__/services/notification/ArcaParser.test.js`

---

### Phase 3: React Contexts for Bindings

**Goal**: Create contexts for managing bindings state in UI.

#### Tasks:

1. **Create CardBindingsContext.js**:
   - State: `bindings`, `loading`, `error`
   - Actions: `loadBindings()`, `addBinding(cardMask, accountId, bankName)`, `updateBinding(id, accountId)`, `removeBinding(id)`, `findByCardMask(cardMask)`
   - Integrate with CardBindingsDB service

2. **Create MerchantBindingsContext.js**:
   - State: `bindings`, `loading`, `error`
   - Actions: `loadBindings()`, `addBinding(merchantName, categoryId)`, `updateBinding(id, categoryId)`, `removeBinding(id)`, `findByMerchantName(merchantName)`
   - Integrate with MerchantBindingsDB service

3. **Add contexts to App.js** provider tree

#### Files to Create/Modify:
- `app/contexts/CardBindingsContext.js` (create)
- `app/contexts/MerchantBindingsContext.js` (create)
- `App.js` (modify)

#### Testing:
- `__tests__/contexts/CardBindingsContext.test.js`
- `__tests__/contexts/MerchantBindingsContext.test.js`

---

### Phase 4: Binding Selection Modals

**Goal**: Create UI modals for users to select account/category for new bindings.

#### Tasks:

1. **Create SelectAccountForCardModal.js**:
   - Display card mask and bank name
   - List all non-hidden accounts
   - Allow user to select account
   - "Create new account" option
   - Save binding on selection

2. **Create SelectCategoryForMerchantModal.js**:
   - Display merchant name
   - Hierarchical category picker (existing CategoryPicker component)
   - Filter to expense categories only (for purchases)
   - Save binding on selection

3. **Add i18n translations** for new modal strings

#### Files to Create/Modify:
- `app/modals/SelectAccountForCardModal.js` (create)
- `app/modals/SelectCategoryForMerchantModal.js` (create)
- `assets/i18n.json` (modify)

#### Testing:
- `__tests__/modals/SelectAccountForCardModal.test.js`
- `__tests__/modals/SelectCategoryForMerchantModal.test.js`

---

### Phase 5: Notification Listener Service

**Goal**: Set up Android notification listener to capture bank notifications.

#### Tasks:

1. **Install/configure expo-notifications** or use **react-native-notification-listener** for reading other apps' notifications:
   - Note: Reading OTHER apps' notifications requires special Android permissions (NotificationListenerService)
   - May need native module or Expo plugin

2. **Create NotificationListener.js** service:
   - Register for notification access (Android special permission)
   - Filter notifications by package name (bank apps)
   - Configurable list of bank app package names
   - Event emission when bank notification received

3. **Create useNotificationListener hook**:
   - Subscribe to notification events
   - Process notifications through parser
   - Trigger binding checks and modals

4. **Android configuration**:
   - Add required permissions to android/app/src/main/AndroidManifest.xml
   - Configure notification listener service

#### Files to Create/Modify:
- `app/services/notification/NotificationListener.js` (create)
- `app/hooks/useNotificationListener.js` (create)
- `app.config.js` (modify for permissions)
- Possibly native Android code if Expo plugin doesn't exist

#### Research Required:
- Evaluate `react-native-notification-listener` vs native implementation
- Check if Expo has a plugin for notification access
- Determine required Android API levels

---

### Phase 6: Notification Processing Flow

**Goal**: Implement the main flow that processes notifications and creates operations.

#### Tasks:

1. **Create NotificationProcessor.js** service:
   - `processNotification(notification)` - Main entry point
   - Check card binding → prompt if missing
   - Check merchant binding → prompt if missing
   - Create operation when all bindings resolved
   - Queue mechanism for pending operations

2. **Create PendingNotificationsContext.js**:
   - Queue of notifications awaiting user input
   - Track which notifications need card binding
   - Track which notifications need merchant binding
   - Status: pending, processing, completed, error

3. **Integrate with OperationsContext**:
   - Auto-create expense operation
   - Set account from card binding
   - Set category from merchant binding
   - Use parsed amount and date

4. **Handle edge cases**:
   - Multiple notifications at once
   - Notification while modal is open
   - App in background vs foreground
   - Duplicate notification detection

#### Files to Create/Modify:
- `app/services/notification/NotificationProcessor.js` (create)
- `app/contexts/PendingNotificationsContext.js` (create)
- `app/contexts/OperationsContext.js` (modify - add auto-create)

---

### Phase 7: Settings & Bindings Management UI

**Goal**: Allow users to view and manage their bindings in Settings.

#### Tasks:

1. **Create BindingsScreen.js**:
   - Two sections: Card Bindings and Merchant Bindings
   - List all bindings with associated account/category
   - Edit binding (change associated account/category)
   - Delete binding
   - Search/filter bindings

2. **Update SettingsModal.js**:
   - Add "Manage Bindings" option
   - Add "Notification Listener" toggle
   - Add "Monitored Bank Apps" configuration

3. **Create notification permission request flow**:
   - Check permission status
   - Request permission with explanation
   - Guide user to system settings if needed

4. **Add navigation** to BindingsScreen from Settings

#### Files to Create/Modify:
- `app/screens/BindingsScreen.js` (create)
- `app/modals/SettingsModal.js` (modify)
- `app/navigation/SimpleTabs.js` (possibly modify)
- `assets/i18n.json` (modify)

---

### Phase 8: Testing & Polish

**Goal**: Comprehensive testing and UX polish.

#### Tasks:

1. **Integration tests**:
   - Full flow: notification → parse → binding prompts → operation created
   - Existing binding recognition
   - Error handling scenarios

2. **Unit tests** for all new components and services

3. **UX improvements**:
   - Notification banner when operation auto-created
   - Animation for binding prompts
   - Loading states
   - Error messages and recovery

4. **Edge case handling**:
   - Partial notification parsing
   - Network errors during binding lookup
   - Database transaction failures
   - App restart during pending operations

5. **Performance optimization**:
   - Efficient binding lookups (indexed)
   - Minimal re-renders in contexts
   - Background processing

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATION RECEIVED                            │
│                    (Android NotificationListener)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        NOTIFICATION PARSER                               │
│     Parse title/body → { cardMask, merchantName, amount, date, ... }    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CHECK CARD BINDING                                │
│                 cardMask → CardBindingsDB.getByCardMask()               │
└─────────────────────────────────────────────────────────────────────────┘
                        │                           │
                   Found │                          │ Not Found
                        ▼                           ▼
              ┌─────────────────┐      ┌───────────────────────────┐
              │   accountId     │      │  Show SelectAccountModal  │
              └─────────────────┘      │  → User selects account   │
                        │              │  → Create binding          │
                        │              └───────────────────────────┘
                        │                           │
                        └───────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       CHECK MERCHANT BINDING                             │
│             merchantName → MerchantBindingsDB.getByMerchantName()       │
└─────────────────────────────────────────────────────────────────────────┘
                        │                           │
                   Found │                          │ Not Found
                        ▼                           ▼
              ┌─────────────────┐      ┌───────────────────────────┐
              │   categoryId    │      │ Show SelectCategoryModal  │
              │                 │      │  → User selects category  │
              └─────────────────┘      │  → Create binding          │
                        │              └───────────────────────────┘
                        │                           │
                        └───────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CREATE OPERATION                                  │
│   OperationsContext.addOperation({                                       │
│     type: 'expense',                                                     │
│     amount, accountId, categoryId, date, description: merchantName      │
│   })                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      UPDATE BINDINGS lastUsed                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Android notification access permission denied | Feature won't work | Clear UX explaining why permission needed |
| Different banks have different notification formats | Parser may fail | Modular parser design, add parsers per bank |
| expo-notifications can't read other app notifications | Major blocker | Research alternatives, possibly native module |
| User doesn't respond to binding prompts | Operations stuck in queue | Timeout handling, manual review screen |
| Incorrect parsing creates wrong operations | Bad data | User confirmation before creating, easy edit/delete |

---

## Future Enhancements

1. **Smart categorization** - ML-based category suggestions
2. **Recurring detection** - Identify and flag recurring merchants
3. **Balance verification** - Compare parsed balance with account balance
4. **Income detection** - Handle incoming transfers
5. **Multiple parsers** - Support more bank notification formats
6. **Transaction matching** - Match notifications with existing operations

---

## Dependencies

### NPM Packages (to evaluate)
- `react-native-notification-listener` - Read other apps' notifications
- Or custom Expo plugin for notification listener service

### Android Permissions
- `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`
- User must grant notification access in system settings

---

## Estimated Effort

| Phase | Complexity | Est. Hours |
|-------|------------|------------|
| Phase 1: Database | Low | 4-6h |
| Phase 2: Parser | Medium | 6-8h |
| Phase 3: Contexts | Low | 4-5h |
| Phase 4: Modals | Medium | 6-8h |
| Phase 5: Notification Listener | High | 10-15h |
| Phase 6: Processing Flow | Medium | 8-10h |
| Phase 7: Settings UI | Medium | 6-8h |
| Phase 8: Testing | Medium | 8-10h |
| **Total** | | **52-70h** |

---

## Implementation Order for LLM Agent

For an LLM agent implementing this feature, the recommended order is:

1. **Phase 1** - Foundation work, no dependencies
2. **Phase 2** - Can be tested independently with mock data
3. **Phase 3** - Depends on Phase 1
4. **Phase 4** - Depends on Phase 3
5. **Phase 5** - Independent, but most complex (research required)
6. **Phase 6** - Depends on all previous phases
7. **Phase 7** - Can be started after Phase 3
8. **Phase 8** - Final integration

**Parallelization opportunities:**
- Phase 2 and Phase 5 can be researched/developed in parallel
- Phase 7 can start once Phase 3 is complete
