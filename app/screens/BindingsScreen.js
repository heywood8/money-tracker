import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TextInput as RNTextInput } from 'react-native';
import { Text, Divider, TouchableRipple, FAB, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useCardBindings } from '../contexts/CardBindingsContext';
import { useMerchantBindings } from '../contexts/MerchantBindingsContext';
import { useAccounts } from '../contexts/AccountsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useDialog } from '../contexts/DialogContext';
import Header from '../components/Header';

/**
 * BindingsScreen - Manage card and merchant bindings
 *
 * Allows users to view, edit, and delete bindings that map:
 * - Card masks to accounts (for auto-detecting which account a transaction belongs to)
 * - Merchant names to categories (for auto-categorizing transactions)
 */
export default function BindingsScreen({ onClose }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { showDialog } = useDialog();

  const { bindings: cardBindings, removeBinding: removeCardBinding, loadBindings: reloadCardBindings } = useCardBindings();
  const { bindings: merchantBindings, removeBinding: removeMerchantBinding, loadBindings: reloadMerchantBindings } = useMerchantBindings();
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('cards'); // 'cards' or 'merchants'

  // Helper to get account name by ID
  const getAccountName = (accountId) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : t('unknown_account') || 'Unknown Account';
  };

  // Helper to get category name by ID
  const getCategoryName = (categoryId) => {
    const findCategory = (cats, id) => {
      for (const cat of cats) {
        if (cat.id === id) return cat.name;
        if (cat.children) {
          const found = findCategory(cat.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const name = findCategory(categories, categoryId);
    return name || t('unknown_category') || 'Unknown Category';
  };

  // Filter bindings based on search query
  const filteredCardBindings = useMemo(() => {
    if (!searchQuery.trim()) return cardBindings;
    const query = searchQuery.toLowerCase();
    return cardBindings.filter(binding =>
      binding.cardMask.toLowerCase().includes(query) ||
      (binding.bankName && binding.bankName.toLowerCase().includes(query)) ||
      getAccountName(binding.accountId).toLowerCase().includes(query)
    );
  }, [cardBindings, searchQuery, accounts]);

  const filteredMerchantBindings = useMemo(() => {
    if (!searchQuery.trim()) return merchantBindings;
    const query = searchQuery.toLowerCase();
    return merchantBindings.filter(binding =>
      binding.merchantName.toLowerCase().includes(query) ||
      getCategoryName(binding.categoryId).toLowerCase().includes(query)
    );
  }, [merchantBindings, searchQuery, categories]);

  // Handle deleting a card binding
  const handleDeleteCardBinding = (binding) => {
    showDialog(
      t('delete_card_binding') || 'Delete Card Binding',
      t('delete_card_binding_confirm') || `Remove binding for ${binding.cardMask}?`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeCardBinding(binding.id);
              await reloadCardBindings();
            } catch (error) {
              console.error('Failed to delete card binding:', error);
            }
          },
        },
      ]
    );
  };

  // Handle deleting a merchant binding
  const handleDeleteMerchantBinding = (binding) => {
    showDialog(
      t('delete_merchant_binding') || 'Delete Merchant Binding',
      t('delete_merchant_binding_confirm') || `Remove binding for "${binding.merchantName}"?`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMerchantBinding(binding.id);
              await reloadMerchantBindings();
            } catch (error) {
              console.error('Failed to delete merchant binding:', error);
            }
          },
        },
      ]
    );
  };

  const renderCardBinding = (binding) => (
    <TouchableRipple
      key={binding.id}
      style={[styles.bindingItem, { backgroundColor: colors.surface }]}
      onPress={() => handleDeleteCardBinding(binding)}
    >
      <View style={styles.bindingContent}>
        <View style={styles.bindingIcon}>
          <Ionicons name="card-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.bindingInfo}>
          <Text style={[styles.bindingTitle, { color: colors.text }]}>
            {binding.cardMask}
          </Text>
          <Text style={[styles.bindingSubtitle, { color: colors.mutedText }]}>
            {getAccountName(binding.accountId)}
          </Text>
          {binding.bankName && (
            <Text style={[styles.bindingMeta, { color: colors.mutedText }]}>
              {binding.bankName}
            </Text>
          )}
        </View>
        <Ionicons name="trash-outline" size={20} color="#b33" />
      </View>
    </TouchableRipple>
  );

  const renderMerchantBinding = (binding) => (
    <TouchableRipple
      key={binding.id}
      style={[styles.bindingItem, { backgroundColor: colors.surface }]}
      onPress={() => handleDeleteMerchantBinding(binding)}
    >
      <View style={styles.bindingContent}>
        <View style={styles.bindingIcon}>
          <Ionicons name="storefront-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.bindingInfo}>
          <Text style={[styles.bindingTitle, { color: colors.text }]}>
            {binding.merchantName}
          </Text>
          <Text style={[styles.bindingSubtitle, { color: colors.mutedText }]}>
            {getCategoryName(binding.categoryId)}
          </Text>
        </View>
        <Ionicons name="trash-outline" size={20} color="#b33" />
      </View>
    </TouchableRipple>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('manage_bindings') || 'Manage Bindings'}
        leftIcon="arrow-back"
        onLeftPress={onClose}
      />

      {/* Tab Selector */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableRipple
          style={[
            styles.tab,
            activeTab === 'cards' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setActiveTab('cards')}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name="card-outline"
              size={20}
              color={activeTab === 'cards' ? colors.primary : colors.mutedText}
            />
            <Text style={[
              styles.tabLabel,
              { color: activeTab === 'cards' ? colors.primary : colors.mutedText }
            ]}>
              {t('card_bindings') || 'Card Bindings'}
            </Text>
            <View style={[
              styles.badge,
              { backgroundColor: activeTab === 'cards' ? colors.primary : colors.mutedText }
            ]}>
              <Text style={styles.badgeText}>{cardBindings.length}</Text>
            </View>
          </View>
        </TouchableRipple>

        <TouchableRipple
          style={[
            styles.tab,
            activeTab === 'merchants' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setActiveTab('merchants')}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name="storefront-outline"
              size={20}
              color={activeTab === 'merchants' ? colors.primary : colors.mutedText}
            />
            <Text style={[
              styles.tabLabel,
              { color: activeTab === 'merchants' ? colors.primary : colors.mutedText }
            ]}>
              {t('merchant_bindings') || 'Merchant Bindings'}
            </Text>
            <View style={[
              styles.badge,
              { backgroundColor: activeTab === 'merchants' ? colors.primary : colors.mutedText }
            ]}>
              <Text style={styles.badgeText}>{merchantBindings.length}</Text>
            </View>
          </View>
        </TouchableRipple>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder={t('search') || 'Search'}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: colors.surface }]}
          inputStyle={{ color: colors.text }}
          iconColor={colors.mutedText}
        />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {activeTab === 'cards' ? (
          <View style={styles.listContainer}>
            {filteredCardBindings.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="card-outline" size={48} color={colors.mutedText} />
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                  {searchQuery ? (t('no_results') || 'No results found') : (t('no_card_bindings') || 'No card bindings yet')}
                </Text>
                {!searchQuery && (
                  <Text style={[styles.emptySubtext, { color: colors.mutedText }]}>
                    {t('card_bindings_help') || 'Card bindings will be created automatically when you process notifications'}
                  </Text>
                )}
              </View>
            ) : (
              filteredCardBindings.map(renderCardBinding)
            )}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredMerchantBindings.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="storefront-outline" size={48} color={colors.mutedText} />
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                  {searchQuery ? (t('no_results') || 'No results found') : (t('no_merchant_bindings') || 'No merchant bindings yet')}
                </Text>
                {!searchQuery && (
                  <Text style={[styles.emptySubtext, { color: colors.mutedText }]}>
                    {t('merchant_bindings_help') || 'Merchant bindings will be created automatically when you process notifications'}
                  </Text>
                )}
              </View>
            ) : (
              filteredMerchantBindings.map(renderMerchantBinding)
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  bindingContent: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: 16,
  },
  bindingIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  bindingInfo: {
    flex: 1,
  },
  bindingItem: {
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  bindingMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  bindingSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  bindingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  scrollView: {
    flex: 1,
  },
  searchBar: {
    borderRadius: 8,
    elevation: 0,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  tab: {
    borderBottomWidth: 3,
    borderColor: 'transparent',
    flex: 1,
  },
  tabContainer: {
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  tabContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
