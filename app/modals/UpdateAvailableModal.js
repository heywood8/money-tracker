import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, ScrollView } from 'react-native';
import { Portal, Modal, Text, Divider, TouchableRipple } from 'react-native-paper';
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

export default function UpdateAvailableModal({ visible, onDismiss, onUpdate, updateData }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      contentAnim.setValue(0);
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, contentAnim]);

  if (!updateData) return null;

  const { latestVersion, currentVersion, downloadUrl, releaseNotes } = updateData;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} dismissable>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onDismiss} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text variant="titleLarge" style={[styles.headerTitle, { color: colors.text }]}>
              {t('update_available_title') || 'Update available'}
            </Text>
            <View style={styles.backButton} />
          </View>

          <Divider />

          <Animated.View style={[styles.resultContainer, { opacity: contentAnim }]}>
            <View style={styles.updateAvailableHeader}>
              <Ionicons name="download-outline" size={36} color={colors.primary} />
              <View style={styles.updateVersionInfo}>
                <Text style={[styles.updateNewVersion, { color: colors.text }]}>
                  v{latestVersion}
                </Text>
                <Text style={[styles.updateCurrentVersion, { color: colors.mutedText }]}>
                  {(t('update_from_version') || 'installed: v{currentVersion}')
                    .replace('{currentVersion}', currentVersion)}
                </Text>
              </View>
            </View>

            {releaseNotes ? (
              <>
                <Divider style={styles.updateDivider} />
                <Text style={[styles.changelogTitle, { color: colors.mutedText }]}>
                  {t('whats_new') || "What's new"}
                </Text>
                <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
                  {releaseNotes.map(({ version, notes }) => (
                    <View key={version} style={styles.changelogSection}>
                      {releaseNotes.length > 1 && (
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

            <View style={styles.updateActions}>
              {releaseNotes && (
                <Text style={[styles.updateHintText, { color: colors.mutedText }]}>
                  {t('update_install_hint') || 'If installation is blocked, allow "Install unknown apps" for your browser or file manager in Android settings.'}
                </Text>
              )}
              <TouchableRipple
                onPress={() => onUpdate(downloadUrl)}
                style={[styles.updateButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.updateButtonText}>
                  {t('update_now') || 'Update now'}
                </Text>
              </TouchableRipple>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </Portal>
  );
}

UpdateAvailableModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  updateData: PropTypes.shape({
    latestVersion: PropTypes.string.isRequired,
    currentVersion: PropTypes.string.isRequired,
    downloadUrl: PropTypes.string.isRequired,
    releaseNotes: PropTypes.arrayOf(PropTypes.shape({
      version: PropTypes.string,
      notes: PropTypes.string,
    })),
  }),
};

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  changelogScroll: {
    flex: 1,
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  headerTitle: {
    fontWeight: '600',
  },
  modalContainer: {
    borderRadius: BORDER_RADIUS.lg,
    margin: SPACING.md,
    maxHeight: '95%',
    overflow: 'hidden',
  },
  resultContainer: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  updateActions: {
    paddingTop: SPACING.md,
  },
  updateAvailableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  updateButton: {
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  updateCurrentVersion: {
    fontSize: 13,
    marginTop: 2,
  },
  updateDivider: {
    marginTop: SPACING.sm,
  },
  updateHintText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  updateNewVersion: {
    fontSize: 20,
    fontWeight: '600',
  },
  updateVersionInfo: {
    flex: 1,
  },
  updateVersionText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
