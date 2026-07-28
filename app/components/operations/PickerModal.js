import React, { useCallback } from 'react';
import { Text, StyleSheet, ScrollView, Modal, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import ModalBlurOverlay from '../ModalBlurOverlay';
import CategoryGridSelector from '../CategoryGridSelector';
import AccountGridSelector from '../AccountGridSelector';
import { SPACING } from '../../styles/designTokens';

/**
 * Unified picker modal for account and category selection.
 *
 * Neither list is rendered here: categories go through CategoryGridSelector and
 * accounts through AccountGridSelector, the app's two shared pickers (see
 * CLAUDE.md, "Category selection" and "Account selection"). `pickerData` is the
 * whole list in both cases — the grids decide what to show.
 */
const PickerModal = ({
  visible,
  pickerType,
  pickerData,
  colors,
  t,
  onClose,
  // Account selection
  onSelectAccount,
  onSelectToAccount,
  // Category selection
  categoryType = 'expense',
  quickAddValues,
  onSelectCategory,
  onAutoAddWithCategory,
  onAutoAddWithAccount,
}) => {
  // The source account replaces the selection outright. A transfer destination
  // with an amount already typed completes the operation on the spot — the same
  // shortcut the category grid offers below.
  const handleSelectAccount = useCallback((accountId) => {
    if (pickerType === 'account') {
      onSelectAccount(accountId);
      onClose();
      return;
    }
    const hasValidAmount = quickAddValues?.amount && quickAddValues.amount.trim() !== '';
    if (hasValidAmount && onAutoAddWithAccount) {
      onAutoAddWithAccount(accountId);
    } else {
      onSelectToAccount(accountId);
      onClose();
    }
  }, [pickerType, quickAddValues, onClose, onSelectAccount, onSelectToAccount, onAutoAddWithAccount]);

  // A category tapped with an amount already typed completes the operation on the
  // spot — that shortcut is the whole point of the quick-add flow.
  const handleSelectCategory = useCallback((categoryId) => {
    const hasValidAmount = quickAddValues?.amount && quickAddValues.amount.trim() !== '';
    if (hasValidAmount && onAutoAddWithCategory) {
      onAutoAddWithCategory(categoryId);
    } else {
      onSelectCategory(categoryId);
      onClose();
    }
  }, [quickAddValues, onAutoAddWithCategory, onSelectCategory, onClose]);

  return (
    <>
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            {pickerType === 'category' ? (
              <ScrollView contentContainerStyle={styles.gridContent} keyboardShouldPersistTaps="handled">
                <CategoryGridSelector
                  categories={pickerData}
                  categoryType={categoryType}
                  selectedCategoryId={quickAddValues?.categoryId || null}
                  onSelect={handleSelectCategory}
                  colors={colors}
                  t={t}
                />
              </ScrollView>
            ) : (
              <>
                <ScrollView contentContainerStyle={styles.gridContent} keyboardShouldPersistTaps="handled">
                  <AccountGridSelector
                    accounts={pickerType === 'account' || pickerType === 'toAccount' ? pickerData : []}
                    selectedAccountId={pickerType === 'account' ? quickAddValues?.accountId : quickAddValues?.toAccountId}
                    onSelect={handleSelectAccount}
                    colors={colors}
                    t={t}
                    icon={pickerType === 'toAccount' ? 'bank-transfer-in' : 'wallet-outline'}
                  />
                </ScrollView>
                <Pressable style={styles.closeButton} onPress={onClose}>
                  <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  gridContent: {
    padding: SPACING.sm,
  },
  modalOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    width: '100%',
  },
});

PickerModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  pickerType: PropTypes.string,
  pickerData: PropTypes.array.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelectAccount: PropTypes.func,
  onSelectToAccount: PropTypes.func,
  categoryType: PropTypes.oneOf(['expense', 'income']),
  quickAddValues: PropTypes.object,
  onSelectCategory: PropTypes.func,
  onAutoAddWithCategory: PropTypes.func,
  onAutoAddWithAccount: PropTypes.func,
};

export default PickerModal;
