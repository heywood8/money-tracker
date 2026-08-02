/**
 * Tests for the custom-template cache and its effect on the parser dispatcher.
 *
 * Two things are load-bearing here and both are easy to break silently:
 *   1. the cache must be populated before anything parses, because an empty
 *      cache looks exactly like "the user's template doesn't work";
 *   2. every write must refresh it, or a saved template does nothing until the
 *      app restarts.
 */

import * as NotificationTemplatesDB from '../../../app/services/NotificationTemplatesDB';
import {
  __resetCustomTemplatesCache,
  areCustomTemplatesLoaded,
  deleteCustomTemplate,
  ensureCustomTemplatesLoaded,
  findTemplateByKind,
  getCachedTemplates,
  parseWithCustomTemplates,
  reloadCustomTemplates,
  saveCustomTemplate,
  setCustomTemplateEnabled,
} from '../../../app/services/notifications/customTemplates';
import {
  parseBankNotification,
  kindIsTransfer,
  kindRequiresCategory,
} from '../../../app/services/notifications/parseBankNotification';

jest.mock('../../../app/services/NotificationTemplatesDB');

/** A template that reads "Оплата 500 AMD в MAGAZIN". */
const makeTemplate = (overrides = {}) => ({
  id: 'tpl-1',
  name: 'Shop payment',
  packageName: 'com.example.bank',
  type: 'expense',
  enabled: true,
  priority: 0,
  categoryId: null,
  currency: null,
  dateOrder: 'dmy',
  triggers: ['Оплата'],
  sample: { title: '', text: 'Оплата 500 AMD в MAGAZIN' },
  fields: {
    amount: { source: 'text', kind: 'amount', before: 'Оплата ', after: ' ', value: '500', occurrence: 0 },
    currency: { source: 'text', kind: 'currency', before: '500 ', after: '', value: 'AMD', occurrence: 0 },
    merchant: { source: 'text', kind: 'merchant', before: 'в ', after: '', value: 'MAGAZIN', occurrence: 0 },
  },
  ...overrides,
});

const NOTIFICATION = { text: 'Оплата 500 AMD в MAGAZIN', packageName: 'com.example.bank' };

beforeEach(() => {
  jest.clearAllMocks();
  __resetCustomTemplatesCache();
  NotificationTemplatesDB.getAllTemplates.mockResolvedValue([makeTemplate()]);
});

describe('the cache', () => {
  it('starts empty and reports itself as not loaded', () => {
    expect(getCachedTemplates()).toEqual([]);
    expect(areCustomTemplatesLoaded()).toBe(false);
  });

  it('loads once and then stops querying', async () => {
    await ensureCustomTemplatesLoaded();
    await ensureCustomTemplatesLoaded();
    expect(NotificationTemplatesDB.getAllTemplates).toHaveBeenCalledTimes(1);
    expect(areCustomTemplatesLoaded()).toBe(true);
  });

  it('shares one query between concurrent callers', async () => {
    await Promise.all([
      ensureCustomTemplatesLoaded(),
      ensureCustomTemplatesLoaded(),
      ensureCustomTemplatesLoaded(),
    ]);
    expect(NotificationTemplatesDB.getAllTemplates).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed load instead of caching emptiness', async () => {
    NotificationTemplatesDB.getAllTemplates.mockRejectedValueOnce(new Error('db down'));
    await ensureCustomTemplatesLoaded();
    expect(areCustomTemplatesLoaded()).toBe(false);

    await ensureCustomTemplatesLoaded();
    expect(NotificationTemplatesDB.getAllTemplates).toHaveBeenCalledTimes(2);
    expect(getCachedTemplates()).toHaveLength(1);
  });

  it('keeps the previous templates when a later reload fails', async () => {
    await ensureCustomTemplatesLoaded();
    NotificationTemplatesDB.getAllTemplates.mockRejectedValueOnce(new Error('db down'));
    await reloadCustomTemplates();
    expect(getCachedTemplates()).toHaveLength(1);
  });
});

describe('writes refresh the cache', () => {
  it('re-reads after a save', async () => {
    NotificationTemplatesDB.saveTemplate.mockResolvedValue(makeTemplate());
    await saveCustomTemplate(makeTemplate());
    expect(NotificationTemplatesDB.getAllTemplates).toHaveBeenCalled();
    expect(getCachedTemplates()).toHaveLength(1);
  });

  it('re-reads after a delete', async () => {
    NotificationTemplatesDB.deleteTemplate.mockResolvedValue(undefined);
    NotificationTemplatesDB.getAllTemplates.mockResolvedValue([]);
    await deleteCustomTemplate('tpl-1');
    expect(getCachedTemplates()).toEqual([]);
  });

  it('re-reads after a toggle', async () => {
    NotificationTemplatesDB.setTemplateEnabled.mockResolvedValue(undefined);
    NotificationTemplatesDB.getAllTemplates.mockResolvedValue([makeTemplate({ enabled: false })]);
    await setCustomTemplateEnabled('tpl-1', false);
    expect(getCachedTemplates()[0].enabled).toBe(false);
  });
});

describe('parseWithCustomTemplates', () => {
  it('parses nothing while the cache is empty', () => {
    expect(parseWithCustomTemplates(NOTIFICATION)).toBeNull();
  });

  it('parses once the cache is loaded', async () => {
    await ensureCustomTemplatesLoaded();
    expect(parseWithCustomTemplates(NOTIFICATION)).toMatchObject({
      kind: 'Shop payment', amount: '500', currency: 'AMD', merchant: 'MAGAZIN', type: 'expense',
    });
  });

  it('skips a disabled template', async () => {
    NotificationTemplatesDB.getAllTemplates.mockResolvedValue([makeTemplate({ enabled: false })]);
    await ensureCustomTemplatesLoaded();
    expect(parseWithCustomTemplates(NOTIFICATION)).toBeNull();
  });

  it('takes the first template that claims the notification', async () => {
    NotificationTemplatesDB.getAllTemplates.mockResolvedValue([
      makeTemplate({ id: 'a', name: 'First' }),
      makeTemplate({ id: 'b', name: 'Second' }),
    ]);
    await ensureCustomTemplatesLoaded();
    expect(parseWithCustomTemplates(NOTIFICATION).kind).toBe('First');
  });
});

describe('the dispatcher', () => {
  it('prefers a user template over the built-in parser for the same app', async () => {
    const ameriaText =
      'PURCHASE | 3,900.00 AMD | 4083***7027, | GURMAN, AM | 28.06.2026 10:15 | BALANCE: 1.00 AMD';
    NotificationTemplatesDB.getAllTemplates.mockResolvedValue([makeTemplate({
      name: 'My Ameria rule',
      packageName: 'com.banqr.ameriabank',
      triggers: ['PURCHASE'],
      fields: {
        amount: {
          source: 'text', kind: 'amount', before: '| ', after: ' AMD', value: '3,900.00', occurrence: 0,
        },
      },
      currency: 'AMD',
    })]);
    await ensureCustomTemplatesLoaded();

    const result = parseBankNotification({
      text: ameriaText, packageName: 'com.banqr.ameriabank',
    });
    expect(result.kind).toBe('My Ameria rule');
  });

  it('falls through to the built-in parser when no template claims it', async () => {
    await ensureCustomTemplatesLoaded();
    const result = parseBankNotification({
      text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | GURMAN, AM | 28.06.2026 10:15',
      packageName: 'com.banqr.ameriabank',
    });
    expect(result.kind).toBe('PURCHASE');
  });

  it('reads a title-only notification, which the built-in parsers cannot', async () => {
    NotificationTemplatesDB.getAllTemplates.mockResolvedValue([makeTemplate({
      packageName: 'com.example.titleonly',
      triggers: [],
      currency: 'USD',
      fields: {
        amount: { source: 'title', kind: 'amount', before: 'Paid ', after: '', value: '12', occurrence: 0 },
      },
    })]);
    await ensureCustomTemplatesLoaded();
    expect(parseBankNotification({ title: 'Paid 12', packageName: 'com.example.titleonly' }))
      .toMatchObject({ amount: '12', currency: 'USD' });
  });

  it('still returns null for a notification nothing understands', async () => {
    await ensureCustomTemplatesLoaded();
    expect(parseBankNotification({ text: 'Your package has shipped', packageName: 'com.post' }))
      .toBeNull();
  });
});

describe('per-kind helpers', () => {
  beforeEach(async () => {
    await ensureCustomTemplatesLoaded();
  });

  it('finds a template by the kind a queued row carries', () => {
    expect(findTemplateByKind('shop payment', 'com.example.bank').id).toBe('tpl-1');
  });

  it('does not confuse two apps that name a template the same', () => {
    expect(findTemplateByKind('Shop payment', 'com.other.app')).toBeNull();
  });

  it('never forces a manual category for a template kind', () => {
    expect(kindRequiresCategory('Shop payment', 'com.example.bank')).toBe(false);
  });

  it('never treats a template kind as a transfer', () => {
    expect(kindIsTransfer('Shop payment', 'com.example.bank')).toBe(false);
  });

  it('leaves the built-in kinds alone', () => {
    expect(kindRequiresCategory('C2C', 'com.banqr.ameriabank')).toBe(true);
    expect(kindIsTransfer('ATM CASH', 'com.banqr.ameriabank')).toBe(true);
  });
});
