import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Portal, Modal, Text, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import UpdateContentPanel from '../components/UpdateContentPanel';

export default function UpdateAvailableModal({ visible, onDismiss, onUpdate, updateData }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();

  if (!updateData) return null;

  const updateResult = { type: 'available', ...updateData };

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
          <UpdateContentPanel
            isChecking={false}
            updateResult={updateResult}
            downloadedApks={[]}
            onUpdate={onUpdate}
          />
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
});
