import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, Dimensions, Platform } from 'react-native';
import { Text, FAB, ActivityIndicator, Card } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useCategories } from './CategoriesContext';
import CategoryModal from './CategoryModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 12;
const CARD_GAP = 8;
const NUM_COLUMNS = 4;
const CARD_WIDTH = (SCREEN_WIDTH - (CARD_PADDING * 2) - (CARD_GAP * (NUM_COLUMNS - 1))) / NUM_COLUMNS;

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

  // Organize categories into grid data structure with parent-child relationships
  // Income categories always start on a new row
  const gridData = useMemo(() => {
    const rootCategories = categories.filter(cat => !cat.parentId);
    const expenseCategories = [];
    const incomeCategories = [];

    // Separate categories by type and add with children
    const addCategoryWithChildren = (parent, targetArray) => {
      targetArray.push({
        ...parent,
        isParent: true,
        depth: 0,
      });

      if (expandedIds.has(parent.id)) {
        const children = getChildren(parent.id);
        children.forEach(child => {
          targetArray.push({
            ...child,
            isParent: false,
            parentCategory: parent,
            depth: 1,
          });
        });
      }
    };

    rootCategories.forEach(parent => {
      const categoryType = parent.category_type || parent.categoryType || 'expense';
      if (categoryType === 'expense') {
        addCategoryWithChildren(parent, expenseCategories);
      } else {
        addCategoryWithChildren(parent, incomeCategories);
      }
    });

    // Combine expense and income, padding to start income on new row
    const result = [...expenseCategories];

    // Add spacers to fill current row before income categories
    if (incomeCategories.length > 0 && result.length > 0) {
      const remainder = result.length % NUM_COLUMNS;
      if (remainder !== 0) {
        const spacersNeeded = NUM_COLUMNS - remainder;
        for (let i = 0; i < spacersNeeded; i++) {
          result.push({ isSpacer: true, id: `spacer-${i}` });
        }
      }
    }

    result.push(...incomeCategories);

    return result;
  }, [categories, expandedIds, getChildren]);

  const renderCategoryCard = useCallback(({ item, index }) => {
    // Return empty view for spacers
    if (item.isSpacer) {
      return <View style={{ width: CARD_WIDTH }} />;
    }

    const category = item;
    const children = getChildren(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const categoryType = category.category_type || category.categoryType || 'expense';
    const isParent = item.isParent;
    const isChild = item.depth > 0;

    // Bento UI color palette based on type - softer, less contrasted colors
    const typeColor = categoryType === 'expense'
      ? { bg: colors.expenseBackground || '#fef5f5', accent: '#fca5a5', text: colors.text }
      : { bg: colors.incomeBackground || '#f0fdf4', accent: '#86efac', text: colors.text };

    return (
      <Card
        style={[
          styles.bentoCard,
          {
            backgroundColor: typeColor.bg,
            width: isChild ? CARD_WIDTH - 20 : CARD_WIDTH,
            marginLeft: isChild ? 20 : 0,
            borderLeftWidth: isChild ? 4 : 0,
            borderLeftColor: typeColor.accent,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
              },
              android: {
                elevation: 4,
              },
              web: {
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              },
            }),
          }
        ]}
        elevation={2}
      >
        <TouchableOpacity
          onPress={() => {
            if (hasChildren) {
              toggleExpanded(category.id);
            } else {
              handleEditCategory(category);
            }
          }}
          onLongPress={() => handleEditCategory(category)}
          style={styles.cardTouchable}
          accessibilityRole="button"
          accessibilityLabel={`${category.nameKey ? t(category.nameKey) : category.name} category, ${categoryType}`}
          accessibilityHint={hasChildren ? "Double tap to expand or collapse" : "Double tap to edit"}
        >
          <View style={styles.cardContent}>
            {/* Header Row: Icon, Name, Expand */}
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: typeColor.accent }]}>
                <Icon name={category.icon} size={22} color="#000" accessible={false} />
              </View>

              <View style={styles.cardTitleContainer}>
                <Text
                  style={[styles.cardTitle, { color: typeColor.text }]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {category.nameKey ? t(category.nameKey) : category.name}
                </Text>
              </View>

              {hasChildren && (
                <TouchableOpacity
                  onPress={() => toggleExpanded(category.id)}
                  style={styles.expandIconContainer}
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
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={typeColor.accent}
                    accessible={false}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Child count indicator for parents */}
            {hasChildren && (
              <View style={[styles.childCountBadge, { backgroundColor: typeColor.accent }]}>
                <Text style={styles.childCountText}>{children.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Card>
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
        data={gridData}
        renderItem={renderCategoryCard}
        keyExtractor={item => item.id}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="folder-outline" size={64} color={colors.mutedText} />
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {t('no_categories') || 'No categories yet'}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.mutedText }]}>
              Tap the + button to create your first category
            </Text>
          </View>
        }
        contentContainerStyle={[
          styles.gridContainer,
          gridData.length === 0 && styles.emptyList
        ]}
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
  gridContainer: {
    padding: CARD_PADDING,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  bentoCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: CARD_GAP,
  },
  cardTouchable: {
    width: '100%',
  },
  cardContent: {
    padding: 10,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cardTitleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  expandIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  childCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  childCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
