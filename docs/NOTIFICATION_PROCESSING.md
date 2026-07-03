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

### Client-to-client transfers (`C2C`)

The same Ameria template also emits **C2C** notifications for transfers to
another person:

```
text: C2C | 19,200.00 AMD | 4083***7027, | TO: N. DORVANYAN | AMERIABANK API GATE, AM | 28.06.2026 16:23 | BALANCE: 106,819.97 AMD
```

C2C parses exactly like `PURCHASE` (also an `expense`), with two differences:

- The recipient segment carries a `TO:` / `FROM:` label, which is stripped so the
  counterparty name (`N. DORVANYAN`) becomes the `merchant`/description.
- **The category is never inferred and never learned.** A transfer to a friend
  can be for many different reasons (a loan, splitting a bill, a gift), so a
  single learned `merchant → category` rule would be wrong as often as right.
  C2C descriptors carry `requiresCategory: true`; they always land in the review
  queue with the category blank, and the user must pick one before saving. No
  merchant rule is stored, so the next transfer to the same person asks again.

### ATM cash withdrawals (`ATM CASH`) — transfers, not expenses

Ameria also emits an **ATM CASH** notification when the user withdraws cash:

```
text: ATM CASH | 200,000.00 AMD | 4083***7027, | ATM 401 REPUBLIC 67/1, AM | 01.07.2026 09:13 | BALANCE: 111,820.20 AMD
```

A withdrawal does not reduce net worth — the money moves from the card account
into physical cash — so it is booked as an operation `type: 'transfer'`, not an
expense. It therefore needs a **target account** (a "cash" account) instead of a
category:

- The parser maps `ATM CASH` to `type: 'transfer'` and flags the descriptor with
  `isTransfer: true` (see `TRANSFER_KINDS` / `kindIsTransfer` in
  `bankParsers/ameriabank.js`). The ATM location (`ATM 401 REPUBLIC 67/1`) becomes
  the operation's description.
- The destination is the account bound in the `BANK_NOTIFICATIONS_ATM_ACCOUNT`
  preference. **Bound on first sight:** the first ATM withdrawal lands in the
  review queue with a "To account" picker; saving it remembers the chosen account
  (and the card → source-account binding) so subsequent withdrawals auto-create a
  transfer silently.
- Auto-create fires only when the card resolves to a source account, a target cash
  account is bound, and the source is trusted (same learn-on-trust gate as
  purchases). Cross-currency withdrawals are converted at the current rate exactly
  like a manual multi-currency transfer (`amount` in source currency,
  `destinationAmount` in target currency, `exchangeRate` source→target); a missing
  rate routes to review instead of booking a wrong amount.

### Tinkoff / T-Bank (`com.idamob.tinkoff.android`) — a second bank, a new format

Tinkoff posts a different shape from Ameria's single pipe-delimited line: the
**merchant is the notification title** and the short Russian body carries the
kind, amount and account currency, followed by a balance line.

```
title: МегаФон
text:  Платеж на 1 000 ₽, счет RUB
       Баланс 39 000 ₽
```

| Template field    | Example        | Becomes                                  |
| ----------------- | -------------- | ---------------------------------------- |
| kind              | `Платеж`       | operation `type: 'expense'`              |
| amount            | `1 000`        | `amount: '1000'` (space grouping stripped) |
| account currency  | `счет RUB`     | `currency: 'RUB'` (account matching)     |
| merchant (title)  | `МегаФон`      | bound to a **category**                  |
| balance           | `Баланс 39 000 ₽` | **ignored**                           |

The parser lives in `app/services/notifications/bankParsers/tinkoff.js` and is
registered in `bankParsers/index.js`. Key differences from the Ameria parser,
each driven by the format:

- **Merchant comes from the title**, not the body.
- **No card mask** in this format, so account resolution relies on the single
  currency-matching account. The currency is read from the explicit ISO code in
  `счет RUB` (an unambiguous account signal), falling back to the amount's ₽/$/€
  symbol when absent.
- **The balance line is stripped first** so `39 000 ₽` can never be read as the
  transaction amount.
- **Russian numerics**: space thousands grouping (regular / non-breaking / narrow)
  and a comma decimal separator (`1 000,50`) are both normalized.
- **No date/time in the body**, so the ingestion layer falls back to the
  notification's post time.

Recognized kinds map to `expense` (`Покупка`, `Платеж`, `Оплата`, `Списание`) or
`income` (`Пополнение`, `Возврат`). Kinds needing their own layout or a target
account (`Перевод`, `Снятие`) are not yet handled — an unrecognized kind returns
`null` and the notification is skipped rather than mis-booked. Covered by
`__tests__/services/notifications/tinkoffParser.test.js`.

### Live auto-refresh

While the processing panel is open it re-runs the pipeline and reloads both the
review queue and the **Recent notifications** feed every 3 seconds
(`NotificationProcessingContentPanel`), so notifications captured while the panel
is visible surface on their own — no pull-to-refresh needed (that still works).
The refresh is silent (no spinner) and guarded so a slow run can't overlap the
next tick; pull-to-refresh keeps its own spinner. A newly-captured card fades and
slides into the feed (content-stable keys mean only genuinely new cards animate;
the initial batch appears at rest).

### Re-adding an already-processed notification

Each already-processed notification stays visible in the **Recent notifications**
feed. A bank-parseable card there shows a **Re-add operation** action that
re-runs the parse → resolve → book pipeline for just that notification
(`reAddNotification` in `processBankNotifications.js`), bypassing the
seen-signature dedup and the learn-on-trust gate (the user is explicitly asking
for it). It creates the operation when it fully resolves, or enqueues it for
review otherwise — useful after deleting the original operation or dismissing a
review item by mistake.

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

`app/services/notifications/parseBankNotification.js` (dispatcher) +
`app/services/notifications/bankParsers/` (per-app parsers).

**Parsing rules are grouped per source app.** Each banking app formats its
notifications differently, so each gets its own parser module registered against
its Android package name. Today only Ameriabank (`com.banqr.ameriabank`) is
supported — `bankParsers/ameriabank.js` holds the `PURCHASE` / `C2C` pipe-format
rules. Adding another bank is just another module in `bankParsers/`, registered
in `bankParsers/index.js`; nothing in the dispatcher changes.

`parseBankNotification(notification)` routes by `notification.packageName` to the
matching parser. When the package is unknown or missing (e.g. a manual paste),
it falls back to trying every registered parser — each returns `null` for formats
it doesn't handle, so the first that recognizes the text wins.

Each parser exposes a pure function:
`({ title, text, packageName, postTime }) → descriptor | null`.

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
- **Known limitation:** the native service keeps only the **last 20**
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

### App filters

The notification-processing page (`app/components/NotificationProcessingContentPanel.js`)
shows the review queue and the recent-notifications feed. Its header overflow menu
(three-dots → **Filters**) opens a nested **Filters** view
(`app/components/NotificationFiltersContentPanel.js`) that groups:

- **Notification access** (grant/manage the OS listener permission) and the
  **Process bank notifications** toggle — moved here from the main page.
- **App filters** — a checkbox per app. Every app is shown by default; unchecking
  one hides its notifications from the feed.

`app/services/notifications/notificationFilters.js` backs this with two persisted
lists in `appMetadata`:

- `NOTIFICATION_FILTER_KNOWN` — every package seen, merged with the shipped
  defaults (`com.banq.ameriabank`, `com.android.systemui`,
  `org.telegram.messenger`) so the list is never empty and stays stable even as
  apps age out of the native rolling window.
- `NOTIFICATION_FILTER_HIDDEN` — packages the user unchecked. An app is visible
  iff it is not in this set, so new/unknown apps default to visible.

The filter is display-only: it curates the feed, while the auto-create path keeps
its own source allowlist (learn-on-trust) for safety.

## Safety hardening (from code review)

The money-writing path is guarded against several failure modes:

- **Currency gate** — auto-create requires the resolved account's currency to
  equal the notification's. A foreign-currency purchase on a bound card resolves
  the account but is routed to the review queue, never booked in the wrong
  currency.
- **Source allowlist (learn-on-trust)** — auto-create only fires for packages the
  user has previously resolved from the queue (`BANK_NOTIFICATIONS_PACKAGES`).
  An unknown or forged source can at most create a *pending* item the user must
  approve; it can never silently book money.
- **Never-null date** — `operations.date` is NOT NULL, so a missing/invalid date
  falls back to the notification's post-time date, then today — both in the
  pipeline and when resolving a pending item.
- **Concurrency guard** — overlapping `processBankNotifications` runs (foreground
  listener + panel) share a single in-flight run, so an operation can't be
  double-created.
- **Card single-ownership** — binding a card mask clears it from any other
  account, and lookups are deterministically ordered, so a card can't be
  mis-booked to an arbitrary account.
- **Amount/date parsing** — the parser handles both `1,234.56` and `1.234,56`
  decimal conventions and rejects impossible calendar dates.
- **Backup/restore** — `accounts.card_mask`, `accounts.auto_txn_rounding`, and the
  learned `notification_merchant_rules` are included in JSON/CSV/SQLite backup and
  restore (the transient `pending_notifications` queue is intentionally not).
- **i18n** — the new strings exist in all 11 locale files.

### Automatic-transaction rounding

Accounts have an optional `auto_txn_rounding` setting (10, 100, or 1000; null/0 =
off). When set, the amount of an operation **auto-created** from a notification is
rounded to the nearest multiple of the step, with ties rounded up — e.g. with step
100, `1216 → 1200` and `150 → 200`; with step 1000, `2500 → 3000`. Only the booked
`amount` (in the account currency) is rounded; on a currency mismatch the rounding
is applied to the converted amount while the preserved foreign `destination_amount`
keeps the original charged value. Rounding applies only to the silent auto-create
path — items resolved manually from the review queue are booked as-is.

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
  the latest 20 notifications (`{title, text, packageName, postTime}`) in private
  SharedPreferences.
- `app/services/NotificationAccess.js` — JS wrapper: `isNotificationAccessEnabled()`,
  `getRecentNotifications()`, `openNotificationAccessSettings()`.
- `app/components/NotificationsContentPanel.js` — current in-app viewer of recent
  notifications.
