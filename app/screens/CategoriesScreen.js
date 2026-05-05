import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import LoadingView from '../components/LoadingView';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, SPACING, BORDER_RADIUS } from '../styles/layout';
import AddFAB from '../components/AddFAB';
import EmptyState from '../components/EmptyState';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import CategoryModal from '../modals/CategoryModal';

const CategoriesScreen = () => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { categories, loading, getChildren } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const [gridParentId, setGridParentId] = useState(null);

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsNew(true);
    setModalVisible(true);
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setIsNew(false);
    setModalVisible(true);
  };

  const handleCategoryLongPress = useCallback((category) => {
    const categoryName = category.nameKey ? t(category.nameKey) : category.name;

    showDialog(
      categoryName,
      t('select_action'),
      [
        {
          text: t('edit_category'),
          onPress: () => handleEditCategory(category),
        },
        {
          text: t('cancel'),
          style: 'cancel',
        },
      ],
    );
  }, [t, handleEditCategory, showDialog]);

  const gridCategories = useMemo(() => {
    const visible = categories.filter(c => !c.isShadow);
    return visible.filter(c => (gridParentId === null ? !c.parentId : c.parentId === gridParentId));
  }, [categories, gridParentId]);

  const gridParentCategory = useMemo(() => {
    if (gridParentId === null) return null;
    return categories.find(c => c.id === gridParentId) || null;
  }, [categories, gridParentId]);

  const handleGridCellPress = useCallback((category) => {
    const hasChildren = getChildren(category.id).filter(c => !c.isShadow).length > 0;
    if (hasChildren) {
      setGridParentId(category.id);
    } else {
      handleEditCategory(category);
    }
  }, [getChildren, handleEditCategory]);

  const renderGridCell = useCallback(({ item: category }) => {
    const categoryType = category.category_type || category.categoryType || 'expense';
    const iconColor = categoryType === 'income' ? colors.income : colors.expense;
    const name = category.nameKey ? t(category.nameKey) : category.name;
    const hasChildren = getChildren(category.id).filter(c => !c.isShadow).length > 0;

    return (
      <TouchableOpacity
        style={[styles.gridCell, { backgroundColor: iconColor + '22', borderColor: colors.border }]}
        onPress={() => handleGridCellPress(category)}
        onLongPress={() => handleCategoryLongPress(category)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${name} category`}
      >
        <Icon name={category.icon} size={28} color={colors.text} accessible={false} />
        <Text style={[styles.gridCellName, { color: colors.text }]} numberOfLines={2}>
          {name}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, t, getChildren, handleGridCellPress, handleCategoryLongPress]);

  if (loading) {
    return <LoadingView message={t('loading_categories') || 'Loading categories...'} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {gridParentId !== null && (
        <View style={[styles.toggleBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => setGridParentId(null)}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back to all categories"
          >
            <Icon name="chevron-left" size={18} color={colors.primary} />
            <Text style={[styles.backLabel, { color: colors.primary }]}>
              {gridParentCategory?.nameKey ? t(gridParentCategory.nameKey) : gridParentCategory?.name}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={gridCategories}
        renderItem={renderGridCell}
        keyExtractor={item => item.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={
          <EmptyState icon="shape-outline" message={t('no_categories')} />
        }
        contentContainerStyle={gridCategories.length === 0 ? styles.emptyList : styles.gridContent}
        windowSize={10}
        removeClippedSubviews={true}
      />

      <AddFAB
        testID="categories-add-fab"
        onPress={handleAddCategory}
        accessibilityLabel={t('add_category')}
        accessibilityHint={t('add_category_hint') || 'Opens form to create a new category'}
      />

      <CategoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        category={editingCategory}
        isNew={isNew}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    paddingTop: TOP_CONTENT_SPACING,
  },
  emptyList: {
    flex: 1,
  },
  gridCell: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
    margin: SPACING.xs,
    padding: SPACING.md,
    width: (Dimensions.get('window').width - SPACING.sm * 2 - SPACING.xs * 2 * 3) / 3,
  },
  gridCellName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  gridContent: {
    padding: SPACING.sm,
    paddingBottom: 180,
  },
  gridRow: {
    justifyContent: 'flex-start',
  },
  toggleBar: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
});

export default CategoriesScreen;
