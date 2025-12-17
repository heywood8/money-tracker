import React, { useState, useMemo } from 'react';
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
import { useCategories } from '../contexts/CategoriesContext';
import { useMerchantBindings } from '../contexts/MerchantBindingsContext';

/**
 * Modal for selecting a category to bind to a merchant
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Close callback
 * @param {string} merchantName - Merchant name (e.g., "YANDEX.GO, AM")
 * @param {string} transactionType - Transaction type ('expense', 'income', 'transfer')
 */
export default function SelectCategoryForMerchantModal({ visible, onClose, merchantName, transactionType = 'expense' }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { categories } = useCategories();
  const { addBinding } = useMerchantBindings();

  // State for hierarchical navigation
  const [navigationStack, setNavigationStack] = useState([]);

  // Get current parent ID from navigation stack
  const currentParentId = navigationStack.length > 0 ? navigationStack[navigationStack.length - 1].id : null;

  // Filter categories by type (expense/income) and current parent
  const visibleCategories = useMemo(() => {
    return categories.filter(cat => {
      const catType = cat.category_type || cat.categoryType;
      const parentMatch = currentParentId ? cat.parentId === currentParentId : !cat.parentId;
      return catType === transactionType && parentMatch && !cat.isShadow;
    });
  }, [categories, transactionType, currentParentId]);

  const handleSelectCategory = async (category) => {
    if (category.type === 'folder') {
      // Navigate into folder
      const folderName = category.nameKey ? t(category.nameKey) : category.name;
      setNavigationStack(prev => [...prev, { id: category.id, name: folderName }]);
    } else {
      // Select entry category
      try {
        await addBinding(merchantName, category.id);
        setNavigationStack([]);
        onClose();
      } catch (error) {
        console.error('Failed to create merchant binding:', error);
        // Error dialog is shown by the context
      }
    }
  };

  const navigateBack = () => {
    setNavigationStack(prev => prev.slice(0, -1));
  };

  const handleClose = () => {
    setNavigationStack([]);
    onClose();
  };

  const renderCategoryItem = ({ item }) => {
    const isFolder = item.type === 'folder';
    const icon = item.icon || (isFolder ? 'folder' : 'tag');
    const name = item.nameKey ? t(item.nameKey) : item.name;
    const iconColor = item.color || colors.mutedText;

    return (
      <TouchableOpacity
        style={[styles.categoryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handleSelectCategory(item)}
        activeOpacity={0.7}
      >
        <View style={styles.categoryInfo}>
          <Icon name={icon} size={24} color={iconColor} />
          <Text style={[styles.categoryName, { color: colors.text }]}>{name}</Text>
        </View>
        <Icon name={isFolder ? 'chevron-right' : 'check-circle-outline'} size={24} color={colors.mutedText} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Icon name="tag" size={32} color={colors.primary} />
              <View style={styles.headerText}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t('select_category_for_merchant')}
                </Text>
                <Text style={[styles.merchantInfo, { color: colors.mutedText }]} numberOfLines={1}>
                  {merchantName}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {/* Breadcrumb Navigation */}
          {navigationStack.length > 0 && (
            <View style={[styles.breadcrumbContainer, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={navigateBack} style={styles.backButton}>
                <Icon name="arrow-left" size={24} color={colors.primary} />
              </TouchableOpacity>
              <Text style={[styles.breadcrumbText, { color: colors.text }]} numberOfLines={1}>
                {navigationStack[navigationStack.length - 1].name}
              </Text>
            </View>
          )}

          {/* Category List */}
          <View style={styles.listContainer}>
            {visibleCategories.length > 0 ? (
              <FlatList
                data={visibleCategories}
                keyExtractor={(item) => item.id}
                renderItem={renderCategoryItem}
                contentContainerStyle={styles.listContent}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Icon name="folder-open-outline" size={64} color={colors.mutedText} />
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                  {navigationStack.length > 0 ? t('no_categories_in_folder') : t('no_categories_available')}
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
  merchantInfo: {
    fontSize: 14,
  },
  closeButton: {
    padding: 4,
  },
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  breadcrumbText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
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
