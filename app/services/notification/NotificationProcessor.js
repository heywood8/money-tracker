/**
 * NotificationProcessor Service
 *
 * Processes parsed bank notifications and creates operations.
 * Checks for card and merchant bindings before creating operations.
 *
 * This is a stateless service - state management is handled by PendingNotificationsContext.
 */

import * as CardBindingsDB from '../CardBindingsDB';
import * as MerchantBindingsDB from '../MerchantBindingsDB';
import * as OperationsDB from '../OperationsDB';
import { appEvents, EVENTS } from '../eventEmitter';

/**
 * Result status codes for notification processing
 */
export const ProcessingStatus = {
  SUCCESS: 'success',                     // Operation created successfully
  MISSING_CARD_BINDING: 'missing_card',   // Card binding not found
  MISSING_MERCHANT_BINDING: 'missing_merchant', // Merchant binding not found
  MISSING_BOTH_BINDINGS: 'missing_both',  // Both bindings not found
  PARSE_ERROR: 'parse_error',             // Notification parsing failed
  INVALID_DATA: 'invalid_data',           // Parsed data is invalid
  OPERATION_ERROR: 'operation_error',     // Error creating operation
  DUPLICATE: 'duplicate',                 // Duplicate notification detected
};

/**
 * Notification processor class
 * Handles the flow from parsed notification to created operation
 */
class NotificationProcessor {
  constructor() {
    // Cache for recent notifications to detect duplicates
    this.recentNotifications = new Map(); // key: hash, value: timestamp
    this.DUPLICATE_WINDOW_MS = 60000; // 1 minute
  }

  /**
   * Generate a hash for duplicate detection
   * @param {Object} parsed - Parsed notification data
   * @returns {string} Hash string
   */
  generateNotificationHash(parsed) {
    // Use amount, currency, merchant, and cardMask to detect duplicates
    const parts = [
      parsed.amount,
      parsed.currency,
      parsed.merchantName || '',
      parsed.cardMask || '',
      parsed.date,
    ];
    return parts.join('|');
  }

  /**
   * Check if notification is a duplicate
   * @param {Object} parsed - Parsed notification data
   * @returns {boolean} True if duplicate
   */
  isDuplicate(parsed) {
    const hash = this.generateNotificationHash(parsed);
    const now = Date.now();

    // Clean up old entries
    for (const [key, timestamp] of this.recentNotifications.entries()) {
      if (now - timestamp > this.DUPLICATE_WINDOW_MS) {
        this.recentNotifications.delete(key);
      }
    }

    // Check if this notification was recently processed
    if (this.recentNotifications.has(hash)) {
      return true;
    }

    // Add to cache
    this.recentNotifications.set(hash, now);
    return false;
  }

  /**
   * Validate parsed notification data
   * @param {Object} parsed - Parsed notification data
   * @returns {Object|null} Validation error object or null if valid
   */
  validateParsedNotification(parsed) {
    if (!parsed) {
      return { code: ProcessingStatus.PARSE_ERROR, message: 'Notification parsing failed' };
    }

    if (!parsed.amount || isNaN(Number(parsed.amount)) || Number(parsed.amount) <= 0) {
      return { code: ProcessingStatus.INVALID_DATA, message: 'Invalid amount' };
    }

    if (!parsed.currency) {
      return { code: ProcessingStatus.INVALID_DATA, message: 'Missing currency' };
    }

    if (!parsed.date) {
      return { code: ProcessingStatus.INVALID_DATA, message: 'Missing date' };
    }

    if (!parsed.type || !['expense', 'income', 'transfer'].includes(parsed.type)) {
      return { code: ProcessingStatus.INVALID_DATA, message: 'Invalid transaction type' };
    }

    // Card mask is optional but should be present for most transactions
    // Merchant name is required for expense transactions
    if (parsed.type === 'expense' && !parsed.merchantName) {
      return { code: ProcessingStatus.INVALID_DATA, message: 'Missing merchant name for expense' };
    }

    return null; // Valid
  }

  /**
   * Check which bindings are missing for the parsed notification
   * @param {Object} parsed - Parsed notification data
   * @returns {Promise<Object>} Object with binding information
   *   { cardBinding: Object|null, merchantBinding: Object|null }
   */
  async checkBindings(parsed) {
    let cardBinding = null;
    let merchantBinding = null;

    // Check card binding if card mask is present
    if (parsed.cardMask) {
      try {
        cardBinding = await CardBindingsDB.getByCardMask(parsed.cardMask);
      } catch (error) {
        console.error('[NotificationProcessor] Failed to check card binding:', error);
      }
    }

    // Check merchant binding for expense transactions
    if (parsed.type === 'expense' && parsed.merchantName) {
      try {
        merchantBinding = await MerchantBindingsDB.getByMerchantName(parsed.merchantName);
      } catch (error) {
        console.error('[NotificationProcessor] Failed to check merchant binding:', error);
      }
    }

    return { cardBinding, merchantBinding };
  }

  /**
   * Create an operation from parsed notification data and bindings
   * @param {Object} parsed - Parsed notification data
   * @param {Object} cardBinding - Card binding object
   * @param {Object} merchantBinding - Merchant binding object (optional for non-expense)
   * @returns {Promise<Object>} Created operation
   */
  async createOperationFromNotification(parsed, cardBinding, merchantBinding) {
    const operationData = {
      type: parsed.type,
      amount: parsed.amount,
      accountId: cardBinding.accountId,
      date: parsed.date,
      description: parsed.merchantName || parsed.rawText?.substring(0, 100) || 'Bank notification',
    };

    // Add category for expense/income transactions
    if (parsed.type === 'expense' && merchantBinding) {
      operationData.categoryId = merchantBinding.categoryId;
    } else if (parsed.type === 'income' && merchantBinding) {
      operationData.categoryId = merchantBinding.categoryId;
    }

    // Currency is stored in account, not in operation
    // If the notification currency doesn't match account currency, we'd need to handle conversion
    // For now, we'll just log a warning
    // TODO: Handle multi-currency scenarios

    // Create operation in database
    try {
      const createdOperation = await OperationsDB.createOperation(operationData);
      console.log('[NotificationProcessor] Operation created:', createdOperation.id);

      // Update last used timestamps for bindings
      if (cardBinding) {
        try {
          await CardBindingsDB.updateLastUsed(cardBinding.id);
        } catch (error) {
          console.error('[NotificationProcessor] Failed to update card binding lastUsed:', error);
        }
      }

      if (merchantBinding) {
        try {
          await MerchantBindingsDB.updateLastUsed(merchantBinding.id);
        } catch (error) {
          console.error('[NotificationProcessor] Failed to update merchant binding lastUsed:', error);
        }
      }

      // Emit event to trigger UI updates
      appEvents.emit(EVENTS.OPERATION_CHANGED);

      return createdOperation;
    } catch (error) {
      console.error('[NotificationProcessor] Failed to create operation:', error);
      throw error;
    }
  }

  /**
   * Process a parsed notification
   * Main entry point for notification processing
   *
   * @param {Object} parsed - Parsed notification data
   * @returns {Promise<Object>} Processing result
   *   {
   *     status: ProcessingStatus,
   *     message: string,
   *     operation?: Object,          // Created operation (if successful)
   *     parsed: Object,               // Original parsed data
   *     cardBinding?: Object,         // Card binding (if found)
   *     merchantBinding?: Object,     // Merchant binding (if found)
   *   }
   */
  async processNotification(parsed) {
    console.log('[NotificationProcessor] Processing notification:', {
      type: parsed.type,
      amount: parsed.amount,
      merchant: parsed.merchantName,
      cardMask: parsed.cardMask,
    });

    // Validate parsed data
    const validationError = this.validateParsedNotification(parsed);
    if (validationError) {
      console.warn('[NotificationProcessor] Validation failed:', validationError);
      return {
        status: validationError.code,
        message: validationError.message,
        parsed,
      };
    }

    // Check for duplicates
    if (this.isDuplicate(parsed)) {
      console.log('[NotificationProcessor] Duplicate notification detected');
      return {
        status: ProcessingStatus.DUPLICATE,
        message: 'Duplicate notification (already processed recently)',
        parsed,
      };
    }

    // Check bindings
    const { cardBinding, merchantBinding } = await this.checkBindings(parsed);

    // Determine what's missing
    const needsCardBinding = parsed.cardMask && !cardBinding;
    const needsMerchantBinding = parsed.type === 'expense' && !merchantBinding;

    if (needsCardBinding && needsMerchantBinding) {
      console.log('[NotificationProcessor] Both bindings missing');
      return {
        status: ProcessingStatus.MISSING_BOTH_BINDINGS,
        message: 'Missing both card and merchant bindings',
        parsed,
        cardBinding,
        merchantBinding,
      };
    }

    if (needsCardBinding) {
      console.log('[NotificationProcessor] Card binding missing');
      return {
        status: ProcessingStatus.MISSING_CARD_BINDING,
        message: `No account bound to card ${parsed.cardMask}`,
        parsed,
        cardBinding,
        merchantBinding,
      };
    }

    if (needsMerchantBinding) {
      console.log('[NotificationProcessor] Merchant binding missing');
      return {
        status: ProcessingStatus.MISSING_MERCHANT_BINDING,
        message: `No category bound to merchant "${parsed.merchantName}"`,
        parsed,
        cardBinding,
        merchantBinding,
      };
    }

    // All bindings present - create operation
    try {
      const operation = await this.createOperationFromNotification(
        parsed,
        cardBinding,
        merchantBinding,
      );

      console.log('[NotificationProcessor] Processing successful');
      return {
        status: ProcessingStatus.SUCCESS,
        message: 'Operation created successfully',
        operation,
        parsed,
        cardBinding,
        merchantBinding,
      };
    } catch (error) {
      console.error('[NotificationProcessor] Failed to create operation:', error);
      return {
        status: ProcessingStatus.OPERATION_ERROR,
        message: error.message || 'Failed to create operation',
        parsed,
        cardBinding,
        merchantBinding,
      };
    }
  }

  /**
   * Retry processing a notification after bindings have been created
   * Used when user creates bindings from the pending notifications queue
   *
   * @param {Object} parsed - Parsed notification data
   * @returns {Promise<Object>} Processing result (same as processNotification)
   */
  async retryProcessing(parsed) {
    console.log('[NotificationProcessor] Retrying notification processing');

    // Don't check for duplicates on retry - this is intentional reprocessing
    // Just clear the duplicate cache for this notification
    const hash = this.generateNotificationHash(parsed);
    this.recentNotifications.delete(hash);

    // Process normally
    return await this.processNotification(parsed);
  }

  /**
   * Clear duplicate detection cache
   * Useful for testing or manual cache clearing
   */
  clearDuplicateCache() {
    this.recentNotifications.clear();
  }
}

// Export singleton instance
export const notificationProcessor = new NotificationProcessor();
