import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';

const stripMarkdown = (md) => md
  .replace(/\r\n/g, '\n')
  .replace(/#{1,6}\s+/g, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/\*(.+?)\*/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*[-*+]\s+/gm, '• ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const formatApkDate = (modificationTime) => {
  if (!modificationTime) return '';
  return new Date(modificationTime * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function UpdateContentPanel({ isChecking, updateResult, downloadedApks, onUpdate, onInstallApk }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isChecking) {
      contentAnim.setValue(0);
    }
  }, [isChecking, contentAnim]);

  useEffect(() => {
    if (!isChecking && updateResult) {
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [isChecking, updateResult, contentAnim]);

  if (isChecking) {
    return (
      <View style={styles.checkingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.checkingText, { color: colors.text }]}>
          {t('checking_for_updates') || 'Checking for available updates…'}
        </Text>
      </View>
    );
  }

  if (!updateResult) return null;

  return (
    <Animated.View style={[styles.resultContainer, { opacity: contentAnim }]}>
      {updateResult.type === 'available' && (
        <>
          {updateResult.releaseNotes ? (
            <>
              <Divider style={styles.updateDivider} />
              <Text style={[styles.changelogTitle, { color: colors.mutedText }]}>
                {t('whats_new') || "What's new"}
              </Text>
              <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
                {updateResult.releaseNotes.map(({ version, notes }) => (
                  <View key={version} style={styles.changelogSection}>
                    {updateResult.releaseNotes.length > 1 && (
                      <Text style={[styles.changelogVersion, { color: colors.mutedText }]}>
                        v{version}
                      </Text>
                    )}
                    <Text style={[styles.changelogText, { color: colors.text }]}>
                      {stripMarkdown(notes)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : (
            <Text style={[styles.updateVersionText, { color: colors.mutedText }]}>
              {t('update_install_hint') || 'If installation is blocked, allow "Install unknown apps" for your browser or file manager in Android settings.'}
            </Text>
          )}
          <Divider style={styles.updateDivider} />
          <View style={styles.updateBottomRow}>
            {downloadedApks.length > 0 && (
              <View style={styles.downloadedApksCompact}>
                <Text style={[styles.downloadedApksTitleCompact, { color: colors.mutedText }]}>
                  {t('downloaded_apks') || 'Downloaded APKs'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.apkListContent}
                >
                  {downloadedApks.map((item) => (
                    <TouchableOpacity
                      key={item.uri}
                      onPress={() => onInstallApk(item.uri)}
                      style={styles.apkChipCompact}
                      accessibilityRole="button"
                      accessibilityLabel={`Install version ${item.version || item.filename}`}
                    >
                      <Ionicons name="archive-outline" size={22} color={colors.primary} />
                      <Text style={[styles.apkChipVersion, { color: colors.text }]}>
                        {item.version ? `v${item.version}` : item.filename.replace(/\.apk$/i, '')}
                      </Text>
                      <Text style={[styles.apkChipDate, { color: colors.mutedText }]}>
                        {formatApkDate(item.modificationTime)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={styles.updateActionColumn}>
              <Text style={[styles.updateButtonVersion, { color: colors.text }]}>
                v{updateResult.latestVersion}
              </Text>
              <Text style={[styles.updateButtonCurrentVersion, { color: colors.mutedText }]}>
                {(t('update_from_version') || 'installed: v{currentVersion}')
                  .replace('{currentVersion}', updateResult.currentVersion)}
              </Text>
              <TouchableRipple
                onPress={() => onUpdate(updateResult.downloadUrl)}
                style={[styles.updateButtonCompact, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.updateButtonText}>
                  {t('update_now') || 'Update now'}
                </Text>
              </TouchableRipple>
            </View>
          </View>
        </>
      )}

      {updateResult.type === 'up_to_date' && (
        <View style={styles.upToDateContent}>
          <View style={styles.upToDateHeader}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#4caf50" style={styles.centeredIcon} />
            <Text style={[styles.updateVersionText, { color: colors.text }]}>
              {t('up_to_date') || 'You already have the latest version installed.'}
            </Text>
          </View>
          {downloadedApks.length > 0 && (
            <View style={styles.downloadedApksSection}>
              <Divider />
              <Text style={[styles.downloadedApksTitle, { color: colors.mutedText }]}>
                {t('downloaded_apks') || 'Downloaded'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.apkListContent}
              >
                {downloadedApks.map((item) => (
                  <TouchableOpacity
                    key={item.uri}
                    onPress={() => onInstallApk(item.uri)}
                    style={styles.apkChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Install version ${item.version || item.filename}`}
                  >
                    <Ionicons name="archive-outline" size={28} color={colors.primary} />
                    <Text style={[styles.apkChipVersion, { color: colors.text }]}>
                      {item.version ? `v${item.version}` : item.filename.replace(/\.apk$/i, '')}
                    </Text>
                    <Text style={[styles.apkChipDate, { color: colors.mutedText }]}>
                      {formatApkDate(item.modificationTime)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {updateResult.type === 'error' && (
        <View style={styles.errorContent}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.mutedText} style={styles.centeredIcon} />
          <Text style={[styles.updateVersionText, { color: colors.text }]}>
            {updateResult.errorCode === 'releases_without_apks'
              ? (t('update_releases_without_apks') || 'Found releases but no APKs attached. Check GitHub for the latest release.')
              : (t('update_check_failed') || 'Could not check updates right now. Please try again later.')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

UpdateContentPanel.propTypes = {
  isChecking: PropTypes.bool,
  updateResult: PropTypes.shape({
    type: PropTypes.oneOf(['available', 'up_to_date', 'error']).isRequired,
    latestVersion: PropTypes.string,
    currentVersion: PropTypes.string,
    downloadUrl: PropTypes.string,
    releaseNotes: PropTypes.arrayOf(PropTypes.shape({
      version: PropTypes.string,
      notes: PropTypes.string,
    })),
    errorCode: PropTypes.string,
  }),
  downloadedApks: PropTypes.array,
  onUpdate: PropTypes.func,
  onInstallApk: PropTypes.func,
};

UpdateContentPanel.defaultProps = {
  isChecking: false,
  updateResult: null,
  downloadedApks: [],
  onUpdate: () => {},
  onInstallApk: () => {},
};

const styles = StyleSheet.create({
  apkChip: {
    alignItems: 'center',
    gap: SPACING.xs,
    minWidth: 72,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  apkChipCompact: {
    alignItems: 'center',
    gap: SPACING.xs,
    minWidth: 44,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  apkChipDate: {
    fontSize: 11,
    textAlign: 'center',
  },
  apkChipVersion: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  apkListContent: {
    paddingHorizontal: SPACING.sm,
  },
  centeredIcon: {
    marginBottom: SPACING.lg,
  },
  changelogScroll: {
    maxHeight: 260,
    marginTop: SPACING.xs,
  },
  changelogSection: {
    marginBottom: SPACING.md,
  },
  changelogText: {
    fontSize: 13,
    lineHeight: 20,
  },
  changelogTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    textTransform: 'uppercase',
  },
  changelogVersion: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
  },
  checkingContainer: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.lg,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING * 2,
  },
  checkingText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  downloadedApksCompact: {
    flex: 1,
    overflow: 'hidden',
  },
  downloadedApksSection: {
    paddingBottom: SPACING.md,
  },
  downloadedApksTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingBottom: SPACING.sm,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: SPACING.md,
    textTransform: 'uppercase',
  },
  downloadedApksTitleCompact: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  errorContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING * 2,
    paddingVertical: SPACING.xl,
  },
  resultContainer: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  updateActionColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  updateBottomRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  updateButtonCompact: {
    alignSelf: 'stretch',
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  updateButtonCurrentVersion: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  updateButtonVersion: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  updateDivider: {
    marginTop: SPACING.sm,
  },
  updateVersionText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  upToDateContent: {
    flex: 1,
    paddingVertical: SPACING.xl,
  },
  upToDateHeader: {
    alignItems: 'center',
    paddingBottom: SPACING.lg,
    paddingHorizontal: HORIZONTAL_PADDING * 2,
  },
});
