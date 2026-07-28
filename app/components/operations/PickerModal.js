import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, Modal, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import * as Currency from '../../services/currency';
import currencies from '../../../assets/currencies.json';
import ModalBlurOverlay from '../ModalBlurOverlay';
import CategoryGridSelector from '../CategoryGridSelector';
import { SPACING } from '../../styles/designTokens';

/**
 * Get currency symbol from currency code
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

/**
 * Unified picker modal for account and category selection.
 *
 * Accounts are a list and render as one. Categories are a tree, so they render
 * through CategoryGridSelector — the app's shared category grid, which owns the
 * drill-down (see CLAUDE.md, "Category selection"). `pickerData` is therefore the
 * whole category list, not one folder level.
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
  const renderAccountItem = useCallback(({ item }) => (
    <Pressable
      onPress={() => {
        if (pickerType === 'account') {
          onSelectAccount(item.id);
          onClose();
        } else {
          const hasValidAmount = quickAddValues?.amount &&
          quickAddValues.amount.trim() !== '';
          if (hasValidAmount && onAutoAddWithAccount) {
            onAutoAddWithAccount(item.id);
          } else {
            onSelectToAccount(item.id);
            onClose();
          }
        }
      }}
      style={({ pressed }) => [
        styles.pickerOption,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.selected },
      ]}
    >
      <View style={styles.accountOption}>
        <Text style={[styles.pickerOptionText, styles.accountName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.pickerSmallText, { color: colors.mutedText }]} numberOfLines={1}>
          {getCurrencySymbol(item.currency)}{Currency.formatAmount(item.balance, item.currency)}
        </Text>
      </View>
    </Pressable>
  ), [pickerType, quickAddValues, colors, onClose, onSelectAccount, onSelectToAccount, onAutoAddWithAccount]);

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
                <FlatList
                  data={pickerType === 'account' || pickerType === 'toAccount' ? pickerData : []}
                  keyExtractor={(item) => item.id || item.key}
                  renderItem={renderAccountItem}
                  ListEmptyComponent={
                    <Text style={[styles.centeredPaddedText, { color: colors.mutedText }]}>
                      {t('no_accounts')}
                    </Text>
                  }
                />
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
  accountName: {
    flex: 1,
    marginRight: 4,
  },
  accountOption: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  centeredPaddedText: {
    paddingVertical: 40,
    textAlign: 'center',
  },
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
  pickerOption: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerOptionText: {
    fontSize: 16,
  },
  pickerSmallText: {
    fontSize: 14,
    marginLeft: 8,
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
