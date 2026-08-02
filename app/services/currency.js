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
  return currenciesData[currencyCode].decimal_digits ?? 2;
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
        console.warn(`[currency] toDecimal: non-finite value "${amount}" coerced to 0 — possible DB corruption`);
        return new Decimal(0);
      }
      return decimal;
    } catch (error) {
      console.warn(`[currency] toDecimal: failed to parse "${amount}", coerced to 0 — possible DB corruption`);
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
 * Format an amount for a currency, then drop a decimal part that is all zeros:
 * 98645.00 → "98645", 98645.50 → "98645.50".
 *
 * For places that print a PAIR of exact figures in tight space — a plan row's
 * "98645 / 100000" — where ".00 / .00" is four characters of nothing, twice, and
 * the difference decides whether the pair fits beside the row's name. Nothing is
 * rounded away: a real fractional part is kept in full.
 *
 * @param {Decimal|string|number} amount
 * @param {string|number} [currencyOrDecimals]
 * @returns {string}
 */
export const formatAmountTrimmed = (amount, currencyOrDecimals = 2) => {
  const formatted = formatAmount(amount, currencyOrDecimals);
  return formatted.replace(/\.0+$/, '');
};

// Thresholds for formatCompact, largest first, so the loop below picks the first
// unit whose magnitude the amount reaches.
const COMPACT_UNITS = [
  { suffix: 'B', divisor: 1e9 },
  { suffix: 'M', divisor: 1e6 },
  { suffix: 'K', divisor: 1e3 },
];

/**
 * Format an amount as a short magnitude for AGGREGATE figures — summary strips,
 * headers, totals — where space is tight and the minor units carry no decision
 * value: 842 → "842", 1575 → "1.58K", 98645 → "98.6K", 1240000 → "1.24M".
 *
 * Deliberately NOT for per-line amounts: an envelope's "98 645 / 100 000" is a
 * number the user compares against their own spending, and "99K / 100K" throws
 * away exactly the digits that make the comparison possible.
 *
 * Precision follows the leading digit rather than a fixed decimal count, so
 * every output is 3-4 significant characters wide regardless of magnitude
 * (a fixed 1 decimal would render 1.6K next to 986.5K, which don't align).
 *
 * @param {Decimal|string|number} amount - Amount to format
 * @returns {string} Compact representation, with a leading '-' for negatives
 */
export const formatCompact = (amount) => {
  const decimal = toDecimal(amount);
  const sign = decimal.isNegative() ? '-' : '';
  const magnitude = decimal.abs();
  const value = magnitude.toNumber();

  for (const { suffix, divisor } of COMPACT_UNITS) {
    if (value < divisor) continue;
    // Scaled with Decimal, not native division: 1575/1000 is a hair under 1.575
    // in binary, so Number#toFixed(2) rounds it DOWN to "1.57" while the
    // arbitrary-precision path gives the "1.58" a reader expects.
    const scaled = magnitude.div(divisor);
    const scaledValue = scaled.toNumber();
    // Keep roughly three significant digits: 1.24M, 12.4M, 124M.
    const decimals = scaledValue < 10 ? 2 : scaledValue < 100 ? 1 : 0;
    // Strip trailing zeros so 1.00M reads "1M" and 1.20M reads "1.2M". Anchored
    // on the decimal point: a bare integer (12000B, past the largest unit) must
    // keep its zeros.
    const text = scaled.toFixed(decimals).replace(/\.(\d*?)0+$/, (_, keep) => (keep ? `.${keep}` : ''));
    return `${sign}${text}${suffix}`;
  }

  return `${sign}${magnitude.toFixed(0)}`;
};

/**
 * How much of a target an actual figure covers, as a whole-number percentage:
 * 150 of 300 → "50%", 250 of 200 → "125%".
 *
 * For the headline figure of a budget row, which answers "how full is this
 * budget?" — so it is deliberately unbounded above: past the target it keeps
 * counting (348%) rather than saturating at 100%, because "over" and "three
 * times over" are not the same news.
 *
 * Whole percent, with one exception: a value that is near but not exactly at
 * the target never prints "100%". 99.6% would round up to a figure that says
 * the budget is exactly used, and 100.4% would round down to one that says it
 * is not over — and the row's colour, which switches at the target, would then
 * disagree with its own number. Those two land on 99% and 101% instead, so
 * "100%" means precisely at target and "over 100" means over.
 *
 * @param {Decimal|string|number} actual - What has been spent.
 * @param {Decimal|string|number} target - What was budgeted.
 * @returns {string|null} Percentage string, or null when the target is not a
 *   positive figure and there is therefore no fraction of it to state.
 */
export const formatFillPercent = (actual, target) => {
  const targetDecimal = toDecimal(target);
  if (!targetDecimal.isFinite() || targetDecimal.lessThanOrEqualTo(0)) {
    return null;
  }

  const exact = toDecimal(actual).dividedBy(targetDecimal).times(100);
  let rounded = exact.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (rounded.equals(100) && !exact.equals(100)) {
    rounded = new Decimal(exact.lessThan(100) ? 99 : 101);
  }
  return `${rounded.toFixed(0)}%`;
};

// Maps a rounding-mode name to the decimal.js rounding constant applied when
// dividing the amount by the step. Amounts are non-negative magnitudes here, so
// ROUND_UP/ROUND_DOWN (away from / toward zero) behave as ceil/floor.
const ROUNDING_MODE_MAP = {
  nearest: Decimal.ROUND_HALF_UP, // nearest multiple, ties up
  up: Decimal.ROUND_UP,           // always up to the next multiple
  down: Decimal.ROUND_DOWN,       // always down to the previous multiple
};

/**
 * Round an amount to a multiple of `step` (e.g. 10, 100, 1000) using the given
 * direction. Used to round the amount of operations created automatically from
 * bank notifications, per the account's rounding setting.
 *
 * With step 100:
 *   mode 'nearest' — 150 → 200, 1216 → 1200 (ties up)
 *   mode 'up'      — 1201 → 1300, 1200 → 1200
 *   mode 'down'    — 1299 → 1200, 1200 → 1200
 *
 * @param {string|number} amount - Amount to round
 * @param {number|string} step - Rounding step. A falsy, non-finite, or
 *   non-positive step returns the amount unchanged (just formatted).
 * @param {'nearest'|'up'|'down'} mode - Rounding direction. Anything unrecognized
 *   (including null/undefined) falls back to 'nearest'.
 * @param {string} currencyCode - Currency code for formatting the result (optional)
 * @returns {string} Rounded amount as string
 */
export const roundToStep = (amount, step, mode = 'nearest', currencyCode = null) => {
  const decimal = toDecimal(amount);
  const stepDecimal = toDecimal(step);

  if (!stepDecimal.isFinite() || stepDecimal.lessThanOrEqualTo(0)) {
    return currencyCode ? formatAmount(decimal, currencyCode) : decimal.toFixed(2);
  }

  const roundingMode = ROUNDING_MODE_MAP[mode] ?? Decimal.ROUND_HALF_UP;

  const rounded = decimal
    .dividedBy(stepDecimal)
    .toDecimalPlaces(0, roundingMode)
    .times(stepDecimal);

  if (currencyCode) {
    return formatAmount(rounded, currencyCode);
  }
  return rounded.toFixed(2);
};

/**
 * Round an amount to the nearest multiple of `step`, ties up. Thin wrapper over
 * {@link roundToStep} with mode 'nearest', kept for backward compatibility.
 *
 * @param {string|number} amount - Amount to round
 * @param {number|string} step - Rounding step
 * @param {string} currencyCode - Currency code for formatting the result (optional)
 * @returns {string} Rounded amount as string
 */
export const roundToNearest = (amount, step, currencyCode = null) =>
  roundToStep(amount, step, 'nearest', currencyCode);

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
 * Invert an exchange rate with decimal precision.
 *
 * Computing `1 / rate` in JavaScript floats loses precision (and violates the
 * decimal.js arithmetic convention used everywhere else here). This does the
 * division with Decimal so a foreign→account rate can be stored as the inverse
 * account→foreign rate without float error.
 *
 * @param {string|number} rate - rate to invert
 * @param {number} decimals - decimal places to keep (default 6, matching the
 *   precision used elsewhere for stored exchange rates)
 * @returns {string|null} the inverted rate as a string, or null when the input
 *   is not a positive, finite number
 */
export const invertRate = (rate, decimals = 6) => {
  try {
    const rateDecimal = toDecimal(rate);
    if (!rateDecimal.isFinite() || rateDecimal.lessThanOrEqualTo(0)) {
      return null;
    }
    return new Decimal(1).dividedBy(rateDecimal).toFixed(decimals);
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

// In-memory cache for live exchange rates (1-hour TTL)
const liveRateCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Clear the in-memory exchange rate cache (for testing)
 */
export const clearExchangeRateCache = () => {
  liveRateCache.clear();
};

/**
 * Fetch a live exchange rate between two currencies.
 * Tries primary CDN, then fallback CDN, then falls back to offline rates.
 *
 * @param {string} fromCurrency - Source currency code (e.g., 'USD')
 * @param {string} toCurrency - Destination currency code (e.g., 'EUR')
 * @returns {Promise<{rate: string|null, source: 'live'|'offline'|'none'}>}
 */
export const fetchLiveExchangeRate = async (fromCurrency, toCurrency) => {
  if (!fromCurrency || !toCurrency) {
    return { rate: null, source: 'none' };
  }

  if (fromCurrency === toCurrency) {
    return { rate: '1.0', source: 'live' };
  }

  const fromLower = fromCurrency.toLowerCase();
  const toLower = toCurrency.toLowerCase();

  // Check cache
  const cached = liveRateCache.get(fromLower);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    const rate = cached.rates[toLower];
    if (typeof rate === 'number' && rate > 0 && isFinite(rate)) {
      return { rate: rate.toString(), source: 'live' };
    }
  }

  // Try fetching from APIs
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromLower}.min.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${fromLower}.min.json`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data = await response.json();
      const rates = data[fromLower];
      if (rates && typeof rates === 'object') {
        const validatedRates = {};
        for (const [key, value] of Object.entries(rates)) {
          if (typeof value === 'number' && value > 0 && isFinite(value)) {
            validatedRates[key] = value;
          }
        }
        liveRateCache.set(fromLower, {
          rates: validatedRates,
          timestamp: Date.now(),
        });

        const rate = validatedRates[toLower];
        if (rate !== undefined) {
          return { rate: rate.toString(), source: 'live' };
        }
      }
    } catch {
      // Network error or timeout, try next URL
      continue;
    }
  }

  // Fallback to offline rates
  const offlineRate = getExchangeRate(fromCurrency, toCurrency);
  if (offlineRate) {
    return { rate: offlineRate, source: 'offline' };
  }

  return { rate: null, source: 'none' };
};
