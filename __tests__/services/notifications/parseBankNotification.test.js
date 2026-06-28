/**
 * Tests for parseBankNotification — the pure parser that turns a raw bank push
 * notification into a normalized transaction descriptor.
 */

import { parseBankNotification } from '../../../app/services/notifications/parseBankNotification';

// The canonical Ameria "ARCA transaction" PURCHASE notification from the design.
const AMERIA_PURCHASE = {
  title: 'АРКА транзакции',
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
  packageName: 'am.ameriabank.mobile',
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
      expect(result.packageName).toBe('am.ameriabank.mobile');
    });

    it('keeps the raw text for auditing', () => {
      expect(result.raw).toBe(AMERIA_PURCHASE.text);
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
