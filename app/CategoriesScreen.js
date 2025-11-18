import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Button, Alert, ActivityIndicator } from 'react-native';
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
    const rootCategories = categories.filter(cat => cat.type === 'folder');

    const addWithChildren = (category, depth = 0) => {
      flattened.push({ ...category, depth });

      const canExpand = category.type === 'folder' || category.type === 'subfolder';
      if (canExpand && expandedIds.has(category.id)) {
        const children = getChildren(category.id);
        children.forEach(child => addWithChildren(child, depth + 1));
      }
    };

    rootCategories.forEach(cat => addWithChildren(cat));
    return flattened;
  }, [categories, expandedIds, getChildren]);

  const renderCategory = useCallback(({ item }) => {
    const category = item;
    const depth = item.depth;
    const children = getChildren(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const canExpand = category.type === 'folder' || category.type === 'subfolder';
    const indentWidth = depth * 20;

    return (
      <TouchableOpacity
        style={[styles.categoryRow, { borderBottomColor: colors.border }]}
        onPress={() => {
          if (canExpand && hasChildren) {
            toggleExpanded(category.id);
          } else {
            handleEditCategory(category);
          }
        }}
        onLongPress={() => handleEditCategory(category)}
        accessibilityRole="button"
        accessibilityLabel={`${category.nameKey ? t(category.nameKey) : category.name} category, ${category.type}`}
        accessibilityHint={canExpand && hasChildren ? "Double tap to expand or collapse" : "Double tap to edit"}
      >
        <View style={[styles.categoryContent, { paddingLeft: 16 + indentWidth }]}>
          {/* Expand/Collapse Icon */}
          {canExpand && hasChildren ? (
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

          {/* Type Badge */}
          <View
            style={[styles.typeBadge, { backgroundColor: colors.secondary }]}
            accessibilityLabel={`Type: ${category.type}`}
          >
            <Text style={[styles.typeBadgeText, { color: colors.text }]}>
              {category.type === 'folder' ? 'F' : category.type === 'subfolder' ? 'S' : 'E'}
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
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
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
        maxToRenderPerBatch={15}
        initialNumToRender={15}
        removeClippedSubviews={true}
      />

      <View style={styles.addButtonWrapper}>
        <Button
          title={t('add_category')}
          onPress={handleAddCategory}
          color={colors.primary}
        />
      </View>

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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
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
    width: 24,
    marginRight: 8,
    alignItems: 'center',
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
    padding: 4,
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
  addButtonWrapper: {
    padding: 16,
    paddingBottom: 24,
  },
});

export default CategoriesScreen;
