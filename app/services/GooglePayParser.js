/**
 * Parser for Google Pay notification text to extract transaction details
 */

/**
 * Parse Google Pay notification to extract transaction information
 * @param {Object} notification - Notification object from native module
 * @param {string} notification.title - Notification title
 * @param {string} notification.text - Notification text
 * @param {string} notification.bigText - Notification big text
 * @param {number} notification.timestamp - Notification timestamp
 * @returns {Object|null} Parsed transaction data or null if parsing failed
 */
export const parseGooglePayNotification = (notification) => {
  if (!notification) return null;

  const { title, text, bigText, timestamp } = notification;
  const content = `${title} ${text} ${bigText}`;

  // Try different parsing patterns
  const transaction =
    parsePaymentPattern(content, timestamp) ||
    parseUPIPattern(content, timestamp) ||
    parseCardPattern(content, timestamp);

  return transaction;
};

/**
 * Parse standard payment pattern
 * Examples:
 * - "Paid ₹500 to Amazon"
 * - "You paid $50.00 to Starbucks"
 * - "Payment of ₹1,234.56 to Uber"
 */
const parsePaymentPattern = (content, timestamp) => {
  const patterns = [
    // Pattern: "Paid [amount] to [merchant]"
    /(?:paid|payment)\s+(?:of\s+)?([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)\s+(?:to|at)\s+([^\n.]+)/i,
    // Pattern: "[merchant] [amount]"
    /([^\n]+?)\s+([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)/i,
    // Pattern with "spent" - "Spent ₹500 at Amazon"
    /spent\s+([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)\s+(?:at|on)\s+([^\n.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let amount = match[1];
      let merchant = match[2];

      // Swap if amount and merchant are reversed
      if (merchant && !amount.match(/[₹$€£¥\d]/)) {
        [amount, merchant] = [merchant, amount];
      }

      const parsedAmount = parseAmount(amount);
      const currency = extractCurrency(amount);

      if (parsedAmount && merchant) {
        return {
          amount: parsedAmount,
          currency: currency,
          merchant: merchant.trim(),
          description: `Google Pay: ${merchant.trim()}`,
          date: new Date(timestamp).toISOString().split('T')[0],
          type: 'expense',
          source: 'google_pay',
        };
      }
    }
  }

  return null;
};

/**
 * Parse UPI-specific patterns
 * Examples:
 * - "UPI payment of ₹500 to merchant@upi"
 * - "Sent ₹1,000 via UPI to 9876543210@paytm"
 */
const parseUPIPattern = (content, timestamp) => {
  const patterns = [
    /UPI\s+(?:payment|transaction)\s+(?:of\s+)?([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)\s+(?:to|for)\s+([^\n.]+)/i,
    /(?:sent|paid)\s+([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)\s+via\s+UPI\s+(?:to\s+)?([^\n.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const amount = match[1];
      let merchant = match[2];

      // Clean up UPI ID if present
      merchant = merchant.replace(/@[\w.]+$/i, '').trim();

      const parsedAmount = parseAmount(amount);
      const currency = extractCurrency(amount);

      if (parsedAmount && merchant) {
        return {
          amount: parsedAmount,
          currency: currency,
          merchant: merchant,
          description: `UPI: ${merchant}`,
          date: new Date(timestamp).toISOString().split('T')[0],
          type: 'expense',
          source: 'google_pay_upi',
        };
      }
    }
  }

  return null;
};

/**
 * Parse card transaction patterns
 * Examples:
 * - "Card ending 1234 charged ₹500 at Amazon"
 */
const parseCardPattern = (content, timestamp) => {
  const patterns = [
    /card.*?(?:charged|debited)\s+([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)\s+(?:at|for)\s+([^\n.]+)/i,
    /([^\n]+?)\s+(?:charged|debited)\s+([₹$€£¥]\s*[\d,]+(?:\.\d{2})?)\s+(?:from|to)\s+card/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const amount = match[1];
      const merchant = match[2];

      const parsedAmount = parseAmount(amount);
      const currency = extractCurrency(amount);

      if (parsedAmount && merchant) {
        return {
          amount: parsedAmount,
          currency: currency,
          merchant: merchant.trim(),
          description: `Card: ${merchant.trim()}`,
          date: new Date(timestamp).toISOString().split('T')[0],
          type: 'expense',
          source: 'google_pay_card',
        };
      }
    }
  }

  return null;
};

/**
 * Parse amount string to number
 * @param {string} amountStr - Amount string like "₹1,234.56" or "$50.00"
 * @returns {string|null} Parsed amount as string for precision
 */
const parseAmount = (amountStr) => {
  if (!amountStr) return null;

  // Remove currency symbols and spaces
  const cleaned = amountStr.replace(/[₹$€£¥\s]/g, '');

  // Remove commas (thousands separator)
  const withoutCommas = cleaned.replace(/,/g, '');

  // Parse to float
  const amount = parseFloat(withoutCommas);

  if (isNaN(amount) || amount <= 0) {
    return null;
  }

  // Return as string with 2 decimal places for precision
  return amount.toFixed(2);
};

/**
 * Extract currency from amount string
 * @param {string} amountStr - Amount string with currency symbol
 * @returns {string} Currency code (USD, INR, EUR, etc.)
 */
const extractCurrency = (amountStr) => {
  const currencyMap = {
    '₹': 'INR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
  };

  for (const [symbol, code] of Object.entries(currencyMap)) {
    if (amountStr.includes(symbol)) {
      return code;
    }
  }

  return 'USD'; // Default
};

/**
 * Check if notification is likely a Google Pay transaction
 * @param {Object} notification - Notification object
 * @returns {boolean} True if likely a transaction notification
 */
export const isGooglePayTransaction = (notification) => {
  if (!notification) return false;

  const { title, text, bigText } = notification;
  const content = `${title} ${text} ${bigText}`.toLowerCase();

  const transactionKeywords = [
    'paid',
    'payment',
    'sent',
    'transaction',
    'upi',
    'charged',
    'debited',
  ];

  const hasKeyword = transactionKeywords.some(keyword => content.includes(keyword));
  const hasCurrency = /[₹$€£¥]/.test(content);

  return hasKeyword && hasCurrency;
};
