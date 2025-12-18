/**
 * ARCA Bank Notification Parser
 * Parses transaction notifications from ARCA bank
 *
 * Example notification:
 * Title: "ARCA transactions"
 * Body: "PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD"
 */

/**
 * Normalize merchant name
 * @param {string} merchantName - Raw merchant name
 * @returns {string} Normalized merchant name
 */
const normalizeMerchantName = (merchantName) => {
  if (!merchantName) return '';

  // Trim whitespace and commas
  let normalized = merchantName.trim().replace(/,\s*$/, '').trim();

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
};

/**
 * Parse amount from string (e.g., "1,300.00 AMD")
 * @param {string} amountStr - Amount string
 * @returns {Object} { amount: string, currency: string }
 */
const parseAmount = (amountStr) => {
  if (!amountStr) return { amount: null, currency: null };

  const trimmed = amountStr.trim();

  // Match amount with optional thousands separator and currency
  // Examples: "1,300.00 AMD", "1300.00 AMD", "1.300,00 EUR"
  const match = trimmed.match(/^([\d,]+\.?\d*)\s*([A-Z]{3})?$/);

  if (!match) return { amount: null, currency: null };

  // Remove thousands separators (commas) and parse
  const amount = match[1].replace(/,/g, '');
  const currency = match[2] || null;

  return { amount, currency };
};

/**
 * Parse date from DD.MM.YYYY HH:mm format
 * @param {string} dateStr - Date string
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // Match DD.MM.YYYY HH:mm format
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);

  if (!match) return null;

  const [, day, month, year] = match;

  // Return YYYY-MM-DD format
  return `${year}-${month}-${day}`;
};

/**
 * Parse card mask from string (e.g., "4083***7027,")
 * @param {string} cardStr - Card mask string
 * @returns {string|null} Card mask
 */
const parseCardMask = (cardStr) => {
  if (!cardStr) return null;

  // Trim and remove trailing comma
  const trimmed = cardStr.trim().replace(/,\s*$/, '');

  // Match card mask pattern (4 digits, ***, 4 digits)
  const match = trimmed.match(/^(\d{4}\*+\d{4})$/);

  return match ? match[1] : trimmed;
};

/**
 * Determine transaction type from ARCA transaction code
 * @param {string} transactionType - ARCA transaction type (e.g., "PRE-PURCHASE", "PURCHASE")
 * @returns {string} Normalized type: 'expense', 'income', or 'transfer'
 */
const normalizeTransactionType = (transactionType) => {
  if (!transactionType) return 'expense';

  const type = transactionType.toUpperCase().trim();

  // Most transaction types are expenses
  if (type.includes('PURCHASE') || type.includes('PAYMENT') || type.includes('WITHDRAWAL')) {
    return 'expense';
  }

  // Income types
  if (type.includes('REFUND') || type.includes('DEPOSIT') || type.includes('CREDIT')) {
    return 'income';
  }

  // Transfer types
  if (type.includes('TRANSFER')) {
    return 'transfer';
  }

  // Default to expense
  return 'expense';
};

/**
 * Parse ARCA bank notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {Object|null} Parsed notification data or null if parsing fails
 */
export const parse = (title, body) => {
  if (!body) return null;

  // ARCA notifications are pipe-separated
  // Format: "TYPE | AMOUNT | CARD | MERCHANT | DATE | BALANCE"
  const parts = body.split('|').map(p => p.trim());

  if (parts.length < 5) {
    console.warn('ARCA notification has unexpected format:', body);
    return null;
  }

  const [transactionTypeRaw, amountRaw, cardRaw, merchantRaw, dateRaw, ...rest] = parts;

  // Parse amount and currency
  const { amount, currency } = parseAmount(amountRaw);

  if (!amount || !currency) {
    console.warn('Failed to parse amount or currency from:', amountRaw);
    return null;
  }

  // Parse date
  const date = parseDate(dateRaw);

  if (!date) {
    console.warn('Failed to parse date from:', dateRaw);
    return null;
  }

  // Parse card mask
  const cardMask = parseCardMask(cardRaw);

  // Parse merchant name
  const merchantName = normalizeMerchantName(merchantRaw);

  // Parse balance (if present)
  let balance = null;
  let balanceCurrency = null;

  if (rest.length > 0) {
    const balanceStr = rest.join('|').trim();
    const balanceMatch = balanceStr.match(/BALANCE:\s*([\d,]+\.?\d*)\s*([A-Z]{3})?/);

    if (balanceMatch) {
      balance = balanceMatch[1].replace(/,/g, '');
      balanceCurrency = balanceMatch[2] || currency;
    }
  }

  // Determine transaction type
  const type = normalizeTransactionType(transactionTypeRaw);

  return {
    type,
    amount,
    currency,
    cardMask,
    merchantName,
    date,
    balance,
    balanceCurrency,
    rawText: body,
    bankName: 'ARCA',
    transactionTypeRaw,
  };
};

/**
 * Check if this parser can handle the notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {boolean} True if this parser can handle the notification
 */
export const canParse = (title, body) => {
  if (!title && !body) return false;

  // Check if title or body contains "ARCA"
  const titleLower = (title || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();

  return titleLower.includes('arca') || bodyLower.includes('arca');
};
