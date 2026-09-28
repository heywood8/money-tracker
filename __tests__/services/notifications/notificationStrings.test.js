/**
 * Tests for the headless localized copy used by the background alert. Verifies
 * language resolution, English fallback, and singular/plural + {count}
 * interpolation.
 */

import enJson from '../../../assets/i18n/en.json';
import ruJson from '../../../assets/i18n/ru.json';
import * as PreferencesDB from '../../../app/services/PreferencesDB';
import {
  getAddedAlertCopy,
  getPendingAlertCopy,
  isSingleItemAlert,
} from '../../../app/services/notifications/notificationStrings';

jest.mock('../../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { LANGUAGE: 'app_language' },
  getPreference: jest.fn(),
}));

describe('notificationStrings.getPendingAlertCopy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PreferencesDB.getPreference.mockResolvedValue(null); // default → en
  });

  it('uses English by default with the plural body and interpolated count', async () => {
    const copy = await getPendingAlertCopy(2);
    expect(copy.title).toBe(enJson.bank_notifications_bg_notification_title);
    expect(copy.body).toBe(
      enJson.bank_notifications_bg_notification_body_other.replace('{count}', '2'),
    );
    expect(copy.channelName).toBe(enJson.bank_notifications_channel_name);
    expect(copy.body).toContain('2');
  });

  it('carries the localized labels for both action buttons', async () => {
    const english = await getPendingAlertCopy(2);
    expect(english.rejectLabel).toBe(enJson.bank_notifications_bg_reject);
    expect(english.selectLabel).toBe(enJson.bank_notifications_bg_select);

    PreferencesDB.getPreference.mockResolvedValue('ru');
    const russian = await getPendingAlertCopy(1, [
      { id: 'p1', amount: '8074', currency: 'AMD', merchant: 'SAS', missing: 'category' },
    ]);
    expect(russian.rejectLabel).toBe(ruJson.bank_notifications_bg_reject);
    expect(russian.selectLabel).toBe(ruJson.bank_notifications_bg_select);
  });

  it('uses the singular body for a count of 1', async () => {
    const copy = await getPendingAlertCopy(1);
    expect(copy.body).toBe(enJson.bank_notifications_bg_notification_body_one);
  });

  it('treats a zero / invalid count as singular', async () => {
    await expect((await getPendingAlertCopy(0)).body).toBe(
      enJson.bank_notifications_bg_notification_body_one,
    );
    await expect((await getPendingAlertCopy(undefined)).body).toBe(
      enJson.bank_notifications_bg_notification_body_one,
    );
  });

  it('resolves the stored language', async () => {
    PreferencesDB.getPreference.mockResolvedValue('ru');
    const copy = await getPendingAlertCopy(3);
    expect(copy.title).toBe(ruJson.bank_notifications_bg_notification_title);
    expect(copy.body).toBe(
      ruJson.bank_notifications_bg_notification_body_other.replace('{count}', '3'),
    );
  });

  // The app picks only between "one" and "other", but Russian has three
  // forms: "3 операций ожидают" was ungrammatical. The Russian copy is worded
  // so that any count reads correctly.
  it('reads grammatically in Russian for any count', async () => {
    PreferencesDB.getPreference.mockResolvedValue('ru');
    for (const count of [2, 3, 5, 21, 22, 25, 101]) {
      const copy = await getPendingAlertCopy(count);
      expect(copy.body).toBe(`Ожидают добавления: ${count}`);
    }
  });

  it('falls back to English for an unknown language', async () => {
    PreferencesDB.getPreference.mockResolvedValue('xx');
    const copy = await getPendingAlertCopy(2);
    expect(copy.title).toBe(enJson.bank_notifications_bg_notification_title);
  });

  it('falls back to English when the preference read fails', async () => {
    PreferencesDB.getPreference.mockRejectedValue(new Error('db down'));
    const copy = await getPendingAlertCopy(2);
    expect(copy.title).toBe(enJson.bank_notifications_bg_notification_title);
  });

  describe('with item details', () => {
    const detail = (overrides = {}) => ({
      type: 'expense',
      amount: '1299.00',
      currency: 'AMD',
      merchant: 'SAS SUPERMARKET',
      cardMask: '4083***7027',
      date: '2026-07-20',
      accountName: 'Main card',
      categoryName: 'Groceries',
      categoryNameKey: null,
      missing: 'category',
      ...overrides,
    });

    it('puts the amount and payee of a single item in the title', async () => {
      const copy = await getPendingAlertCopy(1, [detail()]);

      expect(copy.title).toBe('1299 AMD · SAS SUPERMARKET');
    });

    it('lists what was recognized and what is missing for a single item', async () => {
      const copy = await getPendingAlertCopy(1, [detail({ categoryName: null })]);
      const [recognized, needs] = copy.body.split('\n');

      expect(recognized).toContain('4083***7027');
      expect(recognized).toContain('Account: Main card');
      expect(recognized).not.toContain('Category:');
      expect(needs).toBe(enJson.bank_notifications_bg_needs_category);
    });

    it('shows the resolved category and asks only for confirmation', async () => {
      const copy = await getPendingAlertCopy(1, [detail({ missing: null })]);

      expect(copy.body).toContain('Category: Groceries');
      expect(copy.body).toContain(enJson.bank_notifications_bg_needs_confirm);
    });

    it('translates a built-in category name key', async () => {
      const copy = await getPendingAlertCopy(1, [
        detail({ categoryName: null, categoryNameKey: 'food' }),
      ]);

      expect(copy.body).toContain(`Category: ${enJson.food}`);
    });

    it('names an unknown payee', async () => {
      const copy = await getPendingAlertCopy(1, [detail({ merchant: null })]);

      expect(copy.title).toBe(`1299 AMD · ${enJson.bank_notifications_bg_unknown_merchant}`);
    });

    it('gives each item a line when several are described', async () => {
      const copy = await getPendingAlertCopy(2, [
        detail(),
        detail({ merchant: 'ATM', missing: 'account_target', amount: '20000.00' }),
      ]);
      const lines = copy.body.split('\n');

      expect(copy.title).toBe(
        enJson.bank_notifications_bg_notification_body_other.replace('{count}', '2'),
      );
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(
        `1299 AMD · SAS SUPERMARKET — ${enJson.bank_notifications_bg_needs_category}`,
      );
      expect(lines[1]).toBe(
        `20000 AMD · ATM — ${enJson.bank_notifications_bg_needs_account_target}`,
      );
    });

    it('collapses the undescribed remainder into a "+N more" line', async () => {
      const copy = await getPendingAlertCopy(5, [detail(), detail(), detail()]);
      const lines = copy.body.split('\n');

      expect(lines).toHaveLength(4);
      expect(lines[3]).toBe(
        enJson.bank_notifications_bg_notification_more.replace('{count}', '2'),
      );
    });

    it('keeps the count-only copy when no details are available', async () => {
      const copy = await getPendingAlertCopy(3, []);

      expect(copy.title).toBe(enJson.bank_notifications_bg_notification_title);
      expect(copy.body).toBe(
        enJson.bank_notifications_bg_notification_body_other.replace('{count}', '3'),
      );
    });

    it('localizes the detail lines', async () => {
      PreferencesDB.getPreference.mockResolvedValue('ru');

      const copy = await getPendingAlertCopy(1, [detail()]);

      expect(copy.body).toContain(ruJson.bank_notifications_bg_needs_category);
      expect(copy.body).toContain('Счёт: Main card');
    });

    it('does not stack a stale detail list against a larger queue count', async () => {
      // One described item but three waiting: the title must stay the count line.
      const copy = await getPendingAlertCopy(3, [detail()]);

      expect(copy.title).toBe(
        enJson.bank_notifications_bg_notification_body_other.replace('{count}', '3'),
      );
    });
  });
});

describe('notificationStrings.getAddedAlertCopy', () => {
  const detail = (overrides = {}) => ({
    type: 'expense',
    amount: '1299.00',
    currency: 'AMD',
    merchant: 'Sas',
    date: '2026-07-20',
    accountName: 'Main card',
    accountBalance: '48800.00',
    accountCurrency: 'AMD',
    categoryName: 'Groceries',
    categoryNameKey: null,
    targetAccountName: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    PreferencesDB.getPreference.mockResolvedValue(null); // default → en
  });

  it('falls back to a count-only receipt with no details', async () => {
    const copy = await getAddedAlertCopy(2);

    expect(copy.title).toBe(enJson.bank_notifications_bg_added_title);
    expect(copy.body).toBe(
      enJson.bank_notifications_bg_added_body_other.replace('{count}', '2'),
    );
    expect(copy.channelName).toBe(enJson.bank_notifications_channel_name);
  });

  it('treats a zero / invalid count as singular', async () => {
    expect((await getAddedAlertCopy(0)).body).toBe(enJson.bank_notifications_bg_added_body_one);
    expect((await getAddedAlertCopy(undefined)).body).toBe(
      enJson.bank_notifications_bg_added_body_one,
    );
  });

  it('fits amount, payee and category into the title of a single operation', async () => {
    const copy = await getAddedAlertCopy(1, [detail()]);

    expect(copy.title).toBe('1299 AMD · Sas · Groceries');
  });

  it('puts the account and its balance on the only body line', async () => {
    const copy = await getAddedAlertCopy(1, [detail()]);

    expect(copy.body).toBe('Main card · balance 48,800 AMD');
  });

  it('drops the "added automatically" line and the date from a single receipt', async () => {
    const copy = await getAddedAlertCopy(1, [detail()]);

    expect(copy.body).not.toContain(enJson.bank_notifications_bg_added_body_one);
    expect(`${copy.title}\n${copy.body}`).not.toContain('Jul 20');
    expect(copy.body.split('\n')).toHaveLength(1);
  });

  it('keeps the minor units of a balance in a currency that has them', async () => {
    const copy = await getAddedAlertCopy(1, [
      detail({ accountBalance: '-1234.5', accountCurrency: 'USD' }),
    ]);

    expect(copy.body).toBe('Main card · balance -1,234.50 USD');
  });

  it('shows just the account when the balance was withheld', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ accountBalance: null })]);

    expect(copy.body).toBe('Main card');
  });

  it('leaves the body empty when the account could not be named', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ accountName: null })]);

    expect(copy.title).toBe('1299 AMD · Sas · Groceries');
    expect(copy.body).toBe('');
  });

  it('inserts an account name as written, even one that looks like a placeholder', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ accountName: '{balance} $& card' })]);

    expect(copy.body).toBe('{balance} $& card · balance 48,800 AMD');
  });

  it('names the cash account a transfer landed in', async () => {
    const copy = await getAddedAlertCopy(1, [
      detail({ type: 'transfer', categoryName: null, targetAccountName: 'Cash', merchant: 'Atm 401' }),
    ]);

    expect(copy.title).toBe('1299 AMD · Atm 401 · To: Cash');
    expect(copy.body).toBe('Main card · balance 48,800 AMD');
  });

  it('inserts a transfer target as written, even one with replacement patterns', async () => {
    const copy = await getAddedAlertCopy(1, [
      detail({ type: 'transfer', categoryName: null, targetAccountName: "Cash $& $' wallet", merchant: 'Atm 401' }),
    ]);

    expect(copy.title).toBe("1299 AMD · Atm 401 · To: Cash $& $' wallet");
  });

  it('does not repeat a category that only echoes the payee', async () => {
    const copy = await getAddedAlertCopy(1, [
      detail({ merchant: 'Pharmacy', categoryName: 'pharmacy ' }),
    ]);

    expect(copy.title).toBe('1299 AMD · Pharmacy');
  });

  it('keeps the title at amount · payee when nothing resolved where it landed', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ categoryName: null })]);

    expect(copy.title).toBe('1299 AMD · Sas');
  });

  it('translates a built-in category name key', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ categoryName: null, categoryNameKey: 'food' })]);

    expect(copy.title).toBe(`1299 AMD · Sas · ${enJson.food}`);
  });

  it('names an unknown payee', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ merchant: null })]);

    expect(copy.title).toBe(`1299 AMD · ${enJson.bank_notifications_bg_unknown_merchant} · Groceries`);
  });

  it('gives each operation a line with where it landed when several were booked', async () => {
    const copy = await getAddedAlertCopy(2, [
      detail(),
      detail({ type: 'transfer', merchant: 'Atm 401', amount: '20000.00', categoryName: null, targetAccountName: 'Cash' }),
    ]);
    const lines = copy.body.split('\n');

    expect(copy.title).toBe(
      enJson.bank_notifications_bg_added_body_other.replace('{count}', '2'),
    );
    expect(lines).toEqual([
      '1299 AMD · Sas — Category: Groceries',
      '20000 AMD · Atm 401 — To: Cash',
    ]);
  });

  it('falls back to the account when an operation has no category', async () => {
    const copy = await getAddedAlertCopy(2, [
      detail({ categoryName: null, categoryNameKey: null }),
      detail(),
    ]);

    expect(copy.body.split('\n')[0]).toBe('1299 AMD · Sas — Account: Main card');
  });

  it('collapses the undescribed remainder into a "+N more" line', async () => {
    const copy = await getAddedAlertCopy(5, [detail(), detail(), detail()]);
    const lines = copy.body.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe(enJson.bank_notifications_bg_notification_more.replace('{count}', '2'));
  });

  it('localizes the receipt', async () => {
    PreferencesDB.getPreference.mockResolvedValue('ru');

    const copy = await getAddedAlertCopy(1, [detail({ categoryName: null, categoryNameKey: 'food' })]);

    expect(copy.title).toBe(`1299 AMD · Sas · ${ruJson.food}`);
    // Russian groups thousands with a (narrow) no-break space.
    expect(copy.body).toMatch(/^Main card · остаток 48\s800 AMD$/);
    expect(copy.body).not.toContain(ruJson.bank_notifications_bg_added_body_one);
  });

  it('carries the acknowledge button label in every shape', async () => {
    const label = enJson.bank_notifications_bg_added_acknowledge;

    expect((await getAddedAlertCopy(2)).actionLabel).toBe(label); // count-only
    expect((await getAddedAlertCopy(1, [detail()])).actionLabel).toBe(label); // single
    expect((await getAddedAlertCopy(2, [detail(), detail()])).actionLabel).toBe(label); // list
  });

  it('localizes the acknowledge button label', async () => {
    PreferencesDB.getPreference.mockResolvedValue('ru');

    const copy = await getAddedAlertCopy(1, [detail()]);

    expect(copy.actionLabel).toBe(ruJson.bank_notifications_bg_added_acknowledge);
  });

  it('carries the change-category button label in every shape', async () => {
    // The copy layer always supplies it; whether the receipt shows the button is
    // the presenter's call (only a single categorizable booking can).
    const label = enJson.bank_notifications_bg_added_change_category;

    expect((await getAddedAlertCopy(2)).changeCategoryLabel).toBe(label); // count-only
    expect((await getAddedAlertCopy(1, [detail()])).changeCategoryLabel).toBe(label); // single
    expect((await getAddedAlertCopy(2, [detail(), detail()])).changeCategoryLabel).toBe(label);
  });

  it('localizes the change-category button label', async () => {
    PreferencesDB.getPreference.mockResolvedValue('ru');

    const copy = await getAddedAlertCopy(1, [detail()]);

    expect(copy.changeCategoryLabel).toBe(ruJson.bank_notifications_bg_added_change_category);
  });
});

describe('notificationStrings.isSingleItemAlert', () => {
  const detail = { id: 'p1', amount: '8074', currency: 'AMD', merchant: 'SAS' };

  it('is true only when one described item is the whole queue', () => {
    expect(isSingleItemAlert(1, [detail])).toBe(true);
  });

  it('is false when the queue holds more than the alert describes', () => {
    // The copy is a summary then, and so must the buttons be.
    expect(isSingleItemAlert(3, [detail])).toBe(false);
    expect(isSingleItemAlert(2, [detail, detail])).toBe(false);
  });

  it('is false without describable items', () => {
    expect(isSingleItemAlert(1)).toBe(false);
    expect(isSingleItemAlert(1, [])).toBe(false);
    expect(isSingleItemAlert(1, [null])).toBe(false);
    expect(isSingleItemAlert(1, 'nonsense')).toBe(false);
  });
});
