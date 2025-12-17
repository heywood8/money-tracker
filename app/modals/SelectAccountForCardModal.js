import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccounts } from '../contexts/AccountsContext';
import { useCardBindings } from '../contexts/CardBindingsContext';

/**
 * Modal for selecting an account to bind to a card
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Close callback
 * @param {string} cardMask - Masked card number (e.g., "4083***7027")
 * @param {string} bankName - Bank name (e.g., "ARCA")
 */
export default function SelectAccountForCardModal({ visible, onClose, cardMask, bankName }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { accounts } = useAccounts();
  const { addBinding } = useCardBindings();

  // Filter to non-hidden accounts only
  const availableAccounts = useMemo(() => {
    return accounts.filter(acc => !acc.hidden);
  }, [accounts]);

  const handleSelectAccount = async (account) => {
    try {
      await addBinding(cardMask, account.id, bankName);
      onClose();
    } catch (error) {
      console.error('Failed to create card binding:', error);
      // Error dialog is shown by the context
    }
  };

  const renderAccountItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.accountItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => handleSelectAccount(item)}
      activeOpacity={0.7}
    >
      <View style={styles.accountInfo}>
        <Text style={[styles.accountName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.accountBalance, { color: colors.mutedText }]}>
          {item.balance} {item.currency}
        </Text>
      </View>
      <Icon name="chevron-right" size={24} color={colors.mutedText} />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Icon name="credit-card" size={32} color={colors.primary} />
              <View style={styles.headerText}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t('select_account_for_card')}
                </Text>
                <Text style={[styles.cardInfo, { color: colors.mutedText }]}>
                  {cardMask} {bankName ? `• ${bankName}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {/* Account List */}
          <View style={styles.listContainer}>
            {availableAccounts.length > 0 ? (
              <FlatList
                data={availableAccounts}
                keyExtractor={(item) => item.id}
                renderItem={renderAccountItem}
                contentContainerStyle={styles.listContent}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Icon name="wallet-outline" size={64} color={colors.mutedText} />
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                  {t('no_accounts_available')}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardInfo: {
    fontSize: 14,
  },
  closeButton: {
    padding: 4,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});
