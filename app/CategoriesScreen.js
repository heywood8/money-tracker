import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useCategories } from './CategoriesContext';
import CategoryModal from './CategoryModal';

const CategoriesScreen = () => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { categories, loading, expandedIds, toggleExpanded, getChildren, deleteCategory } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isNew, setIsNew] = useState(false);

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

  const handleDeleteCategory = (category) => {
    Alert.alert(
      t('delete_category'),
      t('delete_category_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => deleteCategory(category.id),
        },
      ]
    );
  };

  // Flatten the category tree based on expanded state
  const flattenedCategories = useMemo(() => {
    const flattened = [];
    const rootCategories = categories.filter(cat => !cat.parentId);

    const addWithChildren = (category, depth = 0) => {
      flattened.push({ ...category, depth });

      if (expandedIds.has(category.id)) {
        const children = getChildren(category.id);
        children.forEach(child => addWithChildren(child, depth + 1));
      }
    };

    rootCategories.forEach(cat => addWithChildren(cat));
    return flattened;
  }, [categories, expandedIds, getChildren]);

  const getItemLayout = useCallback((data, index) => ({
    length: 56,
    offset: 56 * index,
    index,
  }), []);

  const renderCategory = useCallback(({ item }) => {
    const category = item;
    const depth = item.depth;
    const children = getChildren(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const indentWidth = depth * 20;
    const categoryType = category.category_type || category.categoryType || 'expense';

    return (
      <TouchableOpacity
        style={[styles.categoryRow, { borderBottomColor: colors.border }]}
        onPress={() => {
          if (hasChildren) {
            toggleExpanded(category.id);
          } else {
            handleEditCategory(category);
          }
        }}
        onLongPress={() => handleEditCategory(category)}
        accessibilityRole="button"
        accessibilityLabel={`${category.nameKey ? t(category.nameKey) : category.name} category, ${categoryType}`}
        accessibilityHint={hasChildren ? "Double tap to expand or collapse" : "Double tap to edit"}
      >
        <View style={[styles.categoryContent, { paddingLeft: 16 + indentWidth }]}>
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
                size={20}
                color={colors.mutedText}
                accessible={false}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.expandButton} />
          )}

          {/* Category Icon */}
          <Icon name={category.icon} size={24} color={colors.text} style={styles.categoryIcon} accessible={false} />

          {/* Category Name */}
          <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
            {category.nameKey ? t(category.nameKey) : category.name}
          </Text>

          {/* Category Type Badge */}
          <View
            style={[styles.typeBadge, { backgroundColor: categoryType === 'expense' ? '#ff6b6b' : '#51cf66' }]}
            accessibilityLabel={`Type: ${categoryType}`}
          >
            <Text style={[styles.typeBadgeText, { color: '#fff' }]}>
              {categoryType === 'expense' ? 'E' : 'I'}
            </Text>
          </View>

          {/* Delete Button */}
          <TouchableOpacity
            onPress={() => handleDeleteCategory(category)}
            style={styles.deleteButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${category.nameKey ? t(category.nameKey) : category.name}`}
            accessibilityHint="Deletes this category and all subcategories"
          >
            <Icon name="delete-outline" size={20} color={colors.delete} accessible={false} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [colors, t, expandedIds, getChildren, toggleExpanded, handleEditCategory, handleDeleteCategory]);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 12, color: colors.mutedText }}>
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
        getItemLayout={getItemLayout}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryRow: {
    borderBottomWidth: 1,
    minHeight: 56,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
  },
  expandButton: {
    width: 44,
    height: 44,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: {
    marginRight: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  typeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyList: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default CategoriesScreen;
