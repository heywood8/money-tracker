/**
 * Tests for the headless localized copy used by the background alert. Verifies
 * language resolution, English fallback, and singular/plural + {count}
 * interpolation.
 */

import enJson from '../../../assets/i18n/en.json';
import ruJson from '../../../assets/i18n/ru.json';
import * as PreferencesDB from '../../../app/services/PreferencesDB';
import { getPendingAlertCopy } from '../../../app/services/notifications/notificationStrings';

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
});
