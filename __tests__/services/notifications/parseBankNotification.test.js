/**
 * Tests for parseBankNotification — the pure parser that turns a raw bank push
 * notification into a normalized transaction descriptor.
 */

import {
  parseBankNotification,
  kindRequiresCategory,
} from '../../../app/services/notifications/parseBankNotification';

// The canonical Ameria "ARCA transaction" PURCHASE notification from the design.
const AMERIA_PURCHASE = {
  title: 'АРКА транзакции',
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
  packageName: 'com.banqr.ameriabank',
  postTime: 1782000900000,
};

describe('parseBankNotification', () => {
  describe('canonical PURCHASE template', () => {
    let result;
    beforeEach(() => {
      result = parseBankNotification(AMERIA_PURCHASE);
    });

    it('recognizes the notification and returns an object', () => {
      expect(result).not.toBeNull();
    });

    it('maps PURCHASE to an expense operation', () => {
      expect(result.kind).toBe('PURCHASE');
      expect(result.type).toBe('expense');
    });

    it('extracts and normalizes the amount (strips thousands separators)', () => {
      expect(result.amount).toBe('3900.00');
    });

    it('extracts the currency code', () => {
      expect(result.currency).toBe('AMD');
    });

    it('extracts the card mask for account binding', () => {
      expect(result.cardMask).toBe('4083***7027');
    });

    it('extracts the merchant for category binding', () => {
      expect(result.merchant).toBe('NAREK MEHRABYAN');
    });

    it('extracts the trailing country code off the merchant', () => {
      expect(result.country).toBe('AM');
    });

    it('converts DD.MM.YYYY to an ISO date', () => {
      expect(result.date).toBe('2026-06-28');
    });

    it('extracts the time', () => {
      expect(result.time).toBe('10:15');
    });

    it('ignores the balance segment entirely (no balance field, amount is not the balance)', () => {
      expect(result).not.toHaveProperty('balance');
      expect(result.amount).toBe('3900.00');
      // The balance value only survives inside the untouched `raw` passthrough.
      const { raw, ...structured } = result;
      expect(JSON.stringify(structured)).not.toContain('133');
    });

    it('passes through the source package name', () => {
      expect(result.packageName).toBe('com.banqr.ameriabank');
    });

    it('keeps the raw text for auditing', () => {
      expect(result.raw).toBe(AMERIA_PURCHASE.text);
    });
  });

  describe('canonical C2C template (client-to-client transfer)', () => {
    // The Ameria "ARCA transaction" C2C notification from the design.
    const AMERIA_C2C = {
      title: 'АРКА транзакции',
      text: 'C2C | 19,200.00 AMD | 4083***7027, | TO: N. DORVANYAN | AMERIABANK API GATE, AM | 28.06.2026 16:23 | BALANCE: 106,819.97 AMD',
      packageName: 'com.banqr.ameriabank',
      postTime: 1782000900000,
    };
    let result;
    beforeEach(() => {
      result = parseBankNotification(AMERIA_C2C);
    });

    it('recognizes C2C as a transaction', () => {
      expect(result).not.toBeNull();
    });

    it('maps C2C to an expense operation', () => {
      expect(result.kind).toBe('C2C');
      expect(result.type).toBe('expense');
    });

    it('extracts and normalizes the amount', () => {
      expect(result.amount).toBe('19200.00');
      expect(result.currency).toBe('AMD');
    });

    it('extracts the card mask', () => {
      expect(result.cardMask).toBe('4083***7027');
    });

    it('strips the "TO:" label and keeps the recipient as the merchant', () => {
      expect(result.merchant).toBe('N. DORVANYAN');
    });

    it('flags that the category must be chosen manually', () => {
      expect(result.requiresCategory).toBe(true);
    });

    it('converts the date', () => {
      expect(result.date).toBe('2026-06-28');
      expect(result.time).toBe('16:23');
    });

    it('recognizes the C2C keyword case-insensitively', () => {
      const lower = parseBankNotification({ ...AMERIA_C2C, text: AMERIA_C2C.text.replace('C2C', 'c2c') });
      expect(lower.kind).toBe('C2C');
      expect(lower.requiresCategory).toBe(true);
    });

    it('strips a "FROM:" recipient label too', () => {
      const incoming = parseBankNotification({
        text: 'C2C | 5,000.00 AMD | 4083***7027 | FROM: A. PETROSYAN | 28.06.2026 16:23',
      });
      expect(incoming.merchant).toBe('A. PETROSYAN');
    });
  });

  describe('E-POS PURCHASE template (online point-of-sale, foreign currency)', () => {
    // The Ameria "ARCA transaction" E-POS PURCHASE notification: a EUR charge on
    // an AMD card account (note the balance segment is in AMD, the charge in EUR).
    const AMERIA_EPOS = {
      title: 'АРКА транзакции',
      text: 'E-POS PURCHASE | 129.99 EUR | 4083***7027, | Nike ES, ES | 29.06.2026 15:14 | BALANCE: 27,608.20 AMD',
      packageName: 'com.banqr.ameriabank',
      postTime: 1782062040000,
    };
    let result;
    beforeEach(() => {
      result = parseBankNotification(AMERIA_EPOS);
    });

    it('recognizes E-POS PURCHASE as a transaction', () => {
      expect(result).not.toBeNull();
    });

    it('maps E-POS PURCHASE to an expense operation', () => {
      expect(result.kind).toBe('E-POS PURCHASE');
      expect(result.type).toBe('expense');
    });

    it('reports the transaction currency as charged (EUR, not the AMD balance)', () => {
      expect(result.amount).toBe('129.99');
      expect(result.currency).toBe('EUR');
    });

    it('extracts the merchant and trailing country code', () => {
      expect(result.merchant).toBe('Nike ES');
      expect(result.country).toBe('ES');
    });

    it('does not require a manual category (merchant rules can resolve it)', () => {
      expect(result.requiresCategory).toBe(false);
    });

    it('extracts the card mask, date and time', () => {
      expect(result.cardMask).toBe('4083***7027');
      expect(result.date).toBe('2026-06-29');
      expect(result.time).toBe('15:14');
    });
  });

  describe('PRE-PURCHASE template (authorization hold)', () => {
    const AMERIA_PRE_PURCHASE = {
      title: 'АРКА транзакции',
      text: 'PRE-PURCHASE | 2,800.00 AMD | 4083***7027, | YANDEX.GO, AM | 30.06.2026 10:51 | BALANCE: 19,095.20 AMD',
      packageName: 'com.banqr.ameriabank',
      postTime: 1782000900000,
    };
    let result;
    beforeEach(() => {
      result = parseBankNotification(AMERIA_PRE_PURCHASE);
    });

    it('recognizes PRE-PURCHASE as a transaction', () => {
      expect(result).not.toBeNull();
    });

    it('maps PRE-PURCHASE to an expense operation', () => {
      expect(result.kind).toBe('PRE-PURCHASE');
      expect(result.type).toBe('expense');
    });

    it('extracts amount, currency, card mask, merchant, country, date and time', () => {
      expect(result.amount).toBe('2800.00');
      expect(result.currency).toBe('AMD');
      expect(result.cardMask).toBe('4083***7027');
      expect(result.merchant).toBe('YANDEX.GO');
      expect(result.country).toBe('AM');
      expect(result.date).toBe('2026-06-30');
      expect(result.time).toBe('10:51');
    });

    it('does not require a manual category', () => {
      expect(result.requiresCategory).toBe(false);
    });
  });

  describe('PRE-PURCHASE COMPLETION template (settlement of hold)', () => {
    const AMERIA_PRE_PURCHASE_COMPLETION = {
      title: 'АРКА транзакции',
      text: 'PRE-PURCHASE COMPLETION | 2,800.00 AMD | 4083***7027, | YANDEX.GO, AM | 30.06.2026 13:51 | BALANCE: 19,095.20 AMD',
      packageName: 'com.banqr.ameriabank',
      postTime: 1782000900000,
    };
    let result;
    beforeEach(() => {
      result = parseBankNotification(AMERIA_PRE_PURCHASE_COMPLETION);
    });

    it('recognizes PRE-PURCHASE COMPLETION as a transaction', () => {
      expect(result).not.toBeNull();
    });

    it('maps PRE-PURCHASE COMPLETION to an expense operation', () => {
      expect(result.kind).toBe('PRE-PURCHASE COMPLETION');
      expect(result.type).toBe('expense');
    });

    it('extracts amount, currency, card mask, merchant, country, date and time', () => {
      expect(result.amount).toBe('2800.00');
      expect(result.currency).toBe('AMD');
      expect(result.cardMask).toBe('4083***7027');
      expect(result.merchant).toBe('YANDEX.GO');
      expect(result.country).toBe('AM');
      expect(result.date).toBe('2026-06-30');
      expect(result.time).toBe('13:51');
    });

    it('does not require a manual category', () => {
      expect(result.requiresCategory).toBe(false);
    });

    it('handles a completion with a different amount than the original hold', () => {
      const result = parseBankNotification({
        text: 'PRE-PURCHASE COMPLETION | 2,500.00 AMD | 4083***7027, | YANDEX.GO, AM | 30.06.2026 13:03 | BALANCE: 19,095.20 AMD',
        packageName: 'com.banqr.ameriabank',
      });
      expect(result).not.toBeNull();
      expect(result.amount).toBe('2500.00');
      expect(result.kind).toBe('PRE-PURCHASE COMPLETION');
    });
  });

  describe('PURCHASE does not require a manual category', () => {
    it('marks a purchase as not requiring a category', () => {
      expect(parseBankNotification(AMERIA_PURCHASE).requiresCategory).toBe(false);
    });
  });

  describe('kindRequiresCategory', () => {
    it('is true for C2C (any case)', () => {
      expect(kindRequiresCategory('C2C')).toBe(true);
      expect(kindRequiresCategory('c2c')).toBe(true);
    });

    it('is false for PURCHASE and unknown/empty kinds', () => {
      expect(kindRequiresCategory('PURCHASE')).toBe(false);
      expect(kindRequiresCategory('REFUND')).toBe(false);
      expect(kindRequiresCategory('')).toBe(false);
      expect(kindRequiresCategory(null)).toBe(false);
      expect(kindRequiresCategory(undefined)).toBe(false);
    });
  });

  describe('source-app dispatch', () => {
    it('parses notifications from the registered Ameriabank package', () => {
      const result = parseBankNotification({
        text: 'PURCHASE | 3,900.00 AMD | 4083***7027 | SHOP, AM | 28.06.2026 10:15',
        packageName: 'com.banqr.ameriabank',
      });
      expect(result).not.toBeNull();
      expect(result.kind).toBe('PURCHASE');
      expect(result.packageName).toBe('com.banqr.ameriabank');
    });

    it('falls back to known parsers for an unknown/missing source app', () => {
      // A manual paste (no packageName) or a different app still parses if its
      // text matches a known format.
      const noPkg = parseBankNotification({
        text: 'PURCHASE | 3,900.00 AMD | 4083***7027 | SHOP, AM | 28.06.2026 10:15',
      });
      expect(noPkg).not.toBeNull();
      expect(noPkg.kind).toBe('PURCHASE');

      const otherPkg = parseBankNotification({
        text: 'C2C | 5,000.00 AMD | 4083***7027 | TO: A. PETROSYAN | 28.06.2026 10:15',
        packageName: 'com.some.otherbank',
      });
      expect(otherPkg).not.toBeNull();
      expect(otherPkg.kind).toBe('C2C');
      expect(otherPkg.requiresCategory).toBe(true);
    });

    it('scopes kindRequiresCategory to the source app when given one', () => {
      expect(kindRequiresCategory('C2C', 'com.banqr.ameriabank')).toBe(true);
      expect(kindRequiresCategory('PURCHASE', 'com.banqr.ameriabank')).toBe(false);
    });
  });

  describe('amount normalization', () => {
    const amountFor = (segment) =>
      parseBankNotification({
        text: `PURCHASE | ${segment} | 4083***7027 | SHOP, AM | 28.06.2026 10:15`,
      })?.amount;

    it('handles amounts without a fractional part', () => {
      expect(amountFor('500 AMD')).toBe('500');
    });

    it('handles amounts with grouping and decimals', () => {
      expect(amountFor('1,234,567.89 USD')).toBe('1234567.89');
    });

    it('handles plain decimal amounts', () => {
      expect(amountFor('42.50 EUR')).toBe('42.50');
    });

    it('reads comma as the decimal separator (12,50 EUR -> 12.50)', () => {
      expect(amountFor('12,50 EUR')).toBe('12.50');
    });

    it('reads dot-thousands + comma-decimal (1.234,56 EUR -> 1234.56)', () => {
      expect(amountFor('1.234,56 EUR')).toBe('1234.56');
    });

    it('reads comma-thousands + dot-decimal (1,234.56 USD -> 1234.56)', () => {
      expect(amountFor('1,234.56 USD')).toBe('1234.56');
    });

    it('treats a lone 3-digit comma group as thousands (1,234 -> 1234)', () => {
      expect(amountFor('1,234 USD')).toBe('1234');
    });

    it('does not corrupt comma-decimal amounts by 100x', () => {
      // Regression: previously "42,50" became "4250".
      expect(amountFor('42,50 EUR')).not.toBe('4250');
    });
  });

  describe('date validation', () => {
    const dateFor = (segment) =>
      parseBankNotification({
        text: `PURCHASE | 100 AMD | 4083***7027 | SHOP, AM | ${segment}`,
      })?.date;

    it('rejects an impossible calendar date', () => {
      expect(dateFor('31.02.2026 10:15')).toBeNull();
    });

    it('rejects an out-of-range month', () => {
      expect(dateFor('15.13.2026 10:15')).toBeNull();
    });

    it('accepts a valid leap day', () => {
      expect(dateFor('29.02.2028 10:15')).toBe('2028-02-29');
    });

    it('skips an invalid date segment and uses a later valid one', () => {
      const result = parseBankNotification({
        text: 'PURCHASE | 100 AMD | 4083***7027 | 31.02.2026 | SHOP, AM | 28.06.2026 10:15',
      });
      expect(result.date).toBe('2026-06-28');
    });
  });

  describe('robustness', () => {
    it('parses regardless of whitespace around pipes', () => {
      const result = parseBankNotification({
        text: 'PURCHASE|3,900.00 AMD|4083***7027|NAREK MEHRABYAN, AM|28.06.2026 10:15',
      });
      expect(result.amount).toBe('3900.00');
      expect(result.merchant).toBe('NAREK MEHRABYAN');
    });

    it('handles a notification with no time component', () => {
      const result = parseBankNotification({
        text: 'PURCHASE | 3,900.00 AMD | 4083***7027 | NAREK MEHRABYAN, AM | 28.06.2026',
      });
      expect(result.date).toBe('2026-06-28');
      expect(result.time).toBeNull();
    });

    it('handles a merchant with no trailing country code', () => {
      const result = parseBankNotification({
        text: 'PURCHASE | 3,900.00 AMD | 4083***7027 | SOME LOCAL SHOP | 28.06.2026 10:15',
      });
      expect(result.merchant).toBe('SOME LOCAL SHOP');
      expect(result.country).toBeNull();
    });

    it('handles a missing card mask gracefully', () => {
      const result = parseBankNotification({
        text: 'PURCHASE | 3,900.00 AMD | NAREK MEHRABYAN, AM | 28.06.2026 10:15',
      });
      expect(result).not.toBeNull();
      expect(result.cardMask).toBeNull();
      expect(result.merchant).toBe('NAREK MEHRABYAN');
    });

    it('recognizes the kind keyword case-insensitively', () => {
      const result = parseBankNotification({
        text: 'purchase | 3,900.00 AMD | 4083***7027 | SHOP, AM | 28.06.2026 10:15',
      });
      expect(result).not.toBeNull();
      expect(result.kind).toBe('PURCHASE');
    });

    it('does not mistake the balance amount for the transaction amount', () => {
      const result = parseBankNotification(AMERIA_PURCHASE);
      expect(result.amount).toBe('3900.00');
      expect(result.currency).toBe('AMD');
    });
  });

  describe('rejection of non-transaction notifications', () => {
    it('returns null for an unknown notification kind', () => {
      expect(
        parseBankNotification({
          text: 'You have a new message from support',
        }),
      ).toBeNull();
    });

    it('returns null when the amount is missing', () => {
      expect(
        parseBankNotification({
          text: 'PURCHASE | 4083***7027 | NAREK MEHRABYAN, AM | 28.06.2026 10:15',
        }),
      ).toBeNull();
    });

    it('returns null for empty text', () => {
      expect(parseBankNotification({ text: '' })).toBeNull();
      expect(parseBankNotification({ text: '   ' })).toBeNull();
    });

    it('returns null for missing or malformed input', () => {
      expect(parseBankNotification(null)).toBeNull();
      expect(parseBankNotification(undefined)).toBeNull();
      expect(parseBankNotification({})).toBeNull();
      expect(parseBankNotification({ text: 123 })).toBeNull();
    });
  });
});
