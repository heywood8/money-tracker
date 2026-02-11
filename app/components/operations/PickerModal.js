import React from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Currency from '../../services/currency';
import currencies from '../../../assets/currencies.json';

/**
 * Get currency symbol from currency code
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

/**
 * Unified picker modal for account and category selection
 * Supports hierarchical category navigation with breadcrumbs
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
  categoryNavigation,
  quickAddValues,
  onNavigateBack,
  onNavigateIntoFolder,
  onSelectCategory,
  onAutoAddWithCategory,
  onAutoAddWithAccount,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Breadcrumb navigation for categories */}
          {pickerType === 'category' && categoryNavigation.breadcrumb.length > 0 && (
            <View style={[styles.breadcrumbContainer, { borderBottomColor: colors.border }]}>
              <Pressable onPress={onNavigateBack} style={styles.backButton}>
                <Icon name="arrow-left" size={24} color={colors.primary} />
              </Pressable>
              <Text style={[styles.breadcrumbText, { color: colors.text }]} numberOfLines={1}>
                {categoryNavigation.breadcrumb[categoryNavigation.breadcrumb.length - 1].name}
              </Text>
            </View>
          )}

          <FlatList
            data={pickerData}
            keyExtractor={(item) => item.id || item.key}
            renderItem={({ item }) => {
              if (pickerType === 'account' || pickerType === 'toAccount') {
                return (
                  <Pressable
                    onPress={async () => {
                      if (pickerType === 'account') {
                        onSelectAccount(item.id);
                        onClose();
                      } else {
                        // toAccount: auto-add if amount is set
                        const hasValidAmount = quickAddValues?.amount &&
                          quickAddValues.amount.trim() !== '';
                        if (hasValidAmount && onAutoAddWithAccount) {
                          await onAutoAddWithAccount(item.id);
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
                      <Text style={[styles.pickerOptionText, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.pickerSmallText, { color: colors.mutedText }]}>
                        {getCurrencySymbol(item.currency)}{Currency.formatAmount(item.balance, item.currency)}
                      </Text>
                    </View>
                  </Pressable>
                );
              } else if (pickerType === 'category') {
                // Determine if this is a folder or entry
                const isFolder = item.type === 'folder';

                return (
                  <Pressable
                    onPress={async () => {
                      if (isFolder) {
                        // Navigate into folder
                        onNavigateIntoFolder(item);
                      } else {
                        // Check if amount is valid and auto-add operation
                        const hasValidAmount = quickAddValues.amount &&
                          quickAddValues.amount.trim() !== '';

                        if (hasValidAmount) {
                          // Auto-add with category
                          await onAutoAddWithCategory(item.id);
                        } else {
                          // Just select the category without auto-add
                          onSelectCategory(item.id);
                          onClose();
                        }
                      }
                    }}
                    style={({ pressed }) => [
                      styles.pickerOption,
                      { borderColor: colors.border },
                      pressed && { backgroundColor: colors.selected },
                      // Highlight selected category
                      !isFolder && quickAddValues.categoryId === item.id && { backgroundColor: colors.selected },
                    ]}
                  >
                    <View style={styles.categoryOption}>
                      <Icon name={item.icon} size={24} color={colors.text} />
                      <Text style={[styles.pickerOptionText, styles.pickerOptionTextExpanded, { color: colors.text }]}>
                        {item.nameKey ? t(item.nameKey) : item.name}
                      </Text>
                      {isFolder && <Icon name="chevron-right" size={24} color={colors.mutedText} />}
                    </View>
                  </Pressable>
                );
              }
              return null;
            }}
            ListEmptyComponent={
              <Text style={[styles.centeredPaddedText, { color: colors.mutedText }]}>
                {pickerType === 'category' ? t('no_categories') : t('no_accounts')}
              </Text>
            }
          />
          {/* Action buttons - only show Close button for non-category pickers */}
          {pickerType !== 'category' && (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  accountOption: {
    alignItems: 'flex-start',
    flex: 1,
    justifyContent: 'center',
  },
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  breadcrumbContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  breadcrumbText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  categoryOption: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
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
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  pickerOptionTextExpanded: {
    flex: 1,
  },
  pickerSmallText: {
    fontSize: 14,
    marginTop: 4,
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
  categoryNavigation: PropTypes.object,
  quickAddValues: PropTypes.object,
  onNavigateBack: PropTypes.func,
  onNavigateIntoFolder: PropTypes.func,
  onSelectCategory: PropTypes.func,
  onAutoAddWithCategory: PropTypes.func,
  onAutoAddWithAccount: PropTypes.func,
};

export default PickerModal;
