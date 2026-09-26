/**
 * Tests for normalizeAmountString: the one place a localized amount read from a
 * bank notification becomes the plain decimal string that gets booked. A wrong
 * reading here is never cosmetic, it books a charge off by a factor of 1000.
 */

import { normalizeAmountString } from '../../../app/services/notifications/valueFormat';

describe('normalizeAmountString', () => {
  describe('a lone dot', () => {
    it.each([
      ['1.500', '1500'],
      ['1.250', '1250'],
      ['12.345', '12345'],
      ['999.000', '999000'],
    ])('reads %s as thousands', (raw, expected) => {
      expect(normalizeAmountString(raw)).toBe(expected);
    });

    it.each([
      ['1.50', '1.50'],
      ['1.5', '1.5'],
      ['42.99', '42.99'],
      // A group never leads with 0, and no group leads with 4 digits.
      ['0.500', '0.500'],
      ['1234.567', '1234.567'],
    ])('keeps %s as a decimal', (raw, expected) => {
      expect(normalizeAmountString(raw)).toBe(expected);
    });
  });

  describe('a lone comma', () => {
    it.each([
      ['1,500', '1500'],
      ['12,345', '12345'],
    ])('reads %s as thousands', (raw, expected) => {
      expect(normalizeAmountString(raw)).toBe(expected);
    });

    it.each([
      ['12,50', '12.50'],
      ['1,5', '1.5'],
      ['0,500', '0.500'],
      ['1234,567', '1234.567'],
    ])('reads %s as a decimal', (raw, expected) => {
      expect(normalizeAmountString(raw)).toBe(expected);
    });
  });

  describe('repeated and mixed separators', () => {
    it.each([
      ['1.250.000', '1250000'],
      ['1,250,000', '1250000'],
      ['1.234,56', '1234.56'],
      ['1,234.56', '1234.56'],
      ['1 500,00', '1500.00'],
      ['€1.500', '1500'],
      ['1.500 ₽', '1500'],
    ])('reads %s as %s', (raw, expected) => {
      expect(normalizeAmountString(raw)).toBe(expected);
    });
  });

  describe('the currency of the amount', () => {
    it.each([
      ['1.500', 'EUR', '1500'],
      ['1.500', 'eur', '1500'],
      ['1.500', 'JPY', '1500'],
      ['1,500', 'RUB', '1500'],
    ])('reads %s %s as thousands: no fraction has 3 digits', (raw, currency, expected) => {
      expect(normalizeAmountString(raw, currency)).toBe(expected);
    });

    it.each([
      ['1.500', 'KWD', '1.500'],
      ['12.500', 'BHD', '12.500'],
      ['1,500', 'KWD', '1.500'],
      ['1.250', 'ETH', '1.250'],
    ])('keeps %s %s a fraction: a currency outside the list may carry 3 decimals', (raw, currency, expected) => {
      expect(normalizeAmountString(raw, currency)).toBe(expected);
    });

    // Regression from bdf4665: only the app's own currency table counted, so a
    // template in a currency the app has no account in (₸ → KZT, ₴ → UAH) read
    // "1,500" as 1.5. Every ISO currency but the 3-decimal ones has <= 2.
    it.each([
      ['1,500', 'KZT', '1500'],
      ['1,500', 'UAH', '1500'],
      ['2.300', 'PLN', '2300'],
      ['12.345', 'AED', '12345'],
      ['1.500', 'kzt', '1500'],
    ])('reads %s %s as thousands: an ISO currency outside the app\'s list', (raw, currency, expected) => {
      expect(normalizeAmountString(raw, currency)).toBe(expected);
    });

    it('still keeps a fraction for the other 3-decimal ISO currencies', () => {
      ['JOD', 'OMR', 'TND', 'IQD', 'LYD'].forEach(currency => {
        expect(normalizeAmountString('1.500', currency)).toBe('1.500');
      });
    });

    it('leaves repeated and mixed separators alone', () => {
      expect(normalizeAmountString('1.250.000', 'KWD')).toBe('1250000');
      expect(normalizeAmountString('1,250.500', 'KWD')).toBe('1250.500');
      expect(normalizeAmountString('12.50', 'EUR')).toBe('12.50');
    });
  });

  it('returns null when there are no digits', () => {
    expect(normalizeAmountString(null)).toBeNull();
    expect(normalizeAmountString('')).toBeNull();
    expect(normalizeAmountString('€')).toBeNull();
  });

  describe('Regression Tests', () => {
    it('books "1.500 EUR" as 1500, not a thousandth of the charge', () => {
      expect(normalizeAmountString('1.500', 'EUR')).toBe('1500');
    });

    it('books "0,500" as 0.5, not 500', () => {
      // The comma branch used to call any 3-digit tail a group, lead or no lead.
      expect(normalizeAmountString('0,500')).toBe('0.500');
    });
  });
});
