import { hasOperation, evaluateExpression } from '../../app/utils/calculatorUtils';

describe('calculatorUtils', () => {
  describe('hasOperation', () => {
    it('should return true for expressions with addition', () => {
      expect(hasOperation('10+5')).toBe(true);
    });

    it('should return true for expressions with subtraction', () => {
      expect(hasOperation('100-20')).toBe(true);
    });

    it('should return true for expressions with multiplication', () => {
      expect(hasOperation('5×3')).toBe(true);
    });

    it('should return true for expressions with division', () => {
      expect(hasOperation('100÷4')).toBe(true);
    });

    it('should return false for simple numbers', () => {
      expect(hasOperation('123')).toBe(false);
      expect(hasOperation('45.67')).toBe(false);
    });

    it('should return false for empty or null values', () => {
      expect(hasOperation('')).toBe(false);
      expect(hasOperation(null)).toBe(false);
      expect(hasOperation(undefined)).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(hasOperation(123)).toBe(false);
    });
  });

  describe('evaluateExpression', () => {
    it('should evaluate addition correctly', () => {
      expect(evaluateExpression('10+5')).toBe('15');
      expect(evaluateExpression('100+50.5')).toBe('150.5');
    });

    it('should evaluate subtraction correctly', () => {
      expect(evaluateExpression('100-20')).toBe('80');
      expect(evaluateExpression('50.5-10.25')).toBe('40.25');
    });

    it('should evaluate multiplication correctly', () => {
      expect(evaluateExpression('5×3')).toBe('15');
      expect(evaluateExpression('2.5×4')).toBe('10');
    });

    it('should evaluate division correctly', () => {
      expect(evaluateExpression('100÷4')).toBe('25');
      expect(evaluateExpression('50÷2')).toBe('25');
    });

    it('should evaluate complex expressions', () => {
      expect(evaluateExpression('10+5×2')).toBe('20');
      expect(evaluateExpression('(10+5)×2')).toBe('30');
      expect(evaluateExpression('100-20+5')).toBe('85');
    });

    it('should handle decimal results with rounding', () => {
      expect(evaluateExpression('10÷3')).toBe('3.33');
      expect(evaluateExpression('7÷2')).toBe('3.5');
    });

    it('should return null for invalid expressions', () => {
      expect(evaluateExpression('')).toBe(null);
      expect(evaluateExpression('abc')).toBe(null);
      expect(evaluateExpression('10+')).toBe(null);
    });

    it('should return null for division by zero', () => {
      const result = evaluateExpression('10÷0');
      expect(result).toBe(null); // Infinity is not finite
    });

    it('should handle simple numbers without operations', () => {
      expect(evaluateExpression('123')).toBe('123');
      expect(evaluateExpression('45.67')).toBe('45.67');
    });

    it('should handle negative numbers', () => {
      expect(evaluateExpression('-10')).toBe('-10');
      expect(evaluateExpression('10-15')).toBe('-5');
    });
  });

  describe('Regression Tests', () => {
    it('should evaluate expression before saving operation', () => {
      // Simulate user entering "10+5" and clicking category
      const expression = '10+5';
      expect(hasOperation(expression)).toBe(true);

      const evaluated = evaluateExpression(expression);
      expect(evaluated).toBe('15');

      // This is what should be saved to the database
      expect(parseFloat(evaluated)).toBe(15);
    });

    it('should handle calculator expression with multiple operations', () => {
      const expression = '100-20+30';
      expect(hasOperation(expression)).toBe(true);

      const evaluated = evaluateExpression(expression);
      expect(evaluated).toBe('110');
    });

    it('should not modify simple amounts', () => {
      const expression = '50';
      expect(hasOperation(expression)).toBe(false);

      // Even if we evaluate, it should return the same value
      const evaluated = evaluateExpression(expression);
      expect(evaluated).toBe('50');
    });

    it('should integrate with Currency.formatAmount correctly', () => {
      const Currency = require('../../app/services/currency');

      // Test that unevaluated expression would fail
      const expression = '10+5';
      const evaluated = evaluateExpression(expression);

      // The evaluated result should format correctly
      const formatted = Currency.formatAmount(evaluated, 'AMD');
      expect(formatted).toBe('15'); // AMD has 0 decimal places

      // While the unevaluated expression would format as 0 (error case)
      const badFormatted = Currency.formatAmount(expression, 'AMD');
      expect(badFormatted).toBe('0'); // This is why we need to evaluate first!
    });
  });
});
