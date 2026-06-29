import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import {
  isBankNotificationsEnabled,
  setBankNotificationsEnabled,
  processBankNotifications,
} from '../services/notifications/processBankNotifications';
import {
  isNotificationAccessEnabled,
  openNotificationAccessSettings,
  getRecentNotifications,
} from '../services/NotificationAccess';
import {
  getHiddenPackages,
  registerSeenPackages,
  setPackageVisible,
} from '../services/notifications/notificationFilters';

/**
 * "Filters" subpanel for notification processing (header three-dots → Filters).
 *
 * Groups the controls that govern what Penny does with notifications:
 *   1. Notification access: grant/manage the OS notification-listener permission.
 *   2. Process bank notifications: the toggle that turns purchase notifications
 *      into operations.
 *   3. App filters: every app Penny has seen (plus shipped defaults), each with a
 *      checkbox. Apps are shown by default; unchecking one hides its
 *      notifications from the feed on the main processing page.
 */
export default function NotificationFiltersContentPanel({ bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [known, setKnown] = useState([]);
  const [hidden, setHidden] = useState([]);

  const reload = useCallback(async () => {
    const [access, isOn] = await Promise.all([
      isNotificationAccessEnabled(),
      isBankNotificationsEnabled(),
    ]);
    setAccessEnabled(access);
    setEnabled(isOn);
    // Fold any apps in the current feed into the persisted known list so the
    // filter list stays complete even after they age out of the native window.
    const recent = await getRecentNotifications();
    const recentList = Array.isArray(recent) ? recent : [];
    const knownList = await registerSeenPackages(recentList.map((n) => n.packageName));
    const hiddenList = await getHiddenPackages();
    setKnown(Array.isArray(knownList) ? knownList : []);
    setHidden(Array.isArray(hiddenList) ? hiddenList : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (error) {
        // Non-fatal; show whatever loaded.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const handleToggle = useCallback(async (value) => {
    setEnabled(value);
    await setBankNotificationsEnabled(value);
    if (value) {
      // Enabling should act immediately on whatever is already captured.
      await processBankNotifications();
    }
  }, []);

  const handleToggleApp = useCallback(async (packageName) => {
    const currentlyHidden = hidden.includes(packageName);
    // currentlyHidden → tapping makes it visible again, and vice-versa.
    const next = await setPackageVisible(packageName, currentlyHidden);
    setHidden(Array.isArray(next) ? next : []);
  }, [hidden]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: HORIZONTAL_PADDING }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* ── Notification access ── */}
      <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons
          name={accessEnabled ? 'checkmark-circle' : 'alert-circle-outline'}
          size={22}
          color={accessEnabled ? colors.income : colors.primary}
        />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {t('notification_access') || 'Notification access'}
          </Text>
          <Text style={[styles.rowHint, { color: colors.mutedText }]}>
            {accessEnabled
              ? (t('notification_access_granted') || 'Penny can read notifications in the background.')
              : (t('notification_access_hint') || 'Allow Penny to read notifications in the background')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={openNotificationAccessSettings}
          style={[styles.accessButton, { borderColor: colors.primary }]}
          accessibilityRole="button"
          testID="notification-access-button"
        >
          <Text style={[styles.accessButtonText, { color: colors.primary }]}>
            {accessEnabled ? (t('manage') || 'Manage') : (t('grant_access') || 'Grant')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Bank processing toggle ── */}
      <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {t('bank_notifications_enable') || 'Process bank notifications'}
          </Text>
          <Text style={[styles.rowHint, { color: colors.mutedText }]}>
            {t('bank_notifications_enable_hint') ||
              'Turn purchase notifications into operations automatically'}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          color={colors.primary}
          testID="bank-notifications-toggle"
        />
      </View>

      {/* ── App filters ── */}
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>
        {(t('notification_filter_apps') || 'Apps').toUpperCase()}
      </Text>
      <Text style={[styles.sectionHint, { color: colors.mutedText }]}>
        {t('notification_filter_apps_hint') ||
          'Uncheck an app to hide its notifications from the feed'}
      </Text>

      {known.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="apps-outline" size={40} color={colors.mutedText} />
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('notification_filter_apps_empty') ||
              "No apps yet. They'll appear here as notifications arrive."}
          </Text>
        </View>
      ) : (
        known.map((pkg) => {
          const checked = !hidden.includes(pkg);
          return (
            <TouchableOpacity
              key={pkg}
              onPress={() => handleToggleApp(pkg)}
              style={[styles.appRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={pkg}
              testID={`app-filter-${pkg}`}
            >
              <Ionicons
                name={checked ? 'checkbox' : 'square-outline'}
                size={22}
                color={checked ? colors.primary : colors.mutedText}
              />
              <Text style={[styles.appName, { color: colors.text }]} numberOfLines={1}>
                {pkg}
              </Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

NotificationFiltersContentPanel.propTypes = {
  bottomInset: PropTypes.number,
};

NotificationFiltersContentPanel.defaultProps = {
  bottomInset: 0,
};

const styles = StyleSheet.create({
  accessButton: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  accessButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  appName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  appRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  rowHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: SPACING.lg,
  },
});
