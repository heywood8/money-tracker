import { deriveFieldRule, compileFieldRule, matchTemplate } from '../app/services/notifications/templateEngine';
import { normalizeAmountString, parseDateValue } from '../app/services/notifications/valueFormat';

describe('review probes', () => {
  it('amount dot-grouping', () => {
    console.log('1.234 ->', normalizeAmountString('1.234'));
    console.log('1,234 ->', normalizeAmountString('1,234'));
    console.log('1 000 50 ->', normalizeAmountString('1 000 50'));
  });

  it('derive fallback rule when ambiguous', () => {
    // Two identical amounts, nothing distinguishes them within 4 tokens either side
    const text = 'x 100 y y y y y y y y y x 100 y';
    const span = { start: text.indexOf('100', 12), end: text.indexOf('100', 12) + 3 };
    const rule = deriveFieldRule(text, span, 'amount', 'text');
    console.log('RULE:', JSON.stringify(rule));
  });

  it('derive on realistic balance case', () => {
    const text = 'Pokupka 500 RUB. Balans 500 RUB';
    const start = text.indexOf('500');
    const rule = deriveFieldRule(text, { start, end: start + 3 }, 'amount', 'text');
    console.log('RULE2:', JSON.stringify(rule));
    console.log('regex', String(compileFieldRule(rule)));
  });

  it('template amount with european grouping', () => {
    const tpl = {
      name: 'T', type: 'expense', enabled: true, currency: 'EUR',
      triggers: ['Zahlung'],
      fields: { amount: { source: 'text', kind: 'amount', before: 'Zahlung ', after: ' EUR', value: '1.234' } },
    };
    console.log('DESC:', JSON.stringify(matchTemplate(tpl, { text: 'Zahlung 1.234 EUR' })));
  });

  it('date order', () => {
    console.log('parse 03.04.2026 dmy', JSON.stringify(parseDateValue('03.04.2026', 'dmy')));
    console.log('parse 03.04.2026 mdy', JSON.stringify(parseDateValue('03.04.2026', 'mdy')));
  });
});
