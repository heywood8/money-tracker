/**
 * Tests for the feed's parsed-word highlighting.
 *
 * The one thing that must never happen here is pointing at the wrong number: a
 * card that tints the account balance as "the amount" tells the user the parser
 * read something it didn't. Most of these tests are about that.
 */

import {
  notificationHighlights,
  segmentHighlights,
} from '../../../app/services/notifications/notificationHighlights';
import { parseBankNotification } from '../../../app/services/notifications/parseBankNotification';
import { __resetCustomTemplatesCache } from '../../../app/services/notifications/customTemplates';

const AMERIA = {
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
  packageName: 'com.banqr.ameriabank',
  postTime: 1782000000000,
};

const TINKOFF = {
  title: 'МегаФон',
  text: 'Платёж на 1 000 ₽, счет RUB\nБаланс 39 000 ₽',
  packageName: 'com.idamob.tinkoff.android',
  postTime: 1782000000000,
};

/** The text a set of ranges covers, keyed by field. */
const highlighted = (source, ranges) => {
  const out = {};
  ranges.forEach((range) => { out[range.field] = source.slice(range.start, range.end); });
  return out;
};

beforeEach(() => {
  __resetCustomTemplatesCache();
});

describe('notificationHighlights', () => {
  describe('a pipe-delimited bank line', () => {
    let ranges;
    beforeEach(() => {
      ranges = notificationHighlights(AMERIA, parseBankNotification(AMERIA)).text;
    });

    it('points at the charged amount, not the balance', () => {
      expect(highlighted(AMERIA.text, ranges).amount).toBe('3,900.00');
    });

    it('points at every field the parser read', () => {
      expect(highlighted(AMERIA.text, ranges)).toMatchObject({
        kind: 'PURCHASE',
        amount: '3,900.00',
        currency: 'AMD',
        card: '4083***7027',
        merchant: 'NAREK MEHRABYAN',
        date: '28.06.2026',
        time: '10:15',
      });
    });

    it('picks the currency next to the amount, not the one next to the balance', () => {
      const currency = ranges.find((r) => r.field === 'currency');
      const amount = ranges.find((r) => r.field === 'amount');
      expect(currency.start).toBeGreaterThan(amount.start);
      expect(currency.start).toBeLessThan(AMERIA.text.indexOf('BALANCE'));
    });

    it('returns non-overlapping ranges in document order', () => {
      for (let i = 1; i < ranges.length; i += 1) {
        expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
      }
    });
  });

  describe('a notification whose payee is the title', () => {
    it('finds the keyword and amount in the body and the payee in the title', () => {
      const { title, text } = notificationHighlights(TINKOFF, parseBankNotification(TINKOFF));
      expect(highlighted(TINKOFF.title, title)).toMatchObject({ merchant: 'МегаФон' });
      expect(highlighted(TINKOFF.text, text)).toMatchObject({ amount: '1 000' });
    });

    it('finds the kind keyword despite the ё/е spelling difference', () => {
      const { text } = notificationHighlights(TINKOFF, parseBankNotification(TINKOFF));
      expect(highlighted(TINKOFF.text, text).kind.toLowerCase()).toBe('платёж');
    });

    it('never points at the balance figure', () => {
      const { text } = notificationHighlights(TINKOFF, parseBankNotification(TINKOFF));
      const balanceAt = TINKOFF.text.indexOf('39 000');
      expect(text.some((r) => r.start >= balanceAt)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns nothing for an unparsed notification', () => {
      expect(notificationHighlights({ text: 'Your package has shipped' }, null))
        .toEqual({ title: [], text: [] });
    });

    it('returns nothing for junk input instead of throwing', () => {
      expect(notificationHighlights(null, null)).toEqual({ title: [], text: [] });
      expect(notificationHighlights({}, {})).toEqual({ title: [], text: [] });
    });

    it('skips a field whose value is not in the text', () => {
      const ranges = notificationHighlights(
        { text: 'PURCHASE | 3,900.00 AMD' },
        { kind: 'PURCHASE', amount: '3900.00', currency: 'AMD', merchant: 'NOT PRESENT' },
      ).text;
      expect(ranges.some((r) => r.field === 'merchant')).toBe(false);
      expect(ranges.some((r) => r.field === 'amount')).toBe(true);
    });
  });
});

describe('segmentHighlights', () => {
  it('cuts a string into plain and highlighted runs that rejoin to the original', () => {
    const text = 'PURCHASE | 3,900.00 AMD';
    const segments = segmentHighlights(text, [
      { start: 0, end: 8, field: 'kind' },
      { start: 11, end: 19, field: 'amount' },
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.field).map((s) => s.text)).toEqual(['PURCHASE', '3,900.00']);
  });

  it('returns the whole string as one plain run when nothing is highlighted', () => {
    expect(segmentHighlights('hello', [])).toEqual([{ text: 'hello', field: null }]);
  });

  it('clamps ranges that run past the end of the string', () => {
    const segments = segmentHighlights('abc', [{ start: 1, end: 99, field: 'amount' }]);
    expect(segments.map((s) => s.text).join('')).toBe('abc');
  });

  it('handles an empty string', () => {
    expect(segmentHighlights('', [{ start: 0, end: 3, field: 'amount' }])).toEqual([]);
    expect(segmentHighlights(null, [])).toEqual([]);
  });
});
