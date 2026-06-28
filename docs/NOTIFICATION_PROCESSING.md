# Bank Notification Processing

Turn incoming bank push notifications into Penny operations automatically.

This document describes the full design. **All rounds are now implemented** —
parser, storage/resolver, ingestion pipeline, and UI. The round breakdown below
is kept as a map of the implementation; each section lists the files involved.

## Motivation

Banking apps post each card transaction as an OS notification. Penny already has
a notification-listener foundation (see "Existing infrastructure" below) that can
read those notifications. Instead of the user re-entering every purchase by hand,
Penny can parse the notification and create the operation for them.

We start with the **PURCHASE** notification kind, using the Ameria "ARCA
transaction" template as the reference:

```
title: АРКА транзакции
text:  PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD
```

| Template field    | Example          | Becomes                                  |
| ----------------- | ---------------- | ---------------------------------------- |
| kind              | `PURCHASE`       | operation `type: 'expense'`              |
| amount            | `3,900.00`       | `amount: '3900.00'`                      |
| currency          | `AMD`            | used to validate/match the account       |
| card mask         | `4083***7027`    | bound to an **account**                  |
| merchant          | `NAREK MEHRABYAN`| bound to a **category**                  |
| country           | `AM`             | kept as context (label / future use)     |
| date + time       | `28.06.2026 10:15`| `date: '2026-06-28'`                     |
| balance           | `133,719.97 AMD` | **ignored**                              |

## Agreed design decisions

These were chosen up front and drive the architecture:

1. **Processing model — auto-create when fully matched.** If the card resolves to
   an account *and* the merchant resolves to a category, the operation is created
   silently and the user is told. Anything not fully matched goes to a review
   queue. (Balances trust against control.)
2. **Card binding — field + learn-on-sight.** Accounts gain a `cardMask` field
   that can be set up front, *and* the first time an unknown card appears the user
   is asked which account it belongs to; the answer is written back to that field.
3. **Merchant binding — learn from first categorization.** When the user
   categorizes a merchant's first transaction, Penny remembers `merchant →
   category` and auto-applies it next time. Self-improving, zero setup.

## Architecture

```
                    ┌─────────────────────────────┐
  Android OS  ───►  │ PennyNotificationListener     │  (native, already exists)
  notifications     │ records {title,text,pkg,time} │
                    └──────────────┬────────────────┘
                                   │ getRecentNotifications()
                                   ▼
                    ┌─────────────────────────────┐
                    │ Ingestion (poll on foreground)│  ← round 3
                    └──────────────┬────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │ parseBankNotification()       │  ← round 1 (THIS ROUND)
                    │ pure: text → descriptor|null  │
                    └──────────────┬────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │ Resolver                      │  ← round 2
                    │ cardMask → account            │
                    │ merchant → category           │
                    └──────────────┬────────────────┘
                       fully matched │ unmatched
                          ▼          ▼
                  createOperation   pending review queue → user resolves,
                  (silent)          bindings learned, then createOperation
```

### Round 1 — Parser ✅

`app/services/notifications/parseBankNotification.js`

A pure function: `({ title, text, packageName, postTime }) → descriptor | null`.

```js
{
  kind: 'PURCHASE',
  type: 'expense',
  amount: '3900.00',   // normalized decimal string, grouping separators stripped
  currency: 'AMD',
  cardMask: '4083***7027',
  merchant: 'NAREK MEHRABYAN',
  country: 'AM',
  date: '2026-06-28',  // ISO, converted from DD.MM.YYYY
  time: '10:15',
  packageName: 'am.ameriabank.mobile',
  raw: '…original text…',
}
```

Key properties:

- **Pattern-based, not positional.** Each pipe segment is classified by shape
  (amount+currency, card mask, merchant, date/time, balance), so minor layout
  changes still parse and the `BALANCE:` segment is never mistaken for the amount.
- **Returns `null` for anything unrecognized**, so callers cheaply skip the flood
  of non-transaction notifications the listener also receives.
- **Extensible kinds.** A `KIND_TO_TYPE` table maps keywords to operation types;
  add `REFUND → income`, etc., without touching parsing logic.
- **No floats.** Amount stays a string end-to-end for the decimal currency layer.

Covered by `__tests__/services/notifications/parseBankNotification.test.js`
(canonical template, amount normalization, robustness, and rejection cases).

### Round 2 — Storage & resolver ✅

**Schema** (migration `drizzle/0010_bank_notifications.js`, schema in
`app/db/schema.js`):

- `accounts.cardMask TEXT NULL` — the card linked to this account.
- `notification_merchant_rules` — learned merchant → category rules:
  | column      | type    | notes                                   |
  | ----------- | ------- | --------------------------------------- |
  | `id`        | text PK | uuid                                    |
  | `merchant`  | text    | normalized merchant key (uppercased)    |
  | `packageName` | text NULL | scope rules per bank app when needed  |
  | `categoryId`| text FK | → categories.id                         |
  | `createdAt` / `updatedAt` | text | ISO timestamps             |
- `pending_notifications` — the review queue (parsed descriptor + best-effort
  account/category suggestions).

  > Alternative considered: store rules as a JSON blob in `appMetadata`. Rejected
  > — a real table gives indexed lookups and a clean "rules list" UI later.

  > **Migration note:** this project applies migrations through a custom path
  > (`app/services/db.js`), so adding a migration also requires updating
  > `isSchemaComplete` and `detectAppliedMigrations` there — done for 0010.

**DB services**: `app/services/NotificationRulesDB.js` (merchant-rule CRUD +
lookup) and `app/services/PendingNotificationsDB.js` (queue CRUD). Card lookups
live on `AccountsDB` (`getAccountByCardMask`, `setAccountCardMask`).

**Resolver** (`app/services/notifications/resolveNotification.js`):

- `resolveAccountId(descriptor)` — account whose `cardMask` matches; else a
  single currency-matching (non-hidden) account; else `null`.
- `resolveCategoryId(descriptor)` — learned `merchant` rule, else `null`.
- `resolveNotification(descriptor)` — both, plus a `fullyMatched` flag.

### Round 3 — Ingestion & pipeline ✅

`app/services/notifications/processBankNotifications.js`:

- `processBankNotifications()` reads `getRecentNotifications()`, de-dupes against
  a rolling set of signatures (`postTime + text hash`) persisted in preferences,
  parses + resolves each, and either `createOperation` (fully matched,
  description seeded with `merchant`) or enqueues a pending item. Emits
  `RELOAD_ALL` when operations are created. No-op when disabled.
- `resolvePendingNotification(id, choices)` — creates the operation from a
  reviewed item and learns the card → account and merchant → category bindings.
- Triggered on app open and on every foreground transition via an `AppState`
  listener in `app/screens/AppInitializer.js`.
- **Known limitation:** the native service keeps only the **last 5**
  notifications and is pull-only (no JS events). For lossless capture under
  bursty/backgrounded conditions, extend the Kotlin
  `PennyNotificationListenerService` to persist a durable queue (and optionally
  emit a JS event). The parser, resolver, and pipeline do not depend on this.

### Round 4 — UI ✅

- **Review queue** (`app/components/BankNotificationsContentPanel.js`, shown as a
  Settings subpanel): an enable toggle plus the pending list, each item with an
  account + category picker, Save and Dismiss. Saving calls
  `resolvePendingNotification`, which learns both bindings. Wired into
  `app/screens/SettingsScreen.js` as the `bankNotifications` subpanel.
- **Account editor** (`app/screens/AccountsScreen.js`): a "Card number" field,
  persisted through `AccountsActionsContext` → `AccountsDB`.
- **Settings**: a "Bank notifications" row opens the subpanel. (A standalone
  merchant-rules manager remains a future enhancement; rules are currently
  learned automatically and editable by re-categorizing.)

## Operation mapping

```js
createOperation({
  type: descriptor.type,          // 'expense'
  amount: descriptor.amount,      // '3900.00'
  accountId: resolvedAccountId,   // from cardMask
  categoryId: resolvedCategoryId, // from merchant rule, or null
  date: descriptor.date,          // '2026-06-28'
  description: serializeLabels([descriptor.merchant].filter(Boolean)),
});
```

Currency is used to validate the resolved account (warn on mismatch), not stored
on the operation directly. Balance is ignored.

## Privacy

All processing is on-device, consistent with the existing listener (nothing
leaves the phone). The `raw` text is retained only transiently for auditing a
pending item and is not exported.

## Existing infrastructure (for reference)

- `plugins/withNotificationListener.js` — Expo config plugin that installs the
  Android `NotificationListenerService`, a bridge module, and its package. Stores
  the latest 5 notifications (`{title, text, packageName, postTime}`) in private
  SharedPreferences.
- `app/services/NotificationAccess.js` — JS wrapper: `isNotificationAccessEnabled()`,
  `getRecentNotifications()`, `openNotificationAccessSettings()`.
- `app/components/NotificationsContentPanel.js` — current in-app viewer of recent
  notifications.
