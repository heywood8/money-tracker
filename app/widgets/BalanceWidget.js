import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

/**
 * Balance Widget for Android Home Screen
 *
 * Displays total balance across all accounts grouped by currency
 * and shows the count of accounts.
 *
 * Data is provided by the widget task handler.
 */

/**
 * Format last update time
 * @param {string} timestamp - ISO timestamp
 * @returns {string}
 */
const formatUpdateTime = (timestamp) => {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
  } catch (error) {
    return '';
  }
};

/**
 * Balance Widget Component
 * @param {Object} props - Data from widget task handler
 */
export function BalanceWidget(props) {
  // Data is passed from the widget task handler
  const { totalsByCurrency = [], accountCount = 0, lastUpdate } = props || {};

  console.log('BalanceWidget rendering:', { totalsByCurrency: totalsByCurrency.length, accountCount });

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
      clickAction="OPEN_APP"
    >
      {/* Header */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <TextWidget
          text="💰 Penny"
          style={{
            fontSize: 18,
            fontWeight: 'bold',
            color: '#1F2937',
          }}
        />
        <TextWidget
          text={`${accountCount} account${accountCount !== 1 ? 's' : ''}`}
          style={{
            fontSize: 12,
            color: '#6B7280',
          }}
        />
      </FlexWidget>

      {/* Balance List */}
      {totalsByCurrency.length > 0 ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {totalsByCurrency.map((item, index) => (
            <FlexWidget
              key={`balance-${item.currency}-${index}`}
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: '#F3F4F6',
                borderRadius: 8,
              }}
            >
              <TextWidget
                text={item.currency}
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#374151',
                }}
              />
              <TextWidget
                text={item.formatted}
                style={{
                  fontSize: 16,
                  fontWeight: 'bold',
                  color: parseFloat(item.total) >= 0 ? '#10B981' : '#EF4444',
                }}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 100,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="No accounts yet"
            style={{
              fontSize: 14,
              color: '#9CA3AF',
              textAlign: 'center',
            }}
          />
          <TextWidget
            text="Open app to add accounts"
            style={{
              fontSize: 12,
              color: '#D1D5DB',
              textAlign: 'center',
              marginTop: 4,
            }}
          />
        </FlexWidget>
      )}

      {/* Footer - Last Update */}
      {lastUpdate && (
        <FlexWidget
          style={{
            width: 'match_parent',
            marginTop: 'auto',
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
          }}
        >
          <TextWidget
            text={`Updated ${formatUpdateTime(lastUpdate)}`}
            style={{
              fontSize: 10,
              color: '#9CA3AF',
              textAlign: 'right',
            }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/**
 * Widget metadata
 */
BalanceWidget.width = 'small';
BalanceWidget.height = 'medium';
BalanceWidget.previewImage = 'balance_widget_preview';
BalanceWidget.description = 'Shows your account balances';
BalanceWidget.displayName = 'Penny Balance';
