/**
 * Currency utility functions for precise decimal arithmetic
 *
 * Financial calculations require precision. This module handles currency
 * operations using integer arithmetic (cents) to avoid floating-point errors.
 *
 * All amounts are stored as strings in the database but converted to cents
 * (integers) for calculations, then back to strings.
 */

import exchangeRatesData from '../../assets/exchange-rates.json';
import currenciesData from '../../assets/currencies.json';

/**
 * Get decimal places for a currency
 * @param {string} currencyCode - Currency code (e.g., 'USD', 'AMD')
 * @returns {number} Number of decimal places
 */
export const getDecimalPlaces = (currencyCode) => {
  if (!currencyCode || !currenciesData[currencyCode]) {
    console.debug('getDecimalPlaces: Defaulting to 2 decimals for currencyCode:', currencyCode);
    return 2; // Default to 2 decimal places
  }

  const decimalDigits = currenciesData[currencyCode].decimal_digits ?? 2; // Use nullish coalescing operator
  return decimalDigits;
};

/**
 * Convert a currency string to smallest unit (e.g., cents for USD, fils for AMD)
 * @param {string|number} amount - Amount as string or number
 * @param {string} currencyCode - Currency code (optional, defaults to 2 decimals)
 * @returns {number} Amount in smallest unit (integer)
 */
export const toCents = (amount, currencyCode = null) => {
  const decimals = currencyCode ? getDecimalPlaces(currencyCode) : 2;
  const multiplier = Math.pow(10, decimals);

  if (typeof amount === 'number') {
    return Math.round(amount * multiplier);
  }

  if (!currencyCode) {
    // Assume the amount is already in the smallest unit if no currency code is provided
    console.debug('toCents: No currency code provided, assuming amount is in smallest unit:', amount);
    return Math.round(parseFloat(amount) || 0);
  }

  // Ensure amount is parsed correctly
  const num = parseFloat(amount);
  if (isNaN(num)) {
    console.debug('toCents: Invalid amount provided, defaulting to 0:', amount);
    return 0;
  }
  return Math.round(num * multiplier);
};

/**
 * Convert smallest unit to currency string
 * @param {number} cents - Amount in smallest unit
 * @param {number|string} decimalsOrCurrency - Number of decimal places (for formatting only) or currency code (for currency-aware conversion)
 * @returns {string} Amount as string with decimals
 */
export const fromCents = (cents, decimalsOrCurrency = 2) => {
  // For backward compatibility: when a number is passed, always divide by 100 (default cents behavior)
  // and use the number only for formatting
  if (typeof decimalsOrCurrency === 'number') {
    const amount = cents / 100;
    return amount.toFixed(decimalsOrCurrency);
  }

  // When a currency code string is passed, use currency-specific decimal places
  if (typeof decimalsOrCurrency === 'string') {
    const decimals = getDecimalPlaces(decimalsOrCurrency);
    const divisor = Math.pow(10, decimals);
    const amount = cents / divisor;
    return amount.toFixed(decimals);
  }

  // Default: divide by 100 and format with 2 decimals
  const amount = cents / 100;
  return amount.toFixed(2);
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

  if (typeof a === 'number' && typeof b === 'number') {
    // Assume inputs are already in the smallest unit
    console.debug('Currency.add: Inputs are in smallest unit:', { a, b });
    return a + b; // Return as number, no formatting
  }

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
    return fromCents(toCents(amount, fromCurrency), fromCurrency);
  }

  // Get exchange rate
  const rate = customRate || getExchangeRate(fromCurrency, toCurrency);
  if (!rate) {
    return null;
  }

  // Convert amount to source currency's smallest unit
  const sourceUnits = toCents(amount, fromCurrency);

  // Apply exchange rate
  const rateFloat = parseFloat(rate);
  if (isNaN(rateFloat) || rateFloat <= 0) {
    return null;
  }

  // Calculate destination amount in smallest units
  const destDecimals = getDecimalPlaces(toCurrency);
  const destMultiplier = Math.pow(10, destDecimals);
  const sourceDecimals = getDecimalPlaces(fromCurrency);
  const sourceMultiplier = Math.pow(10, sourceDecimals);

  // Convert: (sourceUnits / sourceMultiplier) * rate * destMultiplier
  const destUnits = Math.round((sourceUnits / sourceMultiplier) * rateFloat * destMultiplier);

  // Convert back to string with proper decimals
  return fromCents(destUnits, toCurrency);
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
    return fromCents(toCents(destinationAmount, toCurrency), fromCurrency);
  }

  // Get exchange rate
  const rate = customRate || getExchangeRate(fromCurrency, toCurrency);
  if (!rate) {
    return null;
  }

  const rateFloat = parseFloat(rate);
  if (isNaN(rateFloat) || rateFloat <= 0) {
    return null;
  }

  // Convert destination amount to smallest unit
  const destUnits = toCents(destinationAmount, toCurrency);

  // Calculate source amount: destinationAmount / rate
  const destDecimals = getDecimalPlaces(toCurrency);
  const destMultiplier = Math.pow(10, destDecimals);
  const sourceDecimals = getDecimalPlaces(fromCurrency);
  const sourceMultiplier = Math.pow(10, sourceDecimals);

  // Convert: (destUnits / destMultiplier) / rate * sourceMultiplier
  const sourceUnits = Math.round((destUnits / destMultiplier) / rateFloat * sourceMultiplier);

  // Convert back to string with proper decimals
  return fromCents(sourceUnits, fromCurrency);
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

  const rateFloat = parseFloat(rate);

  // Rate must be positive and finite
  if (isNaN(rateFloat) || rateFloat <= 0 || !isFinite(rateFloat)) {
    return false;
  }

  // Get the expected rate from offline data
  const expectedRate = getExchangeRate(fromCurrency, toCurrency);
  if (!expectedRate) {
    // If we don't have expected rate, just check if it's within a very broad range
    // (between 0.0001 and 10000 to catch obvious errors)
    return rateFloat >= 0.0001 && rateFloat <= 10000;
  }

  const expectedFloat = parseFloat(expectedRate);

  // Allow up to 50% deviation from expected rate (to account for market fluctuations
  // or manual rate adjustments, while still catching obvious mistakes)
  const minAcceptable = expectedFloat * 0.5;
  const maxAcceptable = expectedFloat * 1.5;

  return rateFloat >= minAcceptable && rateFloat <= maxAcceptable;
};

/**
 * Get the last update date of exchange rates
 * @returns {string} ISO date string
 */
export const getExchangeRatesLastUpdated = () => {
  return exchangeRatesData.lastUpdated;
};
