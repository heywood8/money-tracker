import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Recent Operations Widget for Android Home Screen
 *
 * Displays the most recent financial operations
 */

const WIDGET_DATA_KEY = 'penny_widget_data';

/**
 * Get widget data from AsyncStorage
 * @returns {Promise<Object>}
 */
const getWidgetData = async () => {
  try {
    const dataStr = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (!dataStr) {
      return {
        recentOperations: [],
        lastUpdate: null,
      };
    }

    return JSON.parse(dataStr);
  } catch (error) {
    console.error('Widget: Failed to get data:', error);
    return {
      recentOperations: [],
      lastUpdate: null,
    };
  }
};

/**
 * Format date for display
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * Get operation icon based on type
 * @param {string} type
 * @returns {string}
 */
const getOperationIcon = (type) => {
  switch (type) {
    case 'expense':
      return '↓';
    case 'income':
      return '↑';
    case 'transfer':
      return '⇄';
    default:
      return '•';
  }
};

/**
 * Get operation color based on type
 * @param {string} type
 * @returns {string}
 */
const getOperationColor = (type) => {
  switch (type) {
    case 'expense':
      return '#EF4444';
    case 'income':
      return '#10B981';
    case 'transfer':
      return '#3B82F6';
    default:
      return '#6B7280';
  }
};

/**
 * Recent Operations Widget Component
 */
export async function RecentOperationsWidget(props) {
  const widgetData = await getWidgetData();
  const { recentOperations } = widgetData;

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
          marginBottom: 12,
        }}
      >
        <TextWidget
          text="📊 Recent Transactions"
          style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#1F2937',
          }}
        />
      </FlexWidget>

      {/* Operations List */}
      {recentOperations && recentOperations.length > 0 ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {recentOperations.slice(0, 5).map((op, index) => (
            <FlexWidget
              key={`op-${op.id || index}`}
              style={{
                width: 'match_parent',
                flexDirection: 'column',
                paddingVertical: 8,
                paddingHorizontal: 10,
                backgroundColor: '#F9FAFB',
                borderRadius: 8,
                borderLeftWidth: 3,
                borderLeftColor: getOperationColor(op.type),
              }}
            >
              {/* First Row: Icon, Category/Description, Amount */}
              <FlexWidget
                style={{
                  width: 'match_parent',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <FlexWidget
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                  }}
                >
                  <TextWidget
                    text={getOperationIcon(op.type)}
                    style={{
                      fontSize: 14,
                      color: getOperationColor(op.type),
                    }}
                  />
                  <TextWidget
                    text={op.categoryName || op.description || op.type}
                    style={{
                      fontSize: 13,
                      color: '#374151',
                      fontWeight: '500',
                    }}
                    maxLines={1}
                  />
                </FlexWidget>
                <TextWidget
                  text={op.formattedAmount}
                  style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: getOperationColor(op.type),
                  }}
                />
              </FlexWidget>

              {/* Second Row: Account and Date */}
              <FlexWidget
                style={{
                  width: 'match_parent',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: 4,
                }}
              >
                <TextWidget
                  text={op.accountName}
                  style={{
                    fontSize: 11,
                    color: '#6B7280',
                  }}
                  maxLines={1}
                />
                <TextWidget
                  text={formatDate(op.date)}
                  style={{
                    fontSize: 11,
                    color: '#9CA3AF',
                  }}
                />
              </FlexWidget>
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 120,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="No transactions yet"
            style={{
              fontSize: 14,
              color: '#9CA3AF',
              textAlign: 'center',
            }}
          />
          <TextWidget
            text="Open app to add transactions"
            style={{
              fontSize: 12,
              color: '#D1D5DB',
              textAlign: 'center',
              marginTop: 4,
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
RecentOperationsWidget.width = 'medium';
RecentOperationsWidget.height = 'large';
RecentOperationsWidget.previewImage = 'recent_operations_widget_preview';
RecentOperationsWidget.description = 'Shows recent transactions';
RecentOperationsWidget.displayName = 'Penny Transactions';
