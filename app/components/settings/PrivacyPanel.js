import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, ScrollView } from 'react-native';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { authenticateWithBiometrics, BiometricResult } from '../../services/BiometricService';
import { SettingToggleRow, SETTINGS_LIST_CONTENT } from './SettingsRows';

// Settings that trade privacy for convenience. Revealing balances asks for
// biometrics, so the row can be refused by the OS.
export default function PrivacyPanel({ onBusyChange, bottomInset }) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { hideBalances, setHideBalances } = useDisplaySettings();

  // Revealing balances hands control to a system dialog, and a system dialog
  // pauses the activity — which the host reads as the app being backgrounded and
  // answers by closing the open subpanel. That would unmount this panel mid-await
  // and throw away the answer the user just gave. Declaring the panel
  // busy for the duration is exactly what the Sheets panels do for their own
  // long-running steps, and the host's backgrounding reset already skips a busy
  // panel.
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  useEffect(() => {
    onBusyChange(systemPromptOpen);
  }, [systemPromptOpen, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const handleToggleHideBalances = useCallback(async () => {
    if (!hideBalances) {
      setHideBalances(true);
      return;
    }
    setSystemPromptOpen(true);
    let result;
    try {
      result = await authenticateWithBiometrics(t('biometric_prompt') || 'Authenticate to show balances');
    } finally {
      setSystemPromptOpen(false);
    }
    if (result === BiometricResult.SUCCESS) {
      setHideBalances(false);
    } else if (result === BiometricResult.NOT_AVAILABLE) {
      setHideBalances(false);
    } else if (result === BiometricResult.NOT_ENROLLED) {
      setHideBalances(false);
    } else if (result === BiometricResult.FAILED) {
      showDialog(
        t('error') || 'Error',
        t('biometric_failed') || 'Authentication failed',
        [{ text: t('ok') || 'OK' }],
      );
    }
  }, [hideBalances, setHideBalances, t, showDialog]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
      <SettingToggleRow
        icon="eye-off-outline"
        label={t('hide_balances') || 'Hide balances'}
        hint={t('hide_balances_hint') || 'Mask account balances for privacy'}
        value={hideBalances}
        onToggle={handleToggleHideBalances}
        testID="settings-hide-balances-row"
      />
    </ScrollView>
  );
}

PrivacyPanel.propTypes = {
  // Reports whether back must be locked (a biometric prompt is in front of the
  // panel).
  onBusyChange: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  content: {
    ...SETTINGS_LIST_CONTENT,
  },
});
