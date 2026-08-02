/**
 * Tests for the parse-template engine — the module that turns "the user tapped
 * these words" into a rule that reads the *next* notification of the same shape.
 *
 * The tests are written the way the editor drives it: mark token ranges in a
 * sample, derive rules, then run the resulting template against both that sample
 * and other notifications. That is the only property that matters — a template
 * which only reads its own sample is worthless.
 */

import {
  compileFieldRule,
  deriveFieldRule,
  extractField,
  matchTemplate,
  previewTemplate,
  refineSpan,
  templatePattern,
  templateAppliesTo,
  tokenize,
  validateTemplate,
} from '../../../app/services/notifications/templateEngine';
import { normalizeNotificationText } from '../../../app/services/notifications/valueFormat';

const AMERIA_TEXT =
  'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD';

const TINKOFF = {
  title: 'МегаФон',
  text: 'Платеж на 1 000 ₽, счет RUB\nБаланс 39 000 ₽',
  packageName: 'com.example.tb',
};

/**
 * Build a template the way the editor does: mark whole tokens per field, derive
 * each rule, assemble the draft.
 * @param {Object} sample - { title, text }
 * @param {Object} marks - field -> { source?, from, to? } token indices
 * @param {Object} extra - other template fields
 */
const build = (sample, marks, extra = {}) => {
  const fields = {};
  Object.entries(marks).forEach(([field, { source = 'text', from, to }]) => {
    const text = normalizeNotificationText(source === 'title' ? sample.title : sample.text);
    const tokens = tokenize(text);
    const span = { start: tokens[from].start, end: tokens[to ?? from].end };
    const rule = deriveFieldRule(text, span, field, source);
    if (rule) fields[field] = rule;
  });
  return {
    id: 'tpl-1', name: 'Test template', type: 'expense', enabled: true, fields, ...extra,
  };
};

describe('templatePattern', () => {
  it('generalizes digit runs so a card number in an anchor is not baked in', () => {
    expect(templatePattern('4083***7027,')).toBe('\\d+\\*\\*\\*\\d+,');
  });

  it('collapses whitespace so one space and a newline both match', () => {
    expect(templatePattern('на  ')).toBe('на\\s+');
    const regex = new RegExp(templatePattern('счет RUB'));
    expect(regex.test('счет\nRUB')).toBe(true);
  });

  it('escapes regex metacharacters in literal text', () => {
    const regex = new RegExp(templatePattern('BALANCE: ('));
    expect(regex.test('BALANCE: (')).toBe(true);
    expect(regex.test('BALANCEX (')).toBe(false);
  });
});

describe('refineSpan', () => {
  const text = 'Платеж на 1 000,50 ₽, счет RUB';

  it('trims a tapped token down to the number it holds', () => {
    // The user tapped "1 000,50" plus a stray trailing character.
    expect(refineSpan(text, { start: 10, end: 19 }, 'amount').value).toBe('1 000,50');
  });

  it('strips punctuation glued to a currency symbol', () => {
    const start = text.indexOf('₽');
    expect(refineSpan(text, { start, end: start + 2 }, 'currency').value).toBe('₽');
  });

  it('keeps a multi-word payee but drops delimiters around it', () => {
    const merchant = ' | NAREK MEHRABYAN, ';
    expect(refineSpan(merchant, { start: 0, end: merchant.length }, 'merchant').value)
      .toBe('NAREK MEHRABYAN');
  });

  it('returns null for a span with nothing usable in it', () => {
    expect(refineSpan('   ', { start: 0, end: 3 }, 'amount')).toBeNull();
    expect(refineSpan('abc', { start: 0, end: 3 }, 'amount')).toBeNull();
  });
});

describe('deriveFieldRule', () => {
  it('grows the anchor only as far as it needs to be unambiguous', () => {
    const text = 'Платеж на 1 000 ₽';
    const tokens = tokenize(text);
    const rule = deriveFieldRule(
      text, { start: tokens[2].start, end: tokens[3].end }, 'amount', 'text',
    );
    // "на " alone separates the amount from everything else here — the rule
    // should not have swallowed "Платеж" as well.
    expect(rule.before).toBe('на ');
    expect(rule.occurrence).toBe(0);
  });

  it('anchors an amount away from the balance that follows it', () => {
    const tokens = tokenize(TINKOFF.text);
    const rule = deriveFieldRule(
      TINKOFF.text, { start: tokens[2].start, end: tokens[3].end }, 'amount', 'text',
    );
    const match = extractField({ text: TINKOFF.text }, rule);
    expect(match.value).toBe('1 000');
  });

  it('generalizes a card number inside a derived anchor', () => {
    const tokens = tokenize(AMERIA_TEXT);
    // The payee sits right after the card segment.
    const rule = deriveFieldRule(
      AMERIA_TEXT,
      { start: tokens[7].start, end: tokens[9].end },
      'merchant',
      'text',
    );
    const other = AMERIA_TEXT
      .replace('4083***7027', '5555***1111')
      .replace('NAREK MEHRABYAN, AM', 'GURMAN, AM');
    expect(extractField({ text: other }, rule).value).toBe('GURMAN, AM');
  });

  it('prefers an anchored rule over a bare one even when both read the sample', () => {
    // Only one number here, so "no anchor" would already be correct — and would
    // start reading the balance the day the bank adds one to the message.
    const text = 'Платеж на 1 000 ₽';
    const tokens = tokenize(text);
    const rule = deriveFieldRule(
      text, { start: tokens[2].start, end: tokens[3].end }, 'amount', 'text',
    );
    expect(rule.before).not.toBe('');
    const withBalance = 'Платеж на 1 000 ₽\nБаланс 39 000 ₽';
    expect(extractField({ text: withBalance }, rule).value).toBe('1 000');
  });

  it('still derives a bare rule when the value has nothing around it', () => {
    const rule = deriveFieldRule('МегаФон', { start: 0, end: 7 }, 'merchant', 'title');
    expect(rule).not.toBeNull();
    expect(extractField({ title: 'Пятёрочка' }, rule).value).toBe('Пятёрочка');
  });

  it('returns null when the marked span holds no value of that kind', () => {
    expect(deriveFieldRule('hello world', { start: 0, end: 5 }, 'amount', 'text')).toBeNull();
  });
});

describe('compileFieldRule', () => {
  it('returns null rather than throwing on an unusable rule', () => {
    expect(compileFieldRule(null)).toBeNull();
    expect(compileFieldRule({ before: 'x', after: '' })).toBeNull();
  });
});

describe('extractField', () => {
  const rule = { source: 'text', kind: 'amount', before: 'на ', after: '', value: '1 000', occurrence: 0 };

  it('reads from the title when the rule says so', () => {
    const titleRule = { ...rule, source: 'title', before: '', after: '' };
    expect(extractField({ title: '500', text: 'nothing' }, titleRule).value).toBe('500');
  });

  it('returns null when the anchor is absent', () => {
    expect(extractField({ text: 'Баланс 39 000 ₽' }, rule)).toBeNull();
  });

  it('ignores an absurdly long notification', () => {
    expect(extractField({ text: `на 100${' '.repeat(5000)}` }, rule)).toBeNull();
  });
});

describe('matchTemplate', () => {
  const sample = { text: AMERIA_TEXT, packageName: 'com.example.bank' };
  const tokens = tokenize(AMERIA_TEXT);
  const template = build(sample, {
    amount: { from: 2 },
    currency: { from: 3 },
    card: { from: 5 },
    merchant: { from: 7, to: 8 },
    date: { from: 11 },
    time: { from: 12 },
  }, { packageName: 'com.example.bank', triggers: ['PURCHASE'] });

  it('reads every marked field out of its own sample', () => {
    expect(matchTemplate(template, sample)).toMatchObject({
      kind: 'Test template',
      type: 'expense',
      amount: '3900.00',
      currency: 'AMD',
      cardMask: '4083***7027',
      merchant: 'NAREK MEHRABYAN',
      date: '2026-06-28',
      time: '10:15',
      isTransfer: false,
      requiresCategory: false,
      templateId: 'tpl-1',
    });
    expect(tokens.length).toBeGreaterThan(12);
  });

  it('generalizes to another notification of the same shape', () => {
    const next = {
      text: 'PURCHASE | 12 500.50 AMD | 4083***7027, | GURMAN, AM | 01.07.2026 09:13 | BALANCE: 1,219.47 AMD',
      packageName: 'com.example.bank',
    };
    expect(matchTemplate(template, next)).toMatchObject({
      amount: '12500.50', currency: 'AMD', merchant: 'GURMAN', date: '2026-07-01', time: '09:13',
    });
  });

  it('never reads the balance as the amount', () => {
    const result = matchTemplate(template, sample);
    expect(result.amount).not.toBe('133719.97');
  });

  it('declines a notification missing its trigger word', () => {
    expect(matchTemplate(template, {
      text: 'REFUND | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15',
      packageName: 'com.example.bank',
    })).toBeNull();
  });

  it('declines a notification from a different app', () => {
    expect(matchTemplate(template, { text: AMERIA_TEXT, packageName: 'com.other.app' })).toBeNull();
  });

  it('declines a disabled template', () => {
    expect(matchTemplate({ ...template, enabled: false }, sample)).toBeNull();
  });

  it('declines when the amount is absent', () => {
    expect(matchTemplate(template, {
      text: 'PURCHASE | no amount here | 4083***7027,',
      packageName: 'com.example.bank',
    })).toBeNull();
  });

  it('declines a zero amount rather than booking a meaningless operation', () => {
    expect(matchTemplate(template, {
      text: 'PURCHASE | 0.00 AMD | 4083***7027, | X, AM | 28.06.2026 10:15',
      packageName: 'com.example.bank',
    })).toBeNull();
  });

  it('takes the payee from the title when that is where it was marked', () => {
    const tb = build(TINKOFF, {
      amount: { from: 2, to: 3 },
      currency: { from: 4 },
      merchant: { source: 'title', from: 0 },
    }, { packageName: 'com.example.tb', triggers: ['Платеж'] });

    expect(matchTemplate(tb, TINKOFF)).toMatchObject({
      amount: '1000', currency: 'RUB', merchant: 'МегаФон',
    });
    expect(matchTemplate(tb, {
      title: 'Пятёрочка',
      text: 'Платеж на 2 349,90 ₽, счет RUB\nБаланс 12 000 ₽',
      packageName: 'com.example.tb',
    })).toMatchObject({ amount: '2349.90', currency: 'RUB', merchant: 'Пятёрочка' });
  });

  it('falls back to the template currency when none is marked', () => {
    const tpl = build({ text: 'Оплата 500' }, { amount: { from: 1 } }, { currency: 'AMD' });
    expect(matchTemplate(tpl, { text: 'Оплата 500' })).toMatchObject({ currency: 'AMD' });
  });

  it('declines when no currency can be resolved at all', () => {
    const tpl = build({ text: 'Оплата 500' }, { amount: { from: 1 } });
    expect(matchTemplate(tpl, { text: 'Оплата 500' })).toBeNull();
  });

  it('surfaces the default category for the resolver to fall back on', () => {
    const tpl = build(sample, { amount: { from: 2 }, currency: { from: 3 } }, { categoryId: 'cat-9' });
    expect(matchTemplate(tpl, sample).defaultCategoryId).toBe('cat-9');
  });

  it('reads a template with no source app against any notification', () => {
    const tpl = build(sample, { amount: { from: 2 }, currency: { from: 3 } });
    expect(matchTemplate(tpl, { text: AMERIA_TEXT, packageName: 'com.whatever' })).not.toBeNull();
  });

  it('handles no-break spaces as thousands grouping', () => {
    const nbsp = { text: 'Платеж на 1 000 ₽, счет RUB', packageName: 'com.example.tb' };
    const tpl = build(TINKOFF, {
      amount: { from: 2, to: 3 }, currency: { from: 4 },
    }, { packageName: 'com.example.tb' });
    expect(matchTemplate(tpl, nbsp)).toMatchObject({ amount: '1000', currency: 'RUB' });
  });

  it('respects the template date order for an ambiguous date', () => {
    const text = 'PAY 100 USD 05.06.2026';
    const tpl = build({ text }, { amount: { from: 1 }, currency: { from: 2 }, date: { from: 3 } });
    expect(matchTemplate({ ...tpl, dateOrder: 'dmy' }, { text }).date).toBe('2026-06-05');
    expect(matchTemplate({ ...tpl, dateOrder: 'mdy' }, { text }).date).toBe('2026-05-06');
  });

  it('lets the data override the date order when only one reading is possible', () => {
    const text = 'PAY 100 USD 28.06.2026';
    const tpl = build({ text }, { amount: { from: 1 }, currency: { from: 2 }, date: { from: 3 } });
    // 28 can only be a day, so DMY wins even though the template says MDY.
    expect(matchTemplate({ ...tpl, dateOrder: 'mdy' }, { text }).date).toBe('2026-06-28');
  });

  it('drops an impossible date rather than storing it', () => {
    const text = 'PAY 100 USD 31.02.2026';
    const tpl = build({ text }, { amount: { from: 1 }, currency: { from: 2 }, date: { from: 3 } });
    expect(matchTemplate(tpl, { text }).date).toBeNull();
  });

  it('returns null for junk input instead of throwing', () => {
    expect(matchTemplate(null, sample)).toBeNull();
    expect(matchTemplate(template, null)).toBeNull();
    expect(matchTemplate(template, { text: '', title: '' })).toBeNull();
    expect(matchTemplate({ ...template, fields: {} }, sample)).toBeNull();
  });
});

describe('templateAppliesTo', () => {
  it('lets a notification with no source app reach every template', () => {
    expect(templateAppliesTo({ packageName: 'com.a' }, { text: 'x' })).toBe(true);
  });

  it('keeps a template to its own app', () => {
    expect(templateAppliesTo({ packageName: 'com.a' }, { packageName: 'com.b' })).toBe(false);
  });
});

describe('validateTemplate', () => {
  const sample = { text: AMERIA_TEXT };
  const good = build(sample, {
    amount: { from: 2 }, currency: { from: 3 }, merchant: { from: 7, to: 8 },
  }, { triggers: ['PURCHASE'] });

  it('passes a complete template', () => {
    expect(validateTemplate(good, sample).errors).toEqual([]);
  });

  it('blocks a template with no amount', () => {
    expect(validateTemplate({ ...good, fields: {} }, sample).errors)
      .toContain('template_error_amount_required');
  });

  it('blocks a template with no name', () => {
    expect(validateTemplate({ ...good, name: '  ' }, sample).errors)
      .toContain('template_error_name_required');
  });

  it('blocks a template with no way to know the currency', () => {
    const noCurrency = build(sample, { amount: { from: 2 } });
    expect(validateTemplate(noCurrency, sample).errors)
      .toContain('template_error_currency_required');
  });

  it('blocks a template that cannot read its own sample', () => {
    const broken = {
      ...good,
      fields: { ...good.fields, amount: { ...good.fields.amount, before: 'NOPE ' } },
    };
    expect(validateTemplate(broken, sample).errors).toContain('template_error_no_match');
  });

  it('warns about an amount with nothing anchoring it', () => {
    const loose = {
      ...good,
      fields: { ...good.fields, amount: { ...good.fields.amount, before: '', after: '' } },
    };
    expect(validateTemplate(loose, sample).warnings)
      .toContain('template_warning_amount_unanchored');
  });

  it('warns when no trigger word is marked', () => {
    expect(validateTemplate({ ...good, triggers: [] }, sample).warnings)
      .toContain('template_warning_no_trigger');
  });

  it('warns when no payee is marked', () => {
    const noMerchant = build(sample, { amount: { from: 2 }, currency: { from: 3 } });
    expect(validateTemplate(noMerchant, sample).warnings)
      .toContain('template_warning_no_merchant');
  });
});

describe('previewTemplate', () => {
  it('reports where each rule actually matched, not where it was marked', () => {
    const sample = { text: AMERIA_TEXT };
    const template = build(sample, { amount: { from: 2 }, currency: { from: 3 } });
    const { descriptor, ranges } = previewTemplate(template, sample);
    expect(descriptor.amount).toBe('3900.00');
    expect(AMERIA_TEXT.slice(ranges.amount.start, ranges.amount.end)).toBe('3,900.00');
    expect(ranges.amount.source).toBe('text');
  });

  it('returns empty results for an empty draft', () => {
    expect(previewTemplate(null, null)).toEqual({ descriptor: null, ranges: {} });
  });
});
