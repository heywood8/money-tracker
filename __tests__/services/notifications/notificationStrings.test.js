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

  it('puts the amount and payee of a single operation in the title', async () => {
    const copy = await getAddedAlertCopy(1, [detail()]);
    const [added, recognized] = copy.body.split('\n');

    expect(copy.title).toBe('1299 AMD · Sas');
    expect(added).toBe(enJson.bank_notifications_bg_added_body_one);
    expect(recognized).toContain('Account: Main card');
    expect(recognized).toContain('Category: Groceries');
  });

  it('names the cash account a transfer landed in', async () => {
    const copy = await getAddedAlertCopy(1, [
      detail({ type: 'transfer', categoryName: null, targetAccountName: 'Cash', merchant: 'Atm 401' }),
    ]);

    expect(copy.body).toContain('To: Cash');
    expect(copy.body).not.toContain('Category:');
  });

  it('translates a built-in category name key', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ categoryName: null, categoryNameKey: 'food' })]);

    expect(copy.body).toContain(`Category: ${enJson.food}`);
  });

  it('names an unknown payee', async () => {
    const copy = await getAddedAlertCopy(1, [detail({ merchant: null })]);

    expect(copy.title).toBe(`1299 AMD · ${enJson.bank_notifications_bg_unknown_merchant}`);
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

    const copy = await getAddedAlertCopy(1, [detail()]);

    expect(copy.body).toContain(ruJson.bank_notifications_bg_added_body_one);
    expect(copy.body).toContain('Счёт: Main card');
  });
});
