import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, ScrollView } from 'react-native';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useDialog } from '../../contexts/DialogContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { authenticateWithBiometrics, BiometricResult } from '../../services/BiometricService';
import { ensureLocationPermission } from '../../services/LocationService';
import { SettingToggleRow, SETTINGS_LIST_CONTENT } from './SettingsRows';

// The two settings that trade privacy for convenience, and the only two rows
// that can be refused by the OS: revealing balances asks for biometrics, and
// attaching location asks for the location permission.
export default function PrivacyPanel({ onBusyChange, bottomInset }) {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    hideBalances, setHideBalances,
    attachLocation, setAttachLocation,
  } = useDisplaySettings();

  // Inline hint shown under the "Attach location" row when the OS permission was
  // denied while turning the toggle on. Cleared on a successful grant / toggle off.
  const [locationDenied, setLocationDenied] = useState(false);

  // Both toggles hand control to a system dialog, and a system dialog pauses the
  // activity — which the host reads as the app being backgrounded and answers by
  // closing the open subpanel. That would unmount this panel mid-await and throw
  // away the answer the user just gave (most visibly the denial hint, which is
  // the only feedback a refused location permission gets). Declaring the panel
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

  const handleToggleAttachLocation = useCallback(async () => {
    // Turning OFF is non-destructive and needs no permission: just persist false.
    // Coordinates already stored on past operations are left untouched (R1.5).
    if (attachLocation) {
      setAttachLocation(false);
      setLocationDenied(false);
      return;
    }
    // Turning ON: request the OS permission in this clear context. If it isn't
    // granted, leave the toggle off and show an inline hint — never nag, never
    // flip the toggle on without permission.
    setSystemPromptOpen(true);
    let granted = false;
    try {
      ({ granted } = await ensureLocationPermission());
    } finally {
      setSystemPromptOpen(false);
    }
    if (granted) {
      setLocationDenied(false);
      setAttachLocation(true);
    } else {
      setLocationDenied(true);
      setAttachLocation(false);
    }
  }, [attachLocation, setAttachLocation]);

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

      <SettingToggleRow
        icon="location-outline"
        label={t('attach_location') || 'Attach location to operations'}
        hint={locationDenied
          ? (t('location_permission_denied') || 'Location permission denied. Enable it in system settings.')
          : (t('attach_location_hint') || 'Suggest labels you used nearby before')}
        hintError={locationDenied}
        value={attachLocation}
        onToggle={handleToggleAttachLocation}
        testID="settings-location-row"
      />
    </ScrollView>
  );
}

PrivacyPanel.propTypes = {
  // Reports whether back must be locked (a system permission / biometric prompt
  // is in front of the panel).
  onBusyChange: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  content: {
    ...SETTINGS_LIST_CONTENT,
  },
});
