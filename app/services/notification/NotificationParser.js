/**
 * Notification Parser Service
 * Main entry point for parsing bank transaction notifications
 */

import { getParser } from './parsers/index';

/**
 * Parse a notification and extract transaction data
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {Object|null} Parsed notification data or null if parsing fails
 *
 * Returned object structure:
 * {
 *   type: string,              // 'expense', 'income', or 'transfer'
 *   amount: string,            // Amount as string (e.g., "1300.00")
 *   currency: string,          // Currency code (e.g., "AMD")
 *   cardMask: string,          // Masked card number (e.g., "4083***7027")
 *   merchantName: string,      // Merchant/purchase source name
 *   date: string,              // ISO date string (YYYY-MM-DD)
 *   balance: string|null,      // Balance after transaction (optional)
 *   balanceCurrency: string|null, // Balance currency (optional)
 *   rawText: string,           // Original notification text
 *   bankName: string,          // Bank name
 *   transactionTypeRaw: string // Raw transaction type from notification
 * }
 */
export const parseNotification = (title, body) => {
  if (!title && !body) {
    console.warn('Cannot parse notification: both title and body are empty');
    return null;
  }

  // Find appropriate parser for this notification
  const parser = getParser(title, body);

  if (!parser) {
    console.warn('No parser found for notification:', { title, body });
    return null;
  }

  // Parse the notification
  try {
    const parsed = parser.parse(title, body);

    if (!parsed) {
      console.warn('Parser returned null for notification:', { title, body });
      return null;
    }

    // Validate required fields
    if (!parsed.amount || !parsed.currency || !parsed.date) {
      console.warn('Parsed notification missing required fields:', parsed);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Failed to parse notification:', error);
    return null;
  }
};

/**
 * Check if a notification can be parsed
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {boolean} True if notification can be parsed
 */
export const canParseNotification = (title, body) => {
  const parser = getParser(title, body);
  return parser !== null;
};

/**
 * Get bank name from notification without full parsing
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {string|null} Bank name or null
 */
export const getBankName = (title, body) => {
  const parser = getParser(title, body);

  if (!parser) return null;

  // Try to parse and extract bank name
  try {
    const parsed = parser.parse(title, body);
    return parsed?.bankName || null;
  } catch (error) {
    console.error('Failed to get bank name:', error);
    return null;
  }
};
