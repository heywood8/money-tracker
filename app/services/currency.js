/**
 * Currency utility functions for precise decimal arithmetic
 *
 * Financial calculations require precision. This module uses decimal.js
 * for arbitrary-precision decimal arithmetic to avoid floating-point errors.
 *
 * All amounts are stored as strings in the database and handled as Decimal
 * objects during calculations.
 */

import Decimal from 'decimal.js';
import exchangeRatesData from '../../assets/exchange-rates.json';
import currenciesData from '../../assets/currencies.json';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20,           // High precision for financial calculations
  rounding: Decimal.ROUND_HALF_UP, // Banker's rounding
  toExpNeg: -9,           // Format numbers with more than 9 decimal places in exponential notation
  toExpPos: 9,
});

/**
 * Get decimal places for a currency
 * @param {string} currencyCode - Currency code (e.g., 'USD', 'AMD')
 * @returns {number} Number of decimal places
 */
export const getDecimalPlaces = (currencyCode) => {
  if (!currencyCode || !currenciesData[currencyCode]) {
    return 2; // Default to 2 decimal places
  }
  return currenciesData[currencyCode].decimal_digits || 2;
};

/**
 * Normalize amount to Decimal object
 * @param {string|number|Decimal} amount - Amount as string, number, or Decimal
 * @returns {Decimal} Amount as Decimal object
 */
const toDecimal = (amount) => {
  if (amount instanceof Decimal) {
    return amount;
  }
  
  // Handle various invalid inputs
  if (amount === null || amount === undefined || amount === '') {
    return new Decimal(0);
  }
  
  if (typeof amount === 'string' || typeof amount === 'number') {
    try {
      const decimal = new Decimal(amount);
      // Check if the result is a valid finite number
      if (!decimal.isFinite()) {
        return new Decimal(0);
      }
      return decimal;
    } catch (error) {
      return new Decimal(0);
    }
  }
  
  return new Decimal(0);
};

/**
 * Format amount as string with specified decimal places
 * @param {Decimal|string|number} amount - Amount to format
 * @param {string|number} currencyOrDecimals - Currency code or number of decimal places
 * @returns {string} Formatted amount string
 */
export const formatAmount = (amount, currencyOrDecimals = 2) => {
  const decimal = toDecimal(amount);
  
  // Determine decimal places
  let decimals;
  if (typeof currencyOrDecimals === 'string') {
    decimals = getDecimalPlaces(currencyOrDecimals);
  } else {
    decimals = currencyOrDecimals;
  }
  
  const formatted = decimal.toFixed(decimals);
  
  // Strip unnecessary zeros and decimal point if decimals is 0
  if (decimals === 0) {
    return formatted.replace(/\.0+$/, '');
  }
  
  return formatted;
};

/**
 * Legacy toCents function - kept for backward compatibility
 * Converts amount to smallest unit (cents) as integer
 * @param {string|number} amount - Amount as string or number
 * @param {string} currencyCode - Currency code (optional, defaults to 2 decimals)
 * @returns {number} Amount in smallest unit (integer)
 */
export const toCents = (amount, currencyCode = null) => {
  const decimals = currencyCode ? getDecimalPlaces(currencyCode) : 2;
  const decimal = toDecimal(amount);
  const multiplier = new Decimal(10).pow(decimals);
  return decimal.times(multiplier).round().toNumber();
};

/**
 * Legacy fromCents function - kept for backward compatibility
 * Convert smallest unit to currency string
 * @param {number} cents - Amount in smallest unit
 * @param {number|string} decimalsOrCurrency - Number of decimal places or currency code
 * @returns {string} Amount as string with decimals
 */
export const fromCents = (cents, decimalsOrCurrency = 2) => {
  // For backward compatibility: when a number is passed, always divide by 100 (default cents behavior)
  // and use the number only for formatting
  if (typeof decimalsOrCurrency === 'number') {
    const divisor = new Decimal(100);
    const amount = new Decimal(cents).dividedBy(divisor);
    return amount.toFixed(decimalsOrCurrency);
  }
  
  // When a currency code string is passed, use currency-specific decimal places
  if (typeof decimalsOrCurrency === 'string') {
    const decimals = getDecimalPlaces(decimalsOrCurrency);
    const divisor = new Decimal(10).pow(decimals);
    const amount = new Decimal(cents).dividedBy(divisor);
    return amount.toFixed(decimals);
  }
  
  // Default: divide by 100 and format with 2 decimals
  const divisor = new Decimal(100);
  const amount = new Decimal(cents).dividedBy(divisor);
  return amount.toFixed(2);
};

/**
 * Add two currency amounts
 * @param {string|number} a - First amount
 * @param {string|number} b - Second amount
 * @param {string} currencyCode - Currency code for formatting (optional)
 * @returns {string} Result as string
 */
export const add = (a, b, currencyCode = null) => {
  const decimalA = toDecimal(a);
  const decimalB = toDecimal(b);
  const result = decimalA.plus(decimalB);
  
  if (currencyCode) {
    return formatAmount(result, currencyCode);
  }
  return result.toFixed(2);
};

/**
 * Subtract two currency amounts
 * @param {string|number} a - First amount
 * @param {string|number} b - Second amount (subtracted from a)
 * @param {string} currencyCode - Currency code for formatting (optional)
 * @returns {string} Result as string
 */
export const subtract = (a, b, currencyCode = null) => {
  const decimalA = toDecimal(a);
  const decimalB = toDecimal(b);
  const result = decimalA.minus(decimalB);
  
  if (currencyCode) {
    return formatAmount(result, currencyCode);
  }
  return result.toFixed(2);
};

/**
 * Multiply a currency amount by a factor
 * @param {string|number} amount - Amount to multiply
 * @param {number} factor - Multiplication factor
 * @param {string} currencyCode - Currency code for formatting (optional)
 * @returns {string} Result as string
 */
export const multiply = (amount, factor, currencyCode = null) => {
  const decimal = toDecimal(amount);
  const result = decimal.times(factor);
  
  if (currencyCode) {
    return formatAmount(result, currencyCode);
  }
  return result.toFixed(2);
};

/**
 * Divide a currency amount by a divisor
 * @param {string|number} amount - Amount to divide
 * @param {number} divisor - Division divisor
 * @param {string} currencyCode - Currency code for formatting (optional)
 * @returns {string} Result as string
 */
export const divide = (amount, divisor, currencyCode = null) => {
  if (divisor === 0) {
    throw new Error('Division by zero');
  }
  const decimal = toDecimal(amount);
  const result = decimal.dividedBy(divisor);
  
  if (currencyCode) {
    return formatAmount(result, currencyCode);
  }
  return result.toFixed(2);
};

/**
 * Compare two currency amounts
 * @param {string|number} a - First amount
 * @param {string|number} b - Second amount
 * @returns {number} -1 if a < b, 0 if a === b, 1 if a > b
 */
export const compare = (a, b) => {
  const decimalA = toDecimal(a);
  const decimalB = toDecimal(b);
  return decimalA.comparedTo(decimalB);
};

/**
 * Check if amount is positive
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isPositive = (amount) => {
  return toDecimal(amount).greaterThan(0);
};

/**
 * Check if amount is negative
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isNegative = (amount) => {
  return toDecimal(amount).lessThan(0);
};

/**
 * Check if amount is zero
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isZero = (amount) => {
  return toDecimal(amount).isZero();
};

/**
 * Get absolute value of amount
 * @param {string|number} amount
 * @param {string} currencyCode - Currency code for formatting (optional)
 * @returns {string}
 */
export const abs = (amount, currencyCode = null) => {
  const result = toDecimal(amount).abs();
  
  if (currencyCode) {
    return formatAmount(result, currencyCode);
  }
  return result.toFixed(2);
};

/**
 * Format amount for display with currency symbol
 * @param {string|number} amount
 * @param {string} currencyCode - Currency code (e.g., 'USD', 'EUR')
 * @param {string} locale - Locale for formatting (default: 'en-US')
 * @returns {string} Formatted string
 */
export const format = (amount, currencyCode = 'USD', locale = 'en-US') => {
  const decimal = toDecimal(amount);
  const num = decimal.toNumber();
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(num);
  } catch (error) {
    // Fallback if Intl is not available or currency code is invalid
    const decimals = getDecimalPlaces(currencyCode);
    return `${currencyCode} ${decimal.toFixed(decimals)}`;
  }
};

/**
 * Parse user input to currency string
 * Handles various input formats and returns normalized string
 * @param {string} input - User input
 * @param {string} currencyCode - Currency code for formatting (optional)
 * @returns {string|null} Normalized amount or null if invalid
 */
export const parseInput = (input, currencyCode = null) => {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Remove currency symbols, spaces, and other non-numeric characters except . and -
  const cleaned = input.replace(/[^0-9.-]/g, '');

  try {
    const decimal = new Decimal(cleaned);
    
    if (currencyCode) {
      return formatAmount(decimal, currencyCode);
    }
    return decimal.toFixed(2);
  } catch (error) {
    return null;
  }
};

/**
 * Validate currency amount string
 * @param {string|number} amount
 * @returns {boolean}
 */
export const isValid = (amount) => {
  // Reject null, undefined, empty string, and non-numeric strings
  if (amount === null || amount === undefined || amount === '') {
    return false;
  }
  
  // Handle special number cases
  if (typeof amount === 'number') {
    return !isNaN(amount) && isFinite(amount);
  }
  
  // For strings, try to parse and verify it's actually a number
  if (typeof amount === 'string') {
    // Check if string contains only valid number characters
    const cleaned = amount.trim();
    if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) {
      return false;
    }
    
    try {
      const decimal = new Decimal(cleaned);
      return decimal.isFinite();
    } catch (error) {
      return false;
    }
  }
  
  return false;
};

/**
 * Get exchange rate between two currencies from offline data
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Destination currency code
 * @returns {string|null} Exchange rate as string, or null if not found
 */
export const getExchangeRate = (fromCurrency, toCurrency) => {
  if (!fromCurrency || !toCurrency) {
    return null;
  }

  // Same currency = rate of 1
  if (fromCurrency === toCurrency) {
    return '1.0';
  }

  // Look up rate in offline data
  if (
    exchangeRatesData.rates[fromCurrency] &&
    exchangeRatesData.rates[fromCurrency][toCurrency]
  ) {
    return exchangeRatesData.rates[fromCurrency][toCurrency].toString();
  }

  return null;
};

/**
 * Convert amount from one currency to another
 * @param {string|number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Destination currency code
 * @param {string|number} customRate - Optional custom exchange rate (if not provided, uses offline data)
 * @returns {string|null} Converted amount as string, or null if conversion failed
 */
export const convertAmount = (amount, fromCurrency, toCurrency, customRate = null) => {
  if (!amount || !fromCurrency || !toCurrency) {
    return null;
  }

  // Same currency = no conversion needed
  if (fromCurrency === toCurrency) {
    return formatAmount(amount, toCurrency);
  }

  // Get exchange rate
  const rate = customRate || getExchangeRate(fromCurrency, toCurrency);
  if (!rate) {
    return null;
  }

  try {
    const amountDecimal = toDecimal(amount);
    const rateDecimal = toDecimal(rate);
    
    if (rateDecimal.lessThanOrEqualTo(0)) {
      return null;
    }

    // Convert: amount * rate
    const result = amountDecimal.times(rateDecimal);
    
    // Format with destination currency's decimal places
    return formatAmount(result, toCurrency);
  } catch (error) {
    return null;
  }
};

/**
 * Calculate the source amount needed to get a specific destination amount
 * @param {string|number} destinationAmount - Desired amount in destination currency
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Destination currency code
 * @param {string|number} customRate - Optional custom exchange rate
 * @returns {string|null} Required source amount as string, or null if calculation failed
 */
export const reverseConvert = (destinationAmount, fromCurrency, toCurrency, customRate = null) => {
  if (!destinationAmount || !fromCurrency || !toCurrency) {
    return null;
  }

  // Same currency = no conversion needed
  if (fromCurrency === toCurrency) {
    return formatAmount(destinationAmount, fromCurrency);
  }

  // Get exchange rate
  const rate = customRate || getExchangeRate(fromCurrency, toCurrency);
  if (!rate) {
    return null;
  }

  try {
    const destDecimal = toDecimal(destinationAmount);
    const rateDecimal = toDecimal(rate);
    
    if (rateDecimal.lessThanOrEqualTo(0)) {
      return null;
    }

    // Calculate source amount: destinationAmount / rate
    const result = destDecimal.dividedBy(rateDecimal);
    
    // Format with source currency's decimal places
    return formatAmount(result, fromCurrency);
  } catch (error) {
    return null;
  }
};

/**
 * Validate that an exchange rate is reasonable
 * @param {string|number} rate - Exchange rate to validate
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Destination currency code
 * @returns {boolean} True if rate is reasonable
 */
export const isReasonableRate = (rate, fromCurrency, toCurrency) => {
  if (!rate || !fromCurrency || !toCurrency) {
    return false;
  }

  try {
    const rateDecimal = toDecimal(rate);

    // Rate must be positive and finite
    if (!rateDecimal.isFinite() || rateDecimal.lessThanOrEqualTo(0)) {
      return false;
    }

    // Get the expected rate from offline data
    const expectedRate = getExchangeRate(fromCurrency, toCurrency);
    if (!expectedRate) {
      // If we don't have expected rate, just check if it's within a very broad range
      // (between 0.0001 and 10000 to catch obvious errors)
      return rateDecimal.greaterThanOrEqualTo(0.0001) && rateDecimal.lessThanOrEqualTo(10000);
    }

    const expectedDecimal = toDecimal(expectedRate);

    // Allow up to 50% deviation from expected rate (to account for market fluctuations
    // or manual rate adjustments, while still catching obvious mistakes)
    const minAcceptable = expectedDecimal.times(0.5);
    const maxAcceptable = expectedDecimal.times(1.5);

    return rateDecimal.greaterThanOrEqualTo(minAcceptable) && 
           rateDecimal.lessThanOrEqualTo(maxAcceptable);
  } catch (error) {
    return false;
  }
};

/**
 * Get the last update date of exchange rates
 * @returns {string} ISO date string
 */
export const getExchangeRatesLastUpdated = () => {
  return exchangeRatesData.lastUpdated;
};
