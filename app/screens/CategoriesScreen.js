import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useBudgets } from '../contexts/BudgetsContext';
import CategoryModal from '../modals/CategoryModal';
import BudgetModal from '../modals/BudgetModal';
import BudgetProgressBar from '../components/BudgetProgressBar';
import ListCard from '../components/ListCard';

const CategoriesScreen = () => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { categories, loading, expandedIds, toggleExpanded, getChildren } = useCategories();
  const { hasActiveBudget, getBudgetForCategory } = useBudgets();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState(null);
  const [isBudgetNew, setIsBudgetNew] = useState(false);

  const [viewMode, setViewMode] = useState('grid');
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

  const handleSetBudget = useCallback((category) => {
    const hasBudget = hasActiveBudget(category.id);
    const existingBudget = hasBudget ? getBudgetForCategory(category.id) : null;

    setBudgetCategory(category);
    setIsBudgetNew(!existingBudget);
    setBudgetModalVisible(true);
  }, [hasActiveBudget, getBudgetForCategory]);

  const handleCategoryLongPress = useCallback((category) => {
    const hasBudget = hasActiveBudget(category.id);
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
          text: hasBudget ? t('edit_budget') : t('set_budget'),
          onPress: () => handleSetBudget(category),
        },
        {
          text: t('cancel'),
          style: 'cancel',
        },
      ],
    );
  }, [t, handleEditCategory, handleSetBudget, hasActiveBudget, showDialog]);

  // Flatten the category tree based on expanded state (excluding shadow categories)
  const flattenedCategories = useMemo(() => {
    const flattened = [];
    // Filter out shadow categories from display
    const visibleCategories = categories.filter(cat => !cat.isShadow);
    const rootCategories = visibleCategories.filter(cat => !cat.parentId);

    const addWithChildren = (category, depth = 0) => {
      flattened.push({ ...category, depth });

      if (expandedIds.has(category.id)) {
        const children = visibleCategories.filter(cat => cat.parentId === category.id);
        children.forEach(child => addWithChildren(child, depth + 1));
      }
    };

    rootCategories.forEach(cat => addWithChildren(cat));
    return flattened;
  }, [categories, expandedIds]);


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
        <Icon name={category.icon} size={28} color={iconColor} accessible={false} />
        <Text style={[styles.gridCellName, { color: colors.text }]} numberOfLines={2}>
          {name}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, t, getChildren, handleGridCellPress, handleCategoryLongPress]);

  const renderCategory = useCallback(({ item }) => {
    const category = item;
    const depth = item.depth;
    const children = getChildren(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const indentWidth = depth * 20;
    const categoryType = category.category_type || category.categoryType || 'expense';
    const hasBudget = hasActiveBudget(category.id);
    const budget = hasBudget ? getBudgetForCategory(category.id) : null;

    return (
      <View>
        <ListCard
          variant={categoryType}
          onPress={() => {
            if (hasChildren) {
              toggleExpanded(category.id);
            } else {
              handleEditCategory(category);
            }
          }}
          onLongPress={() => handleCategoryLongPress(category)}
          leftIcon={category.icon}
          style={{ paddingLeft: indentWidth }}
          accessibilityLabel={`${category.nameKey ? t(category.nameKey) : category.name} category, ${categoryType}`}
          accessibilityHint={hasChildren ? 'Double tap to expand or collapse' : 'Double tap to edit'}
        >
          <View style={styles.categoryContent}>
            {/* Expand/Collapse Icon */}
            {hasChildren ? (
              <TouchableOpacity
                onPress={() => toggleExpanded(category.id)}
                style={styles.expandButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={
                  isExpanded
                    ? `Collapse ${category.nameKey ? t(category.nameKey) : category.name}`
                    : `Expand ${category.nameKey ? t(category.nameKey) : category.name}`
                }
                accessibilityHint="Shows or hides subcategories"
                accessibilityState={{ expanded: isExpanded }}
              >
                <Icon
                  name={isExpanded ? 'chevron-down' : 'chevron-right'}
                  size={18}
                  color={colors.mutedText}
                  accessible={false}
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.expandButton} />
            )}

            {/* Category Name */}
            <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
              {category.nameKey ? t(category.nameKey) : category.name}
            </Text>

            {/* Budget Indicator */}
            {hasBudget && (
              <Icon
                name="cash-clock"
                size={18}
                color={colors.primary}
                style={styles.budgetIcon}
                accessible={false}
              />
            )}
          </View>
        </ListCard>

        {/* Budget Progress Bar */}
        {budget && (
          <View style={[styles.progressBarContainer, { paddingLeft: HORIZONTAL_PADDING + indentWidth }]}>
            <BudgetProgressBar budgetId={budget.id} compact={false} showDetails={true} />
          </View>
        )}
      </View>
    );
  }, [colors, t, expandedIds, getChildren, toggleExpanded, handleEditCategory, handleCategoryLongPress, hasActiveBudget, getBudgetForCategory]);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={[styles.sectionMarginTop, { color: colors.mutedText }]}> 
          {t('loading_categories') || 'Loading categories...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Toggle bar */}
      <View style={[styles.toggleBar, { borderBottomColor: colors.border }]}>
        {viewMode === 'grid' && gridParentId !== null ? (
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
        ) : (
          <View />
        )}
        <View style={styles.toggleButtons}>
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.selected }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="List view"
          >
            <Icon name="format-list-bulleted" size={18} color={viewMode === 'list' ? colors.primary : colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setViewMode('grid'); setGridParentId(null); }}
            style={[styles.toggleBtn, viewMode === 'grid' && { backgroundColor: colors.selected }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Grid view"
          >
            <Icon name="view-grid" size={18} color={viewMode === 'grid' ? colors.primary : colors.mutedText} />
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'grid' ? (
        <FlatList
          key="grid"
          data={gridCategories}
          renderItem={renderGridCell}
          keyExtractor={item => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ color: colors.mutedText }}>{t('no_categories')}</Text>
            </View>
          }
          contentContainerStyle={gridCategories.length === 0 ? styles.emptyList : styles.gridContent}
          windowSize={10}
          removeClippedSubviews={true}
        />
      ) : (
        <FlatList
          key="list"
          data={flattenedCategories}
          renderItem={renderCategory}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ color: colors.mutedText }}>{t('no_categories')}</Text>
            </View>
          }
          contentContainerStyle={flattenedCategories.length === 0 ? styles.emptyList : styles.listContent}
          windowSize={10}
          maxToRenderPerBatch={10}
          initialNumToRender={15}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={true}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: colors.surface + 'DE', borderColor: colors.border + '80' }]}
        color={colors.text}
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

      <BudgetModal
        visible={budgetModalVisible}
        onClose={() => setBudgetModalVisible(false)}
        budget={isBudgetNew ? null : getBudgetForCategory(budgetCategory?.id)}
        categoryId={budgetCategory?.id}
        categoryName={budgetCategory?.nameKey ? t(budgetCategory.nameKey) : budgetCategory?.name}
        isNew={isBudgetNew}
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
  budgetIcon: {
    marginLeft: SPACING.sm,
  },
  categoryContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    paddingTop: TOP_CONTENT_SPACING,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: TOP_CONTENT_SPACING,
  },
  emptyList: {
    flex: 1,
  },
  expandButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    marginRight: SPACING.xs,
    width: 32,
  },
  fab: {
    borderRadius: 28,
    borderWidth: 1,
    bottom: 100,
    elevation: 8,
    margin: SPACING.lg,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
  listContent: {
    paddingBottom: 180,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarContainer: {
    paddingBottom: SPACING.md,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  sectionMarginTop: {
    marginTop: SPACING.md,
  },
  toggleBar: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  toggleBtn: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.xs,
  },
  toggleButtons: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
});

export default CategoriesScreen;
