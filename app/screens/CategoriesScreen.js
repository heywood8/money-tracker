import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useBudgets } from '../contexts/BudgetsContext';
import CategoryModal from '../modals/CategoryModal';
import BudgetModal from '../modals/BudgetModal';
import BudgetProgressBar from '../components/BudgetProgressBar';

const CategoriesScreen = () => {
  const { colors } = useTheme();
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


  const renderCategory = useCallback(({ item }) => {
    const category = item;
    const depth = item.depth;
    const children = getChildren(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const indentWidth = depth * 20;
    const categoryType = category.category_type || category.categoryType || 'expense';
    const rowBackgroundColor = categoryType === 'expense' ? colors.expenseBackground : colors.incomeBackground;
    const hasBudget = hasActiveBudget(category.id);
    const budget = hasBudget ? getBudgetForCategory(category.id) : null;

    return (
      <View style={[styles.itemBorder, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          style={[
            styles.categoryRow,
            {
              backgroundColor: rowBackgroundColor,
            },
          ]}
          onPress={() => {
            if (hasChildren) {
              toggleExpanded(category.id);
            } else {
              handleEditCategory(category);
            }
          }}
          onLongPress={() => handleCategoryLongPress(category)}
          accessibilityRole="button"
          accessibilityLabel={`${category.nameKey ? t(category.nameKey) : category.name} category, ${categoryType}`}
          accessibilityHint={hasChildren ? 'Double tap to expand or collapse' : 'Double tap to edit'}
        >
          <View style={[styles.categoryContent, { paddingLeft: HORIZONTAL_PADDING + indentWidth }]}>
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

            {/* Category Icon */}
            <Icon name={category.icon} size={22} color={colors.text} style={styles.categoryIcon} accessible={false} />

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
        </TouchableOpacity>

        {/* Budget Progress Bar */}
        {budget && (
          <View style={[styles.progressBarContainer, { paddingLeft: HORIZONTAL_PADDING + indentWidth, backgroundColor: rowBackgroundColor }]}>
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
      <FlatList
        data={flattenedCategories}
        renderItem={renderCategory}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: colors.mutedText }}>{t('no_categories')}</Text>
          </View>
        }
        contentContainerStyle={flattenedCategories.length === 0 ? styles.emptyList : null}
        windowSize={10}
        maxToRenderPerBatch={10}
        initialNumToRender={15}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
      />

      <FAB
        icon="plus"
        label={t('add_category')}
        style={styles.fab}
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
  budgetIcon: {
    marginLeft: 8,
  },
  categoryContent: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: 16,
    paddingVertical: 6,
  },
  categoryIcon: {
    marginRight: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  categoryRow: {
    minHeight: 44,
  },
  container: {
    flex: 1,
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
    marginRight: 4,
    width: 32,
  },
  fab: {
    bottom: 0,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  itemBorder: {
    borderBottomWidth: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarContainer: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionMarginTop: {
    marginTop: 12,
  },
});

export default CategoriesScreen;
