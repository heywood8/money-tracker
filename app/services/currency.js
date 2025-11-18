/**
 * Currency utility functions for precise decimal arithmetic
 *
 * Financial calculations require precision. This module handles currency
 * operations using integer arithmetic (cents) to avoid floating-point errors.
 *
 * All amounts are stored as strings in the database but converted to cents
 * (integers) for calculations, then back to strings.
 */

/**
 * Convert a currency string to cents (integer)
 * @param {string|number} amount - Amount as string or number
 * @returns {number} Amount in cents (integer)
 */
export const toCents = (amount) => {
  if (typeof amount === 'number') {
    return Math.round(amount * 100);
  }
  const num = parseFloat(amount) || 0;
  return Math.round(num * 100);
};

/**
 * Convert cents (integer) to currency string
 * @param {number} cents - Amount in cents
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Amount as string with decimals
 */
export const fromCents = (cents, decimals = 2) => {
  const amount = cents / 100;
  return amount.toFixed(decimals);
};

/**
 * Add two currency amounts
 * @param {string|number} a - First amount
 * @param {string|number} b - Second amount
 * @returns {string} Result as string
 */
export const add = (a, b) => {
  const centsA = toCents(a);
  const centsB = toCents(b);
  return fromCents(centsA + centsB);
};

/**
 * Subtract two currency amounts
 * @param {string|number} a - First amount
 * @param {string|number} b - Second amount (subtracted from a)
 * @returns {string} Result as string
 */
export const subtract = (a, b) => {
  const centsA = toCents(a);
  const centsB = toCents(b);
  return fromCents(centsA - centsB);
};

/**
 * Multiply a currency amount by a factor
 * @param {string|number} amount - Amount to multiply
 * @param {number} factor - Multiplication factor
 * @returns {string} Result as string
 */
export const multiply = (amount, factor) => {
  const cents = toCents(amount);
  return fromCents(Math.round(cents * factor));
};

/**
 * Divide a currency amount by a divisor
 * @param {string|number} amount - Amount to divide
 * @param {number} divisor - Division divisor
 * @returns {string} Result as string
 */
export const divide = (amount, divisor) => {
  if (divisor === 0) {
    throw new Error('Division by zero');
  }
  const cents = toCents(amount);
  return fromCents(Math.round(cents / divisor));
};

/**
 * Compare two currency amounts
 * @param {string|number} a - First amount
 * @param {string|number} b - Second amount
 * @returns {number} -1 if a < b, 0 if a === b, 1 if a > b
 */
export const compare = (a, b) => {
  const centsA = toCents(a);
  const centsB = toCents(b);
  if (centsA < centsB) return -1;
  if (centsA > centsB) return 1;
  return 0;
};

/**
 * Check if amount is positive
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isPositive = (amount) => {
  return toCents(amount) > 0;
};

/**
 * Check if amount is negative
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isNegative = (amount) => {
  return toCents(amount) < 0;
};

/**
 * Check if amount is zero
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isZero = (amount) => {
  return toCents(amount) === 0;
};

/**
 * Get absolute value of amount
 * @param {string|number} amount
 * @returns {string}
 */
export const abs = (amount) => {
  const cents = toCents(amount);
  return fromCents(Math.abs(cents));
};

/**
 * Format amount for display with currency symbol
 * @param {string|number} amount
 * @param {string} currencyCode - Currency code (e.g., 'USD', 'EUR')
 * @param {string} locale - Locale for formatting (default: 'en-US')
 * @returns {string} Formatted string
 */
export const format = (amount, currencyCode = 'USD', locale = 'en-US') => {
  const num = parseFloat(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(num);
  } catch (error) {
    // Fallback if Intl is not available or currency code is invalid
    return `${currencyCode} ${fromCents(toCents(amount))}`;
  }
};

/**
 * Parse user input to currency string
 * Handles various input formats and returns normalized string
 * @param {string} input - User input
 * @returns {string|null} Normalized amount or null if invalid
 */
export const parseInput = (input) => {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Remove currency symbols, spaces, and other non-numeric characters except . and -
  const cleaned = input.replace(/[^0-9.-]/g, '');

  // Check if valid number
  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return null;
  }

  // Convert to cents and back to ensure precision
  return fromCents(toCents(num));
};

/**
 * Validate currency amount string
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isValid = (amount) => {
  if (typeof amount === 'number') {
    return !isNaN(amount) && isFinite(amount);
  }
  if (typeof amount === 'string') {
    const num = parseFloat(amount);
    return !isNaN(num) && isFinite(num);
  }
  return false;
};
