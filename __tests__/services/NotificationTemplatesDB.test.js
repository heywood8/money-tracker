/**
 * Tests for NotificationTemplatesDB — storage for user-defined parse templates.
 *
 * The emphasis is on what crosses the JSON boundary. A template row is read
 * inside a synchronous render on every notification card, so a corrupt or
 * partially-restored row has to degrade to "this template matches nothing"
 * rather than throw where nothing can catch it.
 */

import * as NotificationTemplatesDB from '../../app/services/NotificationTemplatesDB';
import { executeQuery, queryAll, queryFirst } from '../../app/services/db';

jest.mock('../../app/services/db');

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

const AMOUNT_RULE = {
  source: 'text', kind: 'amount', before: 'на ', after: ' ₽', value: '1 000', occurrence: 0,
};

/** A stored row as SQLite would hand it back. */
const row = (overrides = {}) => ({
  id: 'tpl-1',
  name: 'Payment',
  package_name: 'com.example.bank',
  type: 'expense',
  enabled: 1,
  priority: 0,
  category_id: null,
  currency: 'RUB',
  date_order: 'dmy',
  fields: JSON.stringify({ amount: AMOUNT_RULE }),
  triggers: JSON.stringify(['Платеж']),
  sample_title: 'МегаФон',
  sample_text: 'Платеж на 1 000 ₽',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUuidCounter = 0;
  queryAll.mockResolvedValue([]);
  queryFirst.mockResolvedValue(null);
  executeQuery.mockResolvedValue(undefined);
});

describe('getAllTemplates', () => {
  it('maps a stored row into the shape the engine expects', async () => {
    queryAll.mockResolvedValue([row()]);
    const [template] = await NotificationTemplatesDB.getAllTemplates();
    expect(template).toMatchObject({
      id: 'tpl-1',
      name: 'Payment',
      packageName: 'com.example.bank',
      type: 'expense',
      enabled: true,
      currency: 'RUB',
      dateOrder: 'dmy',
      triggers: ['Платеж'],
      sample: { title: 'МегаФон', text: 'Платеж на 1 000 ₽' },
    });
    expect(template.fields.amount).toMatchObject(AMOUNT_RULE);
  });

  it('orders by priority so a specific template can outrank a broad one', async () => {
    await NotificationTemplatesDB.getAllTemplates();
    expect(queryAll).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY priority ASC, created_at ASC'),
    );
  });

  it('reads enabled=0 as off and anything else as on', async () => {
    queryAll.mockResolvedValue([row({ enabled: 0 }), row({ id: 'b', enabled: null })]);
    const [off, restored] = await NotificationTemplatesDB.getAllTemplates();
    expect(off.enabled).toBe(false);
    // A NULL from a partial restore fails open — the user's template works.
    expect(restored.enabled).toBe(true);
  });

  describe('defensive parsing', () => {
    it('survives unparseable JSON columns', async () => {
      queryAll.mockResolvedValue([row({ fields: '{not json', triggers: 'also not json' })]);
      const [template] = await NotificationTemplatesDB.getAllTemplates();
      expect(template.fields).toEqual({});
      expect(template.triggers).toEqual([]);
    });

    it('drops field rules that are not usable rules', async () => {
      queryAll.mockResolvedValue([row({
        fields: JSON.stringify({
          amount: AMOUNT_RULE,
          merchant: 'not an object',
          nonsense: { before: 'x', after: 'y' },
          card: { value: 'no anchors at all' },
        }),
      })]);
      const [template] = await NotificationTemplatesDB.getAllTemplates();
      expect(Object.keys(template.fields)).toEqual(['amount']);
    });

    it('normalizes a rule missing its optional parts', async () => {
      queryAll.mockResolvedValue([row({
        fields: JSON.stringify({ amount: { before: 'на ' } }),
      })]);
      const [template] = await NotificationTemplatesDB.getAllTemplates();
      expect(template.fields.amount).toEqual({
        source: 'text', kind: 'amount', before: 'на ', after: '', value: '', occurrence: 0,
      });
    });

    it('de-duplicates and trims triggers', async () => {
      queryAll.mockResolvedValue([row({
        triggers: JSON.stringify(['Платеж', ' платеж ', '', null, 'Покупка']),
      })]);
      const [template] = await NotificationTemplatesDB.getAllTemplates();
      expect(template.triggers).toEqual(['Платеж', 'Покупка']);
    });

    it('falls back to a known date order for an unknown one', async () => {
      queryAll.mockResolvedValue([row({ date_order: 'wat' })]);
      const [template] = await NotificationTemplatesDB.getAllTemplates();
      expect(template.dateOrder).toBe('dmy');
    });

    it('falls back to expense for an unknown type', async () => {
      queryAll.mockResolvedValue([row({ type: 'transfer' })]);
      const [template] = await NotificationTemplatesDB.getAllTemplates();
      expect(template.type).toBe('expense');
    });
  });
});

describe('saveTemplate', () => {
  const draft = {
    name: 'Payment',
    packageName: 'com.example.bank',
    type: 'expense',
    currency: 'RUB',
    fields: { amount: AMOUNT_RULE },
    triggers: ['Платеж'],
    sample: { title: 'МегаФон', text: 'Платеж на 1 000 ₽' },
  };

  it('inserts a new template with a generated id', async () => {
    const saved = await NotificationTemplatesDB.saveTemplate(draft);
    expect(saved.id).toBe('uuid-1');
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notification_templates'),
      expect.arrayContaining(['uuid-1', 'Payment', 'com.example.bank']),
    );
  });

  it('updates in place when the id already exists, keeping created_at', async () => {
    queryFirst.mockResolvedValue(row());
    const saved = await NotificationTemplatesDB.saveTemplate({ ...draft, id: 'tpl-1', name: 'Renamed' });
    expect(saved.id).toBe('tpl-1');
    expect(saved.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notification_templates'),
      expect.arrayContaining(['Renamed']),
    );
  });

  it('refuses a template with no amount rule', async () => {
    await expect(NotificationTemplatesDB.saveTemplate({ ...draft, fields: {} }))
      .rejects.toThrow(/amount/);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('refuses a template with no name', async () => {
    await expect(NotificationTemplatesDB.saveTemplate({ ...draft, name: '   ' }))
      .rejects.toThrow(/name/);
  });

  it('refuses an empty template', async () => {
    await expect(NotificationTemplatesDB.saveTemplate(null)).rejects.toThrow();
  });

  it('stores an unsupported type as expense rather than writing junk', async () => {
    const saved = await NotificationTemplatesDB.saveTemplate({ ...draft, type: 'transfer' });
    expect(saved.type).toBe('expense');
  });

  it('clamps an over-long name', async () => {
    const saved = await NotificationTemplatesDB.saveTemplate({ ...draft, name: 'x'.repeat(200) });
    expect(saved.name).toHaveLength(60);
  });

  it('clamps an over-long sample so one row cannot bloat the table', async () => {
    const saved = await NotificationTemplatesDB.saveTemplate({
      ...draft, sample: { title: '', text: 'y'.repeat(9000) },
    });
    expect(saved.sample.text).toHaveLength(4000);
  });

  it('caps the number of stored triggers', async () => {
    const saved = await NotificationTemplatesDB.saveTemplate({
      ...draft, triggers: Array.from({ length: 20 }, (_, i) => `w${i}`),
    });
    expect(saved.triggers).toHaveLength(8);
  });
});

describe('setTemplateEnabled', () => {
  it('touches only the enabled column', async () => {
    await NotificationTemplatesDB.setTemplateEnabled('tpl-1', false);
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('SET enabled = ?'),
      expect.arrayContaining([0, 'tpl-1']),
    );
  });

  it('is a no-op without an id', async () => {
    await NotificationTemplatesDB.setTemplateEnabled(null, true);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('deleteTemplate', () => {
  it('deletes by id', async () => {
    await NotificationTemplatesDB.deleteTemplate('tpl-1');
    expect(executeQuery).toHaveBeenCalledWith(
      'DELETE FROM notification_templates WHERE id = ?', ['tpl-1'],
    );
  });

  it('is a no-op without an id', async () => {
    await NotificationTemplatesDB.deleteTemplate(undefined);
    expect(executeQuery).not.toHaveBeenCalled();
  });
});

describe('error handling', () => {
  it('propagates a read failure rather than reporting an empty list', async () => {
    queryAll.mockRejectedValue(new Error('db down'));
    await expect(NotificationTemplatesDB.getAllTemplates()).rejects.toThrow('db down');
  });

  it('propagates a write failure', async () => {
    executeQuery.mockRejectedValue(new Error('disk full'));
    await expect(NotificationTemplatesDB.saveTemplate({
      name: 'x', fields: { amount: AMOUNT_RULE },
    })).rejects.toThrow('disk full');
  });
});
