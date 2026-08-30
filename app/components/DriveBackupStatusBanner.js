import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDriveBackup } from '../contexts/DriveBackupContext';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../styles/designTokens';

/**
 * The "uploading to Drive" indicator.
 *
 * A backup runs while the user keeps using the app, which leaves it invisible
 * unless something says so outside the panel that started it — and a modal would
 * defeat the point of not blocking. So: a pill that slides down from the top,
 * lives above the content and takes no touches (`pointerEvents="none"`), and
 * leaves again when the run ends.
 *
 * Mounted once at the app root, so a run started at launch is announced just the
 * same as one started from the settings button.
 */
export default function DriveBackupStatusBanner() {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { progress, isRunning } = useDriveBackup();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isRunning ? 1 : 0,
      duration: isRunning ? 260 : 180,
      easing: isRunning ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isRunning, anim]);

  // Kept mounted through the exit animation would mean tracking its end; not
  // rendering while idle is enough, because the pill is re-created on the next
  // run and the entry animation starts from 0 either way.
  if (!isRunning) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  // Each phase gets its own line rather than one generic "working…": the upload
  // phase is the long one, and it is the only one that can name a file count.
  const label = (() => {
    switch (progress?.phase) {
    case 'preparing':
      return t('drive_backup_status_preparing') || 'Preparing backup…';
    case 'folder':
      return t('drive_backup_status_connecting') || 'Connecting to Google Drive…';
    case 'uploading':
      return `${t('drive_backup_status_uploading') || 'Uploading to Drive'} ${progress.current}/${progress.total}`;
    case 'cleanup':
      return t('drive_backup_status_cleanup') || 'Tidying up old backups…';
    default:
      return t('drive_backup_status_running') || 'Backing up to Google Drive…';
    }
  })();

  return (
    <View style={[styles.host, { top: insets.top + SPACING.sm }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: anim,
            transform: [{ translateY }],
          },
        ]}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        testID="drive-backup-status-banner"
      >
        <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        <ActivityIndicator size={14} color={colors.primary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  label: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
  pill: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    flexDirection: 'row',
    gap: SPACING.sm,
    maxWidth: '90%',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
});
