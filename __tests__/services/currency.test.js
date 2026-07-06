/**
 * Tests for currency.js - Critical for financial accuracy
 * These tests ensure precise decimal arithmetic without floating-point errors
 */

import * as Currency from '../../app/services/currency';

// Mock exchange rates data for testing
jest.mock('../../assets/exchange-rates.json', () => ({
  lastUpdated: '2024-01-15T12:00:00Z',
  rates: {
    USD: {
      EUR: 0.92,
      GBP: 0.79,
      JPY: 148.5,
      AMD: 405.0,
    },
    EUR: {
      USD: 1.09,
      GBP: 0.86,
    },
  },
}));

// Mock currencies data for testing
jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  GBP: { symbol: '£', decimal_digits: 2 },
  JPY: { symbol: '¥', decimal_digits: 0 },
  AMD: { symbol: '֏', decimal_digits: 0 },
  BHD: { symbol: '.د.ب', decimal_digits: 3 },
}));

describe('Currency Service', () => {
  describe('getDecimalPlaces', () => {
    it('returns correct decimal places for known currencies', async () => {
      expect(Currency.getDecimalPlaces('USD')).toBe(2);
      expect(Currency.getDecimalPlaces('EUR')).toBe(2);
      expect(Currency.getDecimalPlaces('JPY')).toBe(0);
      expect(Currency.getDecimalPlaces('AMD')).toBe(0);
      expect(Currency.getDecimalPlaces('BHD')).toBe(3);
    });

    it('returns 2 as default for unknown currencies', async () => {
      expect(Currency.getDecimalPlaces('INVALID')).toBe(2);
      expect(Currency.getDecimalPlaces('XYZ')).toBe(2);
    });

    it('returns 2 for null or undefined', async () => {
      expect(Currency.getDecimalPlaces(null)).toBe(2);
      expect(Currency.getDecimalPlaces(undefined)).toBe(2);
      expect(Currency.getDecimalPlaces('')).toBe(2);
    });
  });


  describe('formatAmount', () => {
    it('formats amount with default 2 decimals', async () => {
      expect(Currency.formatAmount('10.5')).toBe('10.50');
      expect(Currency.formatAmount('100')).toBe('100.00');
      expect(Currency.formatAmount('0.1')).toBe('0.10');
    });

    it('formats amount with currency code', async () => {
      expect(Currency.formatAmount('100', 'USD')).toBe('100.00');
      expect(Currency.formatAmount('100', 'JPY')).toBe('100');
      expect(Currency.formatAmount('100.123', 'BHD')).toBe('100.123');
    });

    it('formats amount with explicit decimal places', async () => {
      expect(Currency.formatAmount('100', 0)).toBe('100');
      expect(Currency.formatAmount('100', 3)).toBe('100.000');
      expect(Currency.formatAmount('10.5555', 3)).toBe('10.556'); // rounds
    });

    it('handles invalid amounts gracefully', async () => {
      expect(Currency.formatAmount(null)).toBe('0.00');
      expect(Currency.formatAmount('')).toBe('0.00');
      expect(Currency.formatAmount('invalid')).toBe('0.00');
    });

    it('handles Infinity and NaN', async () => {
      expect(Currency.formatAmount(Infinity)).toBe('0.00');
      expect(Currency.formatAmount(-Infinity)).toBe('0.00');
      expect(Currency.formatAmount(NaN)).toBe('0.00');
    });

    it('handles unsupported types gracefully', async () => {
      // Objects, arrays, functions - all should return 0.00
      expect(Currency.formatAmount({})).toBe('0.00');
      expect(Currency.formatAmount([])).toBe('0.00');
      expect(Currency.formatAmount(() => {})).toBe('0.00');
      expect(Currency.formatAmount(Symbol('test'))).toBe('0.00');
    });
  });

  describe('toCents', () => {
    it('converts string amounts to cents correctly', async () => {
      expect(Currency.toCents('10.50')).toBe(1050);
      expect(Currency.toCents('0.01')).toBe(1);
      expect(Currency.toCents('100')).toBe(10000);
      expect(Currency.toCents('0')).toBe(0);
    });

    it('converts number amounts to cents correctly', async () => {
      expect(Currency.toCents(10.50)).toBe(1050);
      expect(Currency.toCents(0.01)).toBe(1);
      expect(Currency.toCents(100)).toBe(10000);
      expect(Currency.toCents(0)).toBe(0);
    });

    it('handles negative amounts', async () => {
      expect(Currency.toCents('-10.50')).toBe(-1050);
      expect(Currency.toCents(-10.50)).toBe(-1050);
    });

    it('handles invalid input gracefully', async () => {
      expect(Currency.toCents('')).toBe(0);
      expect(Currency.toCents('invalid')).toBe(0);
      expect(Currency.toCents(null)).toBe(0);
    });

    it('rounds to nearest cent for precision issues', async () => {
      expect(Currency.toCents(10.505)).toBe(1051); // Rounds up
      expect(Currency.toCents(10.504)).toBe(1050); // Rounds down
    });

    it('converts with currency-specific decimal places', async () => {
      expect(Currency.toCents('100', 'JPY')).toBe(100); // JPY has 0 decimals
      expect(Currency.toCents('100', 'BHD')).toBe(100000); // BHD has 3 decimals
      expect(Currency.toCents('100', 'USD')).toBe(10000); // USD has 2 decimals
    });
  });

  describe('fromCents', () => {
    it('converts cents to currency string with 2 decimals', async () => {
      expect(Currency.fromCents(1050)).toBe('10.50');
      expect(Currency.fromCents(1)).toBe('0.01');
      expect(Currency.fromCents(10000)).toBe('100.00');
      expect(Currency.fromCents(0)).toBe('0.00');
    });

    it('handles negative cents', async () => {
      expect(Currency.fromCents(-1050)).toBe('-10.50');
    });

    it('supports custom decimal places', async () => {
      expect(Currency.fromCents(1050, 0)).toBe('11');
      expect(Currency.fromCents(1050, 3)).toBe('10.500');
    });

    it('converts with currency code string', async () => {
      expect(Currency.fromCents(10000, 'USD')).toBe('100.00');
      expect(Currency.fromCents(100, 'JPY')).toBe('100');
      expect(Currency.fromCents(100000, 'BHD')).toBe('100.000');
    });

    it('defaults to 2 decimals with no second argument', async () => {
      expect(Currency.fromCents(1050)).toBe('10.50');
    });
  });

  describe('add', () => {
    it('adds two amounts correctly', async () => {
      expect(Currency.add('10.50', '5.25')).toBe('15.75');
      expect(Currency.add('0.01', '0.02')).toBe('0.03');
      expect(Currency.add('100', '200')).toBe('300.00');
    });

    it('handles mixed string and number inputs', async () => {
      expect(Currency.add('10.50', 5.25)).toBe('15.75');
      expect(Currency.add(10.50, '5.25')).toBe('15.75');
    });

    it('handles negative amounts', async () => {
      expect(Currency.add('10.50', '-5.25')).toBe('5.25');
      expect(Currency.add('-10.50', '-5.25')).toBe('-15.75');
    });

    it('avoids floating-point precision errors', async () => {
      // Classic JavaScript floating-point error: 0.1 + 0.2 = 0.30000000000000004
      expect(Currency.add('0.1', '0.2')).toBe('0.30');
      expect(Currency.add('10.1', '20.2')).toBe('30.30');
    });

    it('formats result with currency code', async () => {
      expect(Currency.add('10.50', '5.25', 'USD')).toBe('15.75');
      expect(Currency.add('100', '50', 'JPY')).toBe('150');
      expect(Currency.add('10.123', '5.456', 'BHD')).toBe('15.579');
    });
  });

  describe('subtract', () => {
    it('subtracts two amounts correctly', async () => {
      expect(Currency.subtract('10.50', '5.25')).toBe('5.25');
      expect(Currency.subtract('0.03', '0.01')).toBe('0.02');
      expect(Currency.subtract('300', '100')).toBe('200.00');
    });

    it('handles negative results', async () => {
      expect(Currency.subtract('5.25', '10.50')).toBe('-5.25');
    });

    it('handles negative inputs', async () => {
      expect(Currency.subtract('-10.50', '5.25')).toBe('-15.75');
      expect(Currency.subtract('10.50', '-5.25')).toBe('15.75');
    });

    it('avoids floating-point precision errors', async () => {
      expect(Currency.subtract('0.3', '0.1')).toBe('0.20');
    });

    it('formats result with currency code', async () => {
      expect(Currency.subtract('10.50', '5.25', 'USD')).toBe('5.25');
      expect(Currency.subtract('100', '30', 'JPY')).toBe('70');
      expect(Currency.subtract('10.500', '5.123', 'BHD')).toBe('5.377');
    });
  });

  describe('multiply', () => {
    it('multiplies amount by factor correctly', async () => {
      expect(Currency.multiply('10.50', 2)).toBe('21.00');
      expect(Currency.multiply('5.00', 1.5)).toBe('7.50');
      expect(Currency.multiply('100', 0.1)).toBe('10.00');
    });

    it('handles zero and one', async () => {
      expect(Currency.multiply('10.50', 0)).toBe('0.00');
      expect(Currency.multiply('10.50', 1)).toBe('10.50');
    });

    it('handles negative factors', async () => {
      expect(Currency.multiply('10.50', -2)).toBe('-21.00');
    });

    it('rounds to nearest cent', async () => {
      expect(Currency.multiply('10.00', 0.333)).toBe('3.33');
    });

    it('formats result with currency code', async () => {
      expect(Currency.multiply('10.00', 2, 'USD')).toBe('20.00');
      expect(Currency.multiply('100', 1.5, 'JPY')).toBe('150');
      expect(Currency.multiply('10.000', 2.5, 'BHD')).toBe('25.000');
    });
  });

  describe('divide', () => {
    it('divides amount by divisor correctly', async () => {
      expect(Currency.divide('21.00', 2)).toBe('10.50');
      expect(Currency.divide('10.00', 4)).toBe('2.50');
    });

    it('throws error on division by zero', async () => {
      expect(() => Currency.divide('10.00', 0)).toThrow('Division by zero');
    });

    it('handles negative divisors', async () => {
      expect(Currency.divide('10.00', -2)).toBe('-5.00');
    });

    it('rounds to nearest cent', async () => {
      expect(Currency.divide('10.00', 3)).toBe('3.33');
    });

    it('formats result with currency code', async () => {
      expect(Currency.divide('20.00', 2, 'USD')).toBe('10.00');
      expect(Currency.divide('150', 3, 'JPY')).toBe('50');
      expect(Currency.divide('25.000', 2, 'BHD')).toBe('12.500');
    });
  });

  describe('compare', () => {
    it('compares two amounts correctly', async () => {
      expect(Currency.compare('10.50', '5.25')).toBe(1); // a > b
      expect(Currency.compare('5.25', '10.50')).toBe(-1); // a < b
      expect(Currency.compare('10.50', '10.50')).toBe(0); // a === b
    });

    it('handles negative amounts', async () => {
      expect(Currency.compare('-10.50', '-5.25')).toBe(-1); // -10.50 < -5.25
      expect(Currency.compare('0', '-5.25')).toBe(1); // 0 > -5.25
    });

    it('handles precision correctly', async () => {
      // 10.51 cents vs 10.50 - note that 10.501 gets rounded to 10.50
      expect(Currency.compare('10.51', '10.50')).toBe(1);
      expect(Currency.compare('10.50', '10.51')).toBe(-1);
    });
  });

  describe('isPositive', () => {
    it('identifies positive amounts', async () => {
      expect(Currency.isPositive('10.50')).toBe(true);
      expect(Currency.isPositive('0.01')).toBe(true);
    });

    it('identifies non-positive amounts', async () => {
      expect(Currency.isPositive('0')).toBe(false);
      expect(Currency.isPositive('-10.50')).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('identifies negative amounts', async () => {
      expect(Currency.isNegative('-10.50')).toBe(true);
      expect(Currency.isNegative('-0.01')).toBe(true);
    });

    it('identifies non-negative amounts', async () => {
      expect(Currency.isNegative('0')).toBe(false);
      expect(Currency.isNegative('10.50')).toBe(false);
    });
  });

  describe('isZero', () => {
    it('identifies zero amounts', async () => {
      expect(Currency.isZero('0')).toBe(true);
      expect(Currency.isZero('0.00')).toBe(true);
      expect(Currency.isZero(0)).toBe(true);
    });

    it('identifies non-zero amounts', async () => {
      expect(Currency.isZero('0.01')).toBe(false);
      expect(Currency.isZero('-0.01')).toBe(false);
      expect(Currency.isZero('10.50')).toBe(false);
    });
  });

  describe('abs', () => {
    it('returns absolute value of positive amounts', async () => {
      expect(Currency.abs('10.50')).toBe('10.50');
      expect(Currency.abs('0.01')).toBe('0.01');
    });

    it('returns absolute value of negative amounts', async () => {
      expect(Currency.abs('-10.50')).toBe('10.50');
      expect(Currency.abs('-0.01')).toBe('0.01');
    });

    it('handles zero', async () => {
      expect(Currency.abs('0')).toBe('0.00');
    });

    it('formats result with currency code', async () => {
      expect(Currency.abs('-10.50', 'USD')).toBe('10.50');
      expect(Currency.abs('-100', 'JPY')).toBe('100');
      expect(Currency.abs('-10.123', 'BHD')).toBe('10.123');
    });
  });

  describe('format', () => {
    it('formats amount with currency symbol', async () => {
      const result = Currency.format('1234.56', 'USD', 'en-US');
      expect(result).toContain('1,234.56');
      expect(result).toContain('$');
    });

    it('uses fallback for invalid currency', async () => {
      const result = Currency.format('100', 'INVALID');
      expect(result).toContain('INVALID');
      expect(result).toContain('100');
    });
  });

  describe('parseInput', () => {
    it('parses valid input strings', async () => {
      expect(Currency.parseInput('10.50')).toBe('10.50');
      expect(Currency.parseInput('100')).toBe('100.00');
      expect(Currency.parseInput('-10.50')).toBe('-10.50');
    });

    it('cleans currency symbols and spaces', async () => {
      expect(Currency.parseInput('$10.50')).toBe('10.50');
      expect(Currency.parseInput('10 000.50')).toBe('10000.50');
      expect(Currency.parseInput('USD 100')).toBe('100.00');
    });

    it('returns null for invalid input', async () => {
      expect(Currency.parseInput('')).toBe(null);
      expect(Currency.parseInput('abc')).toBe(null);
      expect(Currency.parseInput(null)).toBe(null);
    });

    it('formats with currency code', async () => {
      expect(Currency.parseInput('100', 'USD')).toBe('100.00');
      expect(Currency.parseInput('100', 'JPY')).toBe('100');
      expect(Currency.parseInput('100', 'BHD')).toBe('100.000');
    });
  });

  describe('isValid', () => {
    it('validates correct amounts', async () => {
      expect(Currency.isValid('10.50')).toBe(true);
      expect(Currency.isValid(10.50)).toBe(true);
      expect(Currency.isValid('0')).toBe(true);
      expect(Currency.isValid('-10.50')).toBe(true);
    });

    it('invalidates incorrect amounts', async () => {
      expect(Currency.isValid('abc')).toBe(false);
      expect(Currency.isValid('')).toBe(false);
      expect(Currency.isValid(NaN)).toBe(false);
      expect(Currency.isValid(Infinity)).toBe(false);
    });

    it('invalidates non-string/non-number types', async () => {
      expect(Currency.isValid({})).toBe(false);
      expect(Currency.isValid([])).toBe(false);
      expect(Currency.isValid(() => {})).toBe(false);
      expect(Currency.isValid(Symbol('test'))).toBe(false);
    });
  });

  describe('getExchangeRate', () => {
    it('returns exchange rate for valid currency pair', async () => {
      expect(Currency.getExchangeRate('USD', 'EUR')).toBe('0.92');
      expect(Currency.getExchangeRate('USD', 'GBP')).toBe('0.79');
      expect(Currency.getExchangeRate('USD', 'JPY')).toBe('148.5');
    });

    it('returns 1.0 for same currency', async () => {
      expect(Currency.getExchangeRate('USD', 'USD')).toBe('1.0');
      expect(Currency.getExchangeRate('EUR', 'EUR')).toBe('1.0');
    });

    it('returns null for invalid or missing currency pairs', async () => {
      expect(Currency.getExchangeRate('USD', 'XYZ')).toBe(null);
      expect(Currency.getExchangeRate('XYZ', 'USD')).toBe(null);
      expect(Currency.getExchangeRate(null, 'USD')).toBe(null);
      expect(Currency.getExchangeRate('USD', null)).toBe(null);
      expect(Currency.getExchangeRate('', '')).toBe(null);
    });
  });

  describe('convertAmount', () => {
    it('converts amount using exchange rate', async () => {
      // 100 USD * 0.92 = 92 EUR
      expect(Currency.convertAmount('100', 'USD', 'EUR')).toBe('92.00');
      // 100 USD * 148.5 = 14850 JPY
      expect(Currency.convertAmount('100', 'USD', 'JPY')).toBe('14850');
    });

    it('returns same amount for same currency', async () => {
      expect(Currency.convertAmount('100', 'USD', 'USD')).toBe('100.00');
      expect(Currency.convertAmount('100', 'JPY', 'JPY')).toBe('100');
    });

    it('uses custom rate when provided', async () => {
      expect(Currency.convertAmount('100', 'USD', 'EUR', '0.95')).toBe('95.00');
      expect(Currency.convertAmount('100', 'USD', 'EUR', 1.0)).toBe('100.00');
    });

    it('returns null for invalid inputs', async () => {
      expect(Currency.convertAmount(null, 'USD', 'EUR')).toBe(null);
      expect(Currency.convertAmount('100', null, 'EUR')).toBe(null);
      expect(Currency.convertAmount('100', 'USD', null)).toBe(null);
      expect(Currency.convertAmount('', 'USD', 'EUR')).toBe(null);
    });

    it('returns null for unavailable rate', async () => {
      expect(Currency.convertAmount('100', 'XYZ', 'ABC')).toBe(null);
    });

    it('returns null for negative rate', async () => {
      // Note: 0 is falsy in JS, so it falls back to getExchangeRate, hence we only test negative
      expect(Currency.convertAmount('100', 'USD', 'EUR', '-1')).toBe(null);
      expect(Currency.convertAmount('100', 'USD', 'EUR', '-0.5')).toBe(null);
    });
  });

  describe('reverseConvert', () => {
    it('calculates source amount for desired destination', async () => {
      // To get 92 EUR, need 100 USD (92 / 0.92 = 100)
      expect(Currency.reverseConvert('92', 'USD', 'EUR')).toBe('100.00');
    });

    it('returns same amount for same currency', async () => {
      expect(Currency.reverseConvert('100', 'USD', 'USD')).toBe('100.00');
      expect(Currency.reverseConvert('100', 'JPY', 'JPY')).toBe('100');
    });

    it('uses custom rate when provided', async () => {
      expect(Currency.reverseConvert('95', 'USD', 'EUR', '0.95')).toBe('100.00');
    });

    it('returns null for invalid inputs', async () => {
      expect(Currency.reverseConvert(null, 'USD', 'EUR')).toBe(null);
      expect(Currency.reverseConvert('100', null, 'EUR')).toBe(null);
      expect(Currency.reverseConvert('100', 'USD', null)).toBe(null);
      expect(Currency.reverseConvert('', 'USD', 'EUR')).toBe(null);
    });

    it('returns null for unavailable rate', async () => {
      expect(Currency.reverseConvert('100', 'XYZ', 'ABC')).toBe(null);
    });

    it('returns null for negative rate', async () => {
      // Note: 0 is falsy in JS, so it falls back to getExchangeRate, hence we only test negative
      expect(Currency.reverseConvert('100', 'USD', 'EUR', '-1')).toBe(null);
      expect(Currency.reverseConvert('100', 'USD', 'EUR', '-0.5')).toBe(null);
    });
  });

  describe('invertRate', () => {
    it('inverts a rate with decimal precision (default 6 places)', () => {
      expect(Currency.invertRate('418.5')).toBe('0.002389');
      expect(Currency.invertRate('0.92')).toBe('1.086957');
      expect(Currency.invertRate('2')).toBe('0.500000');
    });

    it('honours a custom number of decimals', () => {
      expect(Currency.invertRate('3', 4)).toBe('0.3333');
      expect(Currency.invertRate('8', 2)).toBe('0.13');
    });

    it('accepts a numeric rate', () => {
      expect(Currency.invertRate(4)).toBe('0.250000');
    });

    it('returns null for non-positive or invalid rates', () => {
      expect(Currency.invertRate('0')).toBe(null);
      expect(Currency.invertRate('-2')).toBe(null);
      expect(Currency.invertRate(null)).toBe(null);
      expect(Currency.invertRate('abc')).toBe(null);
    });

    it('round-trips: inverting twice returns approximately the original', () => {
      const once = Currency.invertRate('418.5', 10);
      const twice = Currency.invertRate(once, 4);
      expect(twice).toBe('418.5000');
    });
  });

  describe('roundToNearest', () => {
    it('rounds down when below the half-way point', () => {
      expect(Currency.roundToNearest('1216', 100)).toBe('1200.00');
      expect(Currency.roundToNearest('149', 100)).toBe('100.00');
      expect(Currency.roundToNearest('14', 10)).toBe('10.00');
      expect(Currency.roundToNearest('2499', 1000)).toBe('2000.00');
    });

    it('rounds up when above the half-way point', () => {
      expect(Currency.roundToNearest('1260', 100)).toBe('1300.00');
      expect(Currency.roundToNearest('16', 10)).toBe('20.00');
      expect(Currency.roundToNearest('2600', 1000)).toBe('3000.00');
    });

    it('rounds half up (ties away from zero)', () => {
      expect(Currency.roundToNearest('150', 100)).toBe('200.00');
      expect(Currency.roundToNearest('2500', 1000)).toBe('3000.00');
      expect(Currency.roundToNearest('15', 10)).toBe('20.00');
    });

    it('formats with the currency decimal places when provided', () => {
      // AMD has 0 decimal places
      expect(Currency.roundToNearest('1216', 100, 'AMD')).toBe('1200');
      expect(Currency.roundToNearest('150', 100, 'AMD')).toBe('200');
      // USD has 2 decimal places
      expect(Currency.roundToNearest('1216', 100, 'USD')).toBe('1200.00');
    });

    it('leaves an already-multiple amount unchanged', () => {
      expect(Currency.roundToNearest('1200', 100)).toBe('1200.00');
      expect(Currency.roundToNearest('3000', 1000)).toBe('3000.00');
    });

    it('returns the amount unchanged for a falsy/invalid/non-positive step', () => {
      expect(Currency.roundToNearest('1216', 0)).toBe('1216.00');
      expect(Currency.roundToNearest('1216', null)).toBe('1216.00');
      expect(Currency.roundToNearest('1216', -100)).toBe('1216.00');
      expect(Currency.roundToNearest('1216.50', 0, 'USD')).toBe('1216.50');
    });
  });

  describe('roundToStep', () => {
    it("mode 'nearest' matches roundToNearest (ties up)", () => {
      expect(Currency.roundToStep('1216', 100, 'nearest')).toBe('1200.00');
      expect(Currency.roundToStep('1260', 100, 'nearest')).toBe('1300.00');
      expect(Currency.roundToStep('150', 100, 'nearest')).toBe('200.00');
      expect(Currency.roundToStep('2500', 1000, 'nearest')).toBe('3000.00');
    });

    it("defaults to 'nearest' when no mode is given", () => {
      expect(Currency.roundToStep('1216', 100)).toBe('1200.00');
      expect(Currency.roundToStep('1260', 100)).toBe('1300.00');
    });

    it("mode 'up' always rounds up to the next multiple", () => {
      expect(Currency.roundToStep('1201', 100, 'up')).toBe('1300.00');
      expect(Currency.roundToStep('1216', 100, 'up')).toBe('1300.00');
      expect(Currency.roundToStep('11', 10, 'up')).toBe('20.00');
      expect(Currency.roundToStep('2001', 1000, 'up')).toBe('3000.00');
    });

    it("mode 'down' always rounds down to the previous multiple", () => {
      expect(Currency.roundToStep('1299', 100, 'down')).toBe('1200.00');
      expect(Currency.roundToStep('1260', 100, 'down')).toBe('1200.00');
      expect(Currency.roundToStep('19', 10, 'down')).toBe('10.00');
      expect(Currency.roundToStep('2999', 1000, 'down')).toBe('2000.00');
    });

    it('leaves an already-multiple amount unchanged in every mode', () => {
      expect(Currency.roundToStep('1200', 100, 'nearest')).toBe('1200.00');
      expect(Currency.roundToStep('1200', 100, 'up')).toBe('1200.00');
      expect(Currency.roundToStep('1200', 100, 'down')).toBe('1200.00');
    });

    it('formats with the currency decimal places when provided', () => {
      // AMD has 0 decimal places
      expect(Currency.roundToStep('1201', 100, 'up', 'AMD')).toBe('1300');
      expect(Currency.roundToStep('1299', 100, 'down', 'AMD')).toBe('1200');
      // USD has 2 decimal places
      expect(Currency.roundToStep('1201', 100, 'up', 'USD')).toBe('1300.00');
    });

    it("falls back to 'nearest' for an unrecognized/null mode", () => {
      expect(Currency.roundToStep('1216', 100, 'sideways')).toBe('1200.00');
      expect(Currency.roundToStep('1260', 100, null)).toBe('1300.00');
      expect(Currency.roundToStep('150', 100, undefined)).toBe('200.00');
    });

    it('returns the amount unchanged for a falsy/invalid/non-positive step', () => {
      expect(Currency.roundToStep('1216', 0, 'up')).toBe('1216.00');
      expect(Currency.roundToStep('1216', null, 'down')).toBe('1216.00');
      expect(Currency.roundToStep('1216', -100, 'up')).toBe('1216.00');
    });
  });

  describe('isReasonableRate', () => {
    it('returns true for reasonable rates within 50% of expected', async () => {
      // Expected USD->EUR rate is 0.92
      expect(Currency.isReasonableRate('0.92', 'USD', 'EUR')).toBe(true);
      expect(Currency.isReasonableRate('1.0', 'USD', 'EUR')).toBe(true); // within 50%
      expect(Currency.isReasonableRate('0.80', 'USD', 'EUR')).toBe(true); // within 50%
    });

    it('returns false for unreasonable rates', async () => {
      // Expected USD->EUR rate is 0.92, so 0.1 is way outside 50% range
      expect(Currency.isReasonableRate('0.1', 'USD', 'EUR')).toBe(false);
      expect(Currency.isReasonableRate('5.0', 'USD', 'EUR')).toBe(false);
    });

    it('returns false for invalid inputs', async () => {
      expect(Currency.isReasonableRate(null, 'USD', 'EUR')).toBe(false);
      expect(Currency.isReasonableRate('0.92', null, 'EUR')).toBe(false);
      expect(Currency.isReasonableRate('0.92', 'USD', null)).toBe(false);
      expect(Currency.isReasonableRate('', 'USD', 'EUR')).toBe(false);
    });

    it('returns false for zero or negative rates', async () => {
      expect(Currency.isReasonableRate(0, 'USD', 'EUR')).toBe(false);
      expect(Currency.isReasonableRate(-1, 'USD', 'EUR')).toBe(false);
    });

    it('uses broad range check when expected rate unavailable', async () => {
      // No rate for XYZ->ABC, so uses 0.0001 to 10000 range
      expect(Currency.isReasonableRate('1.0', 'XYZ', 'ABC')).toBe(true);
      expect(Currency.isReasonableRate('100', 'XYZ', 'ABC')).toBe(true);
      expect(Currency.isReasonableRate('0.0001', 'XYZ', 'ABC')).toBe(true);
      expect(Currency.isReasonableRate('0.00001', 'XYZ', 'ABC')).toBe(false);
      expect(Currency.isReasonableRate('100000', 'XYZ', 'ABC')).toBe(false);
    });

    it('returns false for non-finite rates', async () => {
      expect(Currency.isReasonableRate(Infinity, 'USD', 'EUR')).toBe(false);
      expect(Currency.isReasonableRate(NaN, 'USD', 'EUR')).toBe(false);
    });
  });

  describe('getExchangeRatesLastUpdated', () => {
    it('returns the last updated date from exchange rates data', async () => {
      expect(Currency.getExchangeRatesLastUpdated()).toBe('2024-01-15T12:00:00Z');
    });
  });

  // Critical regression tests for financial accuracy
  describe('Regression Tests - Financial Accuracy', () => {
    it('summing 0.1 + 0.2 produces 0.30 not 0.30000000000000004 (#765)', async () => {
      // Native JS: 0.1 + 0.2 === 0.30000000000000004
      // Decimal.js via Currency.add must return '0.30'
      const result = Currency.add('0.1', '0.2');
      expect(result).toBe('0.30');
      expect(parseFloat(result)).toBe(0.3);
    });

    it('accumulating many small amounts via Currency.add stays exact (#765)', async () => {
      // Simulate the totalExpenses/totalIncome reduce pattern
      const amounts = ['0.10', '0.20', '0.30', '0.40'];
      const total = parseFloat(amounts.reduce((sum, amount) => Currency.add(sum, amount), '0'));
      expect(total).toBe(1.0);
    });

    it('handles repeated additions without accumulating errors', async () => {
      let sum = '0';
      for (let i = 0; i < 100; i++) {
        sum = Currency.add(sum, '0.01');
      }
      expect(sum).toBe('1.00');
    });

    it('handles large transactions accurately', async () => {
      expect(Currency.add('999999.99', '0.01')).toBe('1000000.00');
      expect(Currency.subtract('1000000.00', '999999.99')).toBe('0.01');
    });

    it('maintains precision through complex operations', async () => {
      // (100.00 + 50.50) * 2 - 25.25 = 275.75
      const step1 = Currency.add('100.00', '50.50');
      const step2 = Currency.multiply(step1, 2);
      const result = Currency.subtract(step2, '25.25');
      expect(result).toBe('275.75');
    });
  });
});
