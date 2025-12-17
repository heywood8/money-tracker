# Notification Services

This directory contains services for reading and processing bank transaction notifications.

## Overview

The notification reader feature enables automatic transaction creation from bank notifications. When a bank sends a transaction notification, the app:

1. **Listens** for bank notifications (NotificationListener)
2. **Parses** transaction details from notification text (NotificationParser)
3. **Binds** cards to accounts and merchants to categories
4. **Creates** expense operations automatically

## Directory Structure

```
notification/
├── README.md                      # This file
├── NotificationListener.js        # Android notification listener service
├── NotificationParser.js          # Main notification parser
└── parsers/
    ├── index.js                   # Parser registry and auto-detection
    └── ArcaParser.js              # ARCA bank notification parser
```

## Components

### NotificationListener.js

**Purpose**: Listens to notifications from bank apps on Android.

**Key Features**:
- Monitors specific bank app package names
- Filters for bank notifications only
- Emits events when bank notifications received
- Manages notification listener permissions
- Singleton service accessible app-wide

**Usage**:
```javascript
import { notificationListener, NOTIFICATION_EVENTS } from './services/notification/NotificationListener';

// Check permission
const hasPermission = await notificationListener.checkPermission();

// Request permission (opens system settings)
await notificationListener.requestPermission();

// Start listening
await notificationListener.startListening();

// Listen for notifications
appEvents.on(NOTIFICATION_EVENTS.BANK_NOTIFICATION, (notification) => {
  console.log('Bank notification:', notification);
});

// Stop listening
notificationListener.stopListening();
```

**Requirements**:
- Android only
- `react-native-notification-listener` package
- `BIND_NOTIFICATION_LISTENER_SERVICE` permission
- User must grant notification access in system settings

See [docs/notification-listener-setup.md](/docs/notification-listener-setup.md) for complete setup instructions.

### NotificationParser.js

**Purpose**: Parses notification text to extract transaction details.

**Input**: Notification title and body text

**Output**: Structured transaction data:
```javascript
{
  type: 'expense',              // Transaction type
  amount: '1300.00',             // Amount as string
  currency: 'AMD',               // Currency code
  cardMask: '4083***7027',       // Masked card number
  merchantName: 'YANDEX.GO, AM', // Merchant/purchase source
  date: '2025-12-11T12:09:00Z',  // ISO 8601 date
  balance: '475760.04',          // Balance after transaction
  rawText: '...',                // Original notification text
  bankName: 'ARCA'               // Bank name
}
```

**Usage**:
```javascript
import { parseNotification } from './services/notification/NotificationParser';

const result = parseNotification(
  'ARCA transactions',
  'PRE-PURCHASE | 1,300.00 AMD | 4083***7027 | YANDEX.GO, AM | 11.12.2025 12:09'
);

if (result) {
  console.log('Parsed:', result);
  // Create operation with result.amount, result.cardMask, etc.
} else {
  console.log('Failed to parse notification');
}
```

### parsers/index.js

**Purpose**: Registry of bank-specific parsers with auto-detection.

**Features**:
- Auto-detects bank from notification title/body
- Maintains list of available parsers
- Extensible architecture for adding new banks

**Usage**:
```javascript
import { getParser, registerParser } from './services/notification/parsers';

// Auto-detect and get parser
const parser = getParser('ARCA transactions', 'PRE-PURCHASE | ...');

if (parser) {
  const result = parser.parse(title, body);
}

// Register a custom parser
registerParser({
  name: 'ACBA',
  canParse: (title, body) => title.includes('ACBA'),
  parse: (title, body) => { /* parsing logic */ }
});
```

### parsers/ArcaParser.js

**Purpose**: Parses ARCA bank notification format.

**Supported Format**:
```
Title: ARCA transactions
Body: PRE-PURCHASE | 1,300.00 AMD | 4083***7027, | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD
```

**Supported Transaction Types**:
- `PRE-PURCHASE` - Pre-authorized purchase (expense)
- `PURCHASE` - Completed purchase (expense)
- `REFUND` - Purchase refund (income)
- `WITHDRAWAL` - ATM withdrawal (expense)
- `TRANSFER` - Money transfer (expense/income)
- `PAYMENT` - Bill payment (expense)

**Field Extraction**:
- Amount with thousands separators (e.g., "1,300.00")
- Card mask (e.g., "4083***7027")
- Merchant name (normalized, trimmed)
- Date (DD.MM.YYYY HH:mm format)
- Balance after transaction

## React Hook

### useNotificationListener

**Purpose**: React hook for managing notification listener in components.

**Features**:
- Permission status tracking
- Listener start/stop controls
- Automatic notification processing
- Event subscription management
- Auto-cleanup on unmount

**Usage**:
```javascript
import { useNotificationListener } from '../hooks/useNotificationListener';

function NotificationSettings() {
  const {
    isListening,
    hasPermission,
    lastNotification,
    error,
    startListening,
    stopListening,
    requestPermission,
  } = useNotificationListener({
    onNotificationReceived: (notification) => {
      // Handle notification
      console.log('Transaction:', notification.parsed);
    },
    onPermissionChange: (granted) => {
      console.log('Permission:', granted ? 'granted' : 'denied');
    },
    onError: (err) => {
      console.error('Error:', err);
    },
    autoStart: true, // Auto-start listening
  });

  return (
    <View>
      <Text>Status: {isListening ? 'Active' : 'Inactive'}</Text>

      {!hasPermission && (
        <Button onPress={requestPermission}>
          Grant Notification Access
        </Button>
      )}

      {hasPermission && (
        <>
          <Button onPress={startListening}>Start</Button>
          <Button onPress={stopListening}>Stop</Button>
        </>
      )}

      {lastNotification && (
        <Text>Last: {lastNotification.parsed.merchantName}</Text>
      )}
    </View>
  );
}
```

## Data Flow

```
┌─────────────────────────────────┐
│   Bank App Sends Notification   │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│    NotificationListener         │
│  (Filters for bank apps only)   │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│    BANK_NOTIFICATION Event      │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│    NotificationParser           │
│   (Extract transaction data)    │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│      Parsed Transaction         │
│  { cardMask, amount, merchant } │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│    NotificationProcessor        │
│  (Check bindings, create op)    │
└─────────────────────────────────┘
```

## Adding Support for New Banks

To add support for a new bank:

1. **Create parser**: `parsers/NewBankParser.js`
```javascript
export const NewBankParser = {
  name: 'NewBank',

  canParse: (title, body) => {
    return title.includes('NewBank') || body.includes('NewBank');
  },

  parse: (title, body) => {
    // Extract transaction details from notification
    // Return structured data or null if parsing fails

    return {
      type: 'expense',
      amount: '...',
      currency: '...',
      cardMask: '...',
      merchantName: '...',
      date: '...',
      balance: '...',
      rawText: body,
      bankName: 'NewBank',
    };
  },
};
```

2. **Register parser**: In `parsers/index.js`
```javascript
import { NewBankParser } from './NewBankParser';

export function getAllParsers() {
  return [
    ArcaParser,
    NewBankParser, // Add here
  ];
}
```

3. **Add package name**: In `NotificationListener.js`
```javascript
const BANK_PACKAGES = {
  ARCA: 'am.arca.bank',
  NEWBANK: 'am.newbank.app', // Add package name
};
```

4. **Test parsing**: Create tests in `__tests__/services/notification/`

## Testing

Run notification service tests:

```bash
# All notification tests
npm test -- services/notification

# Specific test file
npm test -- NotificationListener.test.js
npm test -- NotificationParser.test.js
npm test -- ArcaParser.test.js

# Hook tests
npm test -- useNotificationListener.test.js
```

## Debugging

Enable verbose logging:

```javascript
// In NotificationListener.js, add logging:
handleNotification(notification) {
  console.log('[DEBUG] Raw notification:', notification);
  console.log('[DEBUG] Package:', notification.packageName);
  console.log('[DEBUG] Monitored packages:', this.monitoredPackages);
  // ...
}
```

Check Android system logs:

```bash
# Filter for notification listener
adb logcat | grep NotificationListener

# Check notification service status
adb shell dumpsys notification
```

## Known Limitations

1. **Android Only**: iOS does not allow reading other apps' notifications
2. **Native Module Required**: Cannot work with Expo Go, needs custom dev client
3. **Permission Required**: User must manually grant notification access
4. **Battery Optimization**: Service may be killed by Android's battery saver
5. **Bank-Specific Formats**: Each bank requires a custom parser

## Security Considerations

- Only read notifications from specified bank apps
- Do not store raw notification text
- Only extract and persist transaction-relevant data
- Clear parsed data after operation creation
- Provide user control to enable/disable feature

## Future Enhancements

- [ ] Support more bank notification formats
- [ ] Notification queue for processing while app is closed
- [ ] Notification history viewer
- [ ] Smart retry for failed parsing
- [ ] Machine learning for merchant categorization
- [ ] Balance reconciliation with parsed balance

## Related Documentation

- [Notification Listener Setup Guide](/docs/notification-listener-setup.md)
- [Notification Reader Feature Plan](/.claude/plans/notification-reader-feature.md)
- [Android NotificationListenerService Docs](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
