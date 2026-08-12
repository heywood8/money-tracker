import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useAccountsActions } from '../../contexts/AccountsActionsContext';
import { SPACING } from '../../styles/designTokens';
import {
  CONFIRM_BUTTON_DESTRUCTIVE,
  CONFIRM_BUTTON_TEXT,
  CONFIRM_CONTENT,
  CONFIRM_TEXT,
  CONFIRM_WARNING_ICON,
} from './settingsPanelStyles';

// The reset-database confirmation. The back arrow is the cancel, so this is a
// warning, a sentence, and the one destructive button.
export default function ResetPanel({ onDone, onBusyChange }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { resetDatabase } = useAccountsActions();
  const [resetInProgress, setResetInProgress] = useState(false);

  // The host locks back navigation while the wipe runs, so it has to know. It is
  // reported rather than owned up there because the panel is what knows when the
  // work starts and stops.
  useEffect(() => {
    onBusyChange(resetInProgress);
  }, [resetInProgress, onBusyChange]);

  // Releasing the lock on unmount matters: the panel closes on success while
  // this is still true, and a host left holding `busy` would refuse every back
  // gesture afterwards.
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const confirmReset = useCallback(async () => {
    // Keep the confirm subpanel open with an inline spinner while the wipe runs, then
    // close and toast on success — previously the panel closed immediately and the reset
    // happened invisibly, leaving the user with no feedback (QoL-13).
    if (resetInProgress) return;
    setResetInProgress(true);
    try {
      await resetDatabase();
      setResetInProgress(false);
      onDone();
    } catch (error) {
      setResetInProgress(false);
      console.error('[Settings] Database reset failed:', error);
      showDialog(t('error') || 'Error', error.message || 'Database reset failed', [{ text: 'OK' }]);
    }
  }, [resetInProgress, onDone, resetDatabase, showDialog, t]);

  return (
    <View style={styles.confirmContent}>
      <Ionicons name="warning-outline" size={48} color={colors.destructive} style={styles.confirmWarningIcon} />
      <Text style={[styles.confirmText, { color: colors.text }]}>
        {t('reset_database_confirm') || 'Are you sure you want to reset the database? This will delete all data and create default accounts.'}
      </Text>
      <TouchableRipple
        onPress={confirmReset}
        disabled={resetInProgress}
        style={[styles.confirmButtonDestructive, { backgroundColor: colors.destructive }, resetInProgress && styles.confirmButtonBusy]}
      >
        {resetInProgress ? (
          <View style={styles.confirmButtonBusyRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.confirmButtonText}>{t('resetting_database') || 'Resetting…'}</Text>
          </View>
        ) : (
          <Text style={styles.confirmButtonText}>{t('reset') || 'Reset'}</Text>
        )}
      </TouchableRipple>
    </View>
  );
}

ResetPanel.propTypes = {
  // A successful wipe. The host closes the panel and acknowledges it — the
  // panel has no say in how completion is announced.
  onDone: PropTypes.func.isRequired,
  // Reports whether a wipe is in flight, so the host can lock back navigation.
  onBusyChange: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  confirmButtonBusy: {
    opacity: 0.85,
  },
  confirmButtonBusyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  confirmButtonDestructive: CONFIRM_BUTTON_DESTRUCTIVE,
  confirmButtonText: CONFIRM_BUTTON_TEXT,
  confirmContent: CONFIRM_CONTENT,
  confirmText: CONFIRM_TEXT,
  confirmWarningIcon: CONFIRM_WARNING_ICON,
});
