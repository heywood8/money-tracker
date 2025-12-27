/**
 * Utility functions for calculator operations
 */

/**
 * Check if a string contains a mathematical operation
 * @param {string} expr - Expression to check
 * @returns {boolean} True if expression contains +, -, ×, or ÷
 */
export function hasOperation(expr) {
  if (!expr || typeof expr !== 'string') return false;
  return /[+\-×÷]/.test(expr);
}

/**
 * Evaluate a mathematical expression
 * @param {string} expr - Expression to evaluate (e.g., "10+5", "100-20")
 * @returns {string|null} Evaluated result as string, or null if invalid
 */
export function evaluateExpression(expr) {
  if (!expr || expr.trim() === '') return null;

  try {
    // Replace '×' with '*' for multiplication and '÷' with '/' for division
    let sanitized = expr.replace(/×/g, '*').replace(/÷/g, '/');

    // Validate expression (only allow numbers, operators, and decimal points)
    if (!/^[0-9+\-*/.() ]+$/.test(sanitized)) {
      return null;
    }

    // Use Function constructor to safely evaluate (no access to external scope)
    // Note: This is safer than eval() but still requires validation above
    const result = Function('"use strict"; return (' + sanitized + ')')();

    if (isNaN(result) || !isFinite(result)) {
      return null;
    }

    // Round to 2 decimal places to avoid floating point issues
    return String(Math.round(result * 100) / 100);
  } catch (error) {
    return null;
  }
}
