/**
 * Tests for currency.js - Critical for financial accuracy
 * These tests ensure precise decimal arithmetic without floating-point errors
 */

import * as Currency from '../../app/services/currency';

describe('Currency Service', () => {
  describe('toCents', () => {
    it('converts string amounts to cents correctly', () => {
      expect(Currency.toCents('10.50')).toBe(1050);
      expect(Currency.toCents('0.01')).toBe(1);
      expect(Currency.toCents('100')).toBe(10000);
      expect(Currency.toCents('0')).toBe(0);
    });

    it('converts number amounts to cents correctly', () => {
      expect(Currency.toCents(10.50)).toBe(1050);
      expect(Currency.toCents(0.01)).toBe(1);
      expect(Currency.toCents(100)).toBe(10000);
      expect(Currency.toCents(0)).toBe(0);
    });

    it('handles negative amounts', () => {
      expect(Currency.toCents('-10.50')).toBe(-1050);
      expect(Currency.toCents(-10.50)).toBe(-1050);
    });

    it('handles invalid input gracefully', () => {
      expect(Currency.toCents('')).toBe(0);
      expect(Currency.toCents('invalid')).toBe(0);
      expect(Currency.toCents(null)).toBe(0);
    });

    it('rounds to nearest cent for precision issues', () => {
      expect(Currency.toCents(10.505)).toBe(1051); // Rounds up
      expect(Currency.toCents(10.504)).toBe(1050); // Rounds down
    });
  });

  describe('fromCents', () => {
    it('converts cents to currency string with 2 decimals', () => {
      expect(Currency.fromCents(1050)).toBe('10.50');
      expect(Currency.fromCents(1)).toBe('0.01');
      expect(Currency.fromCents(10000)).toBe('100.00');
      expect(Currency.fromCents(0)).toBe('0.00');
    });

    it('handles negative cents', () => {
      expect(Currency.fromCents(-1050)).toBe('-10.50');
    });

    it('supports custom decimal places', () => {
      expect(Currency.fromCents(1050, 0)).toBe('11');
      expect(Currency.fromCents(1050, 3)).toBe('10.500');
    });
  });

  describe('add', () => {
    it('adds two amounts correctly', () => {
      expect(Currency.add('10.50', '5.25')).toBe('15.75');
      expect(Currency.add('0.01', '0.02')).toBe('0.03');
      expect(Currency.add('100', '200')).toBe('300.00');
    });

    it('handles mixed string and number inputs', () => {
      expect(Currency.add('10.50', 5.25)).toBe('15.75');
      expect(Currency.add(10.50, '5.25')).toBe('15.75');
    });

    it('handles negative amounts', () => {
      expect(Currency.add('10.50', '-5.25')).toBe('5.25');
      expect(Currency.add('-10.50', '-5.25')).toBe('-15.75');
    });

    it('avoids floating-point precision errors', () => {
      // Classic JavaScript floating-point error: 0.1 + 0.2 = 0.30000000000000004
      expect(Currency.add('0.1', '0.2')).toBe('0.30');
      expect(Currency.add('10.1', '20.2')).toBe('30.30');
    });
  });

  describe('subtract', () => {
    it('subtracts two amounts correctly', () => {
      expect(Currency.subtract('10.50', '5.25')).toBe('5.25');
      expect(Currency.subtract('0.03', '0.01')).toBe('0.02');
      expect(Currency.subtract('300', '100')).toBe('200.00');
    });

    it('handles negative results', () => {
      expect(Currency.subtract('5.25', '10.50')).toBe('-5.25');
    });

    it('handles negative inputs', () => {
      expect(Currency.subtract('-10.50', '5.25')).toBe('-15.75');
      expect(Currency.subtract('10.50', '-5.25')).toBe('15.75');
    });

    it('avoids floating-point precision errors', () => {
      expect(Currency.subtract('0.3', '0.1')).toBe('0.20');
    });
  });

  describe('multiply', () => {
    it('multiplies amount by factor correctly', () => {
      expect(Currency.multiply('10.50', 2)).toBe('21.00');
      expect(Currency.multiply('5.00', 1.5)).toBe('7.50');
      expect(Currency.multiply('100', 0.1)).toBe('10.00');
    });

    it('handles zero and one', () => {
      expect(Currency.multiply('10.50', 0)).toBe('0.00');
      expect(Currency.multiply('10.50', 1)).toBe('10.50');
    });

    it('handles negative factors', () => {
      expect(Currency.multiply('10.50', -2)).toBe('-21.00');
    });

    it('rounds to nearest cent', () => {
      expect(Currency.multiply('10.00', 0.333)).toBe('3.33');
    });
  });

  describe('divide', () => {
    it('divides amount by divisor correctly', () => {
      expect(Currency.divide('21.00', 2)).toBe('10.50');
      expect(Currency.divide('10.00', 4)).toBe('2.50');
    });

    it('throws error on division by zero', () => {
      expect(() => Currency.divide('10.00', 0)).toThrow('Division by zero');
    });

    it('handles negative divisors', () => {
      expect(Currency.divide('10.00', -2)).toBe('-5.00');
    });

    it('rounds to nearest cent', () => {
      expect(Currency.divide('10.00', 3)).toBe('3.33');
    });
  });

  describe('compare', () => {
    it('compares two amounts correctly', () => {
      expect(Currency.compare('10.50', '5.25')).toBe(1); // a > b
      expect(Currency.compare('5.25', '10.50')).toBe(-1); // a < b
      expect(Currency.compare('10.50', '10.50')).toBe(0); // a === b
    });

    it('handles negative amounts', () => {
      expect(Currency.compare('-10.50', '-5.25')).toBe(-1); // -10.50 < -5.25
      expect(Currency.compare('0', '-5.25')).toBe(1); // 0 > -5.25
    });

    it('handles precision correctly', () => {
      // 10.51 cents vs 10.50 - note that 10.501 gets rounded to 10.50
      expect(Currency.compare('10.51', '10.50')).toBe(1);
      expect(Currency.compare('10.50', '10.51')).toBe(-1);
    });
  });

  describe('isPositive', () => {
    it('identifies positive amounts', () => {
      expect(Currency.isPositive('10.50')).toBe(true);
      expect(Currency.isPositive('0.01')).toBe(true);
    });

    it('identifies non-positive amounts', () => {
      expect(Currency.isPositive('0')).toBe(false);
      expect(Currency.isPositive('-10.50')).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('identifies negative amounts', () => {
      expect(Currency.isNegative('-10.50')).toBe(true);
      expect(Currency.isNegative('-0.01')).toBe(true);
    });

    it('identifies non-negative amounts', () => {
      expect(Currency.isNegative('0')).toBe(false);
      expect(Currency.isNegative('10.50')).toBe(false);
    });
  });

  describe('isZero', () => {
    it('identifies zero amounts', () => {
      expect(Currency.isZero('0')).toBe(true);
      expect(Currency.isZero('0.00')).toBe(true);
      expect(Currency.isZero(0)).toBe(true);
    });

    it('identifies non-zero amounts', () => {
      expect(Currency.isZero('0.01')).toBe(false);
      expect(Currency.isZero('-0.01')).toBe(false);
      expect(Currency.isZero('10.50')).toBe(false);
    });
  });

  describe('abs', () => {
    it('returns absolute value of positive amounts', () => {
      expect(Currency.abs('10.50')).toBe('10.50');
      expect(Currency.abs('0.01')).toBe('0.01');
    });

    it('returns absolute value of negative amounts', () => {
      expect(Currency.abs('-10.50')).toBe('10.50');
      expect(Currency.abs('-0.01')).toBe('0.01');
    });

    it('handles zero', () => {
      expect(Currency.abs('0')).toBe('0.00');
    });
  });

  describe('format', () => {
    it('formats amount with currency symbol', () => {
      const result = Currency.format('1234.56', 'USD', 'en-US');
      expect(result).toContain('1,234.56');
      expect(result).toContain('$');
    });

    it('uses fallback for invalid currency', () => {
      const result = Currency.format('100', 'INVALID');
      expect(result).toContain('INVALID');
      expect(result).toContain('100');
    });
  });

  describe('parseInput', () => {
    it('parses valid input strings', () => {
      expect(Currency.parseInput('10.50')).toBe('10.50');
      expect(Currency.parseInput('100')).toBe('100.00');
      expect(Currency.parseInput('-10.50')).toBe('-10.50');
    });

    it('cleans currency symbols and spaces', () => {
      expect(Currency.parseInput('$10.50')).toBe('10.50');
      expect(Currency.parseInput('10 000.50')).toBe('10000.50');
      expect(Currency.parseInput('USD 100')).toBe('100.00');
    });

    it('returns null for invalid input', () => {
      expect(Currency.parseInput('')).toBe(null);
      expect(Currency.parseInput('abc')).toBe(null);
      expect(Currency.parseInput(null)).toBe(null);
    });
  });

  describe('isValid', () => {
    it('validates correct amounts', () => {
      expect(Currency.isValid('10.50')).toBe(true);
      expect(Currency.isValid(10.50)).toBe(true);
      expect(Currency.isValid('0')).toBe(true);
      expect(Currency.isValid('-10.50')).toBe(true);
    });

    it('invalidates incorrect amounts', () => {
      expect(Currency.isValid('abc')).toBe(false);
      expect(Currency.isValid('')).toBe(false);
      expect(Currency.isValid(NaN)).toBe(false);
      expect(Currency.isValid(Infinity)).toBe(false);
    });
  });

  // Critical regression tests for financial accuracy
  describe('Regression Tests - Financial Accuracy', () => {
    it('handles repeated additions without accumulating errors', () => {
      let sum = '0';
      for (let i = 0; i < 100; i++) {
        sum = Currency.add(sum, '0.01');
      }
      expect(sum).toBe('1.00');
    });

    it('handles large transactions accurately', () => {
      expect(Currency.add('999999.99', '0.01')).toBe('1000000.00');
      expect(Currency.subtract('1000000.00', '999999.99')).toBe('0.01');
    });

    it('maintains precision through complex operations', () => {
      // (100.00 + 50.50) * 2 - 25.25 = 275.75
      const step1 = Currency.add('100.00', '50.50');
      const step2 = Currency.multiply(step1, 2);
      const result = Currency.subtract(step2, '25.25');
      expect(result).toBe('275.75');
    });
  });
});
