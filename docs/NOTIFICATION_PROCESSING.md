# Bank Notification Processing

Turn incoming bank push notifications into Penny operations automatically.

This document describes the full design. The first implementation round ships
**only the parser** (`app/services/notifications/parseBankNotification.js` + tests)
— the safe, self-contained core. The remaining sections are the agreed plan for
subsequent rounds.

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

### Round 1 — Parser (this round) ✅

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

### Round 2 — Storage & resolver

**Schema changes** (Drizzle migration):

- `accounts.cardMask TEXT NULL` — the card linked to this account.
- New table `notificationMerchantRules`:
  | column      | type    | notes                                   |
  | ----------- | ------- | --------------------------------------- |
  | `id`        | text PK | uuid                                    |
  | `merchant`  | text    | normalized merchant key (uppercased)    |
  | `packageName` | text NULL | scope rules per bank app when needed  |
  | `categoryId`| text FK | → categories.id                         |
  | `createdAt` / `updatedAt` | text | ISO timestamps             |

  > Alternative considered: store rules as a JSON blob in `appMetadata`. Rejected
  > — a real table gives indexed lookups and a clean "rules list" UI later.

**Resolver** (`app/services/notifications/resolveNotification.js`):

- `resolveAccount(descriptor)` — find the account whose `cardMask` matches; fall
  back to a single account matching the currency; else `null` (needs the user).
- `resolveCategory(descriptor)` — look up `merchant` in
  `notificationMerchantRules`; else `null`.
- `learnMerchantRule(merchant, categoryId, packageName)` — upsert after the user
  categorizes.
- `learnCardMask(cardMask, accountId)` — write the mask onto the account.

### Round 3 — Ingestion & pipeline

- Poll `getRecentNotifications()` when the app comes to the foreground; de-dupe
  against already-processed notifications (track by `postTime + raw` hash in
  `appMetadata` or a small `processedNotifications` table).
- For each parsed descriptor: resolve → if fully matched, `createOperation`
  (description seeded with `merchant` as a label, plus `country` context); else
  enqueue into a `pendingNotifications` table.
- **Known limitation to address here:** the native service currently keeps only
  the **last 5** notifications and exposes them pull-only (no JS events). For
  reliable capture, extend the Kotlin `PennyNotificationListenerService` to
  persist a durable queue (and optionally emit a JS event) so bursts aren't lost
  while the app is backgrounded. The parser and resolver do not depend on this.

### Round 4 — UI

- **Review queue**: a pending-notifications list (subpanel pattern per
  `CLAUDE.md`) where the user confirms/edits the account, category, amount, and
  date before saving. Categorizing here triggers `learnMerchantRule`; picking an
  account for an unknown card triggers `learnCardMask`.
- **Account editor**: a "Card mask" field.
- **Settings**: enable/disable auto-processing; (later) a merchant-rules manager.

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
