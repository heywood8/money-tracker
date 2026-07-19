import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Text, TouchableRipple, TextInput as PaperTextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, SPACING, BORDER_RADIUS } from '../styles/designTokens';
import AddFAB from '../components/AddFAB';
import EmptyState from '../components/EmptyState';
import LoadingView from '../components/LoadingView';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import IconPicker from '../components/IconPicker';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';

const DEFAULT_FORM_VALUES = {
  name: '',
  type: 'folder',
  parentId: null,
  icon: 'folder',
  category_type: 'expense',
};

const CategoriesScreen = ({ onBackStateChange }) => {
  const { colors } = useThemeColors();
  const insets = useSafeAreaInsets();
  const { paperInputTheme } = makeModalStyles(colors);
  const themed = useMemo(() => ({
    pickerItemText: { color: colors.text, fontSize: 18 },
    parentText: { color: colors.text, fontSize: 18, marginLeft: 12 },
    saveButtonText: { color: '#fff' },
    cancelButtonText: { color: colors.text },
  }), [colors]);
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { categories, loading, getChildren, addCategory, updateCategory, deleteCategory, validateCategory } = useCategories();

  // Grid navigation state
  const [gridParentId, setGridParentId] = useState(null);

  // Form panel state
  const [activePanel, setActivePanel] = useState(null); // null | 'form'
  const [formValues, setFormValues] = useState(DEFAULT_FORM_VALUES);
  const [formErrors, setFormErrors] = useState({});
  const [formIsNew, setFormIsNew] = useState(true);
  const [formEditingCategory, setFormEditingCategory] = useState(null);
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [activePicker, setActivePicker] = useState(null); // null | 'type' | 'categoryType' | 'parent'

  // Animation refs
  const listAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const pickerSlideAnim = useRef(new Animated.Value(Dimensions.get('window').width)).current;

  // Interpolations for list layer
  const listTranslateX = listAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const listOpacity = listAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  // Interpolations for form panel
  const formTranslateX = formAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const formOpacity = formAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const openForm = useCallback((category) => {
    if (category) {
      setFormValues({
        ...category,
        category_type: category.category_type || category.categoryType || 'expense',
      });
      setFormIsNew(false);
      setFormEditingCategory(category);
    } else {
      // Creating a new category while browsing inside a folder: default the
      // parent to the open folder instead of the root, and inherit its
      // category_type so the parent picker (filtered by category_type) stays
      // consistent with the pre-filled parent.
      const parentFolder = gridParentId
        ? categories.find(c => c.id === gridParentId)
        : null;
      setFormValues({
        ...DEFAULT_FORM_VALUES,
        parentId: gridParentId,
        category_type: parentFolder
          ? (parentFolder.category_type || parentFolder.categoryType || DEFAULT_FORM_VALUES.category_type)
          : DEFAULT_FORM_VALUES.category_type,
      });
      setFormIsNew(true);
      setFormEditingCategory(null);
    }
    setFormErrors({});
    setActivePanel('form');
    Animated.parallel([
      Animated.timing(listAnim, { toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(formAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [listAnim, formAnim, gridParentId, categories]);

  const closeForm = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(formAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(listAnim, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setActivePanel(null);
      setFormErrors({});
      setActivePicker(null);
    });
  }, [listAnim, formAnim]);

  const handleSave = useCallback(() => {
    const error = validateCategory(formValues, t);
    if (error) {
      setFormErrors({ general: error });
      return;
    }

    if (formIsNew) {
      addCategory(formValues);
    } else {
      updateCategory(formEditingCategory.id, formValues);
    }

    closeForm();
  }, [validateCategory, formValues, formIsNew, addCategory, updateCategory, formEditingCategory, closeForm, t]);

  const handleDelete = useCallback(() => {
    showDialog(
      t('delete_category'),
      t('delete_category_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteCategory(formEditingCategory.id);
            closeForm();
          },
        },
      ],
    );
  }, [formEditingCategory, deleteCategory, closeForm, t, showDialog]);

  const handleOpenPicker = useCallback((pickerKey) => {
    pickerSlideAnim.setValue(Dimensions.get('window').width);
    setActivePicker(pickerKey);
    Animated.timing(pickerSlideAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pickerSlideAnim]);

  const handleClosePicker = useCallback(() => {
    Animated.timing(pickerSlideAnim, {
      toValue: Dimensions.get('window').width,
      duration: 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setActivePicker(null));
  }, [pickerSlideAnim]);

  const potentialParents = useMemo(() => {
    // Exclude the edited category AND all of its descendants — picking a
    // descendant as parent creates a cycle, which detaches the subtree from the
    // root grid and hangs every descendant walk (getAllDescendants, category paths).
    const excludedIds = new Set();
    if (formEditingCategory?.id) {
      excludedIds.add(formEditingCategory.id);
      const queue = [formEditingCategory.id];
      while (queue.length > 0) {
        const parentId = queue.shift();
        categories.forEach(c => {
          if (c.parentId === parentId && !excludedIds.has(c.id)) {
            excludedIds.add(c.id);
            queue.push(c.id);
          }
        });
      }
    }
    return categories.filter(c => {
      const catType = c.category_type || c.categoryType;
      return catType === formValues.category_type && !excludedIds.has(c.id) && !c.isShadow;
    });
  }, [categories, formValues.category_type, formEditingCategory]);

  const getParentName = useCallback((parentId) => {
    if (!parentId) return t('none');
    const parent = categories.find(c => c.id === parentId);
    return parent ? (parent.nameKey ? t(parent.nameKey) : parent.name) : t('none');
  }, [categories, t]);

  const hasChildren = useMemo(() => {
    if (!formEditingCategory?.id) return false;
    return categories.some(cat => cat.parentId === formEditingCategory.id);
  }, [formEditingCategory, categories]);

  const CATEGORY_TYPES = useMemo(() => [
    { key: 'expense', label: t('expense') },
    { key: 'income', label: t('income') },
  ], [t]);

  const TYPE_OPTIONS = useMemo(() => [
    { key: 'folder', label: t('folder') },
    { key: 'entry', label: t('entry') },
  ], [t]);

  const pickerTitle = activePicker === 'type'
    ? t('select_type')
    : activePicker === 'categoryType'
      ? t('category_type')
      : t('parent_category');

  const gridCategories = useMemo(() => {
    const visible = categories.filter(c => !c.isShadow);
    return visible.filter(c => (gridParentId === null ? !c.parentId : c.parentId === gridParentId));
  }, [categories, gridParentId]);

  const gridParentCategory = useMemo(() => {
    if (gridParentId === null) return null;
    return categories.find(c => c.id === gridParentId) || null;
  }, [categories, gridParentId]);

  const handleEditCategory = useCallback((category) => {
    openForm(category);
  }, [openForm]);

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

  const handleGridCellPress = useCallback((category) => {
    const hasChildItems = getChildren(category.id).filter(c => !c.isShadow).length > 0;
    if (hasChildItems) {
      setGridParentId(category.id);
    } else {
      handleEditCategory(category);
    }
  }, [getChildren, handleEditCategory]);

  const renderGridCell = useCallback(({ item: category }) => {
    const categoryType = category.category_type || category.categoryType || 'expense';
    const iconColor = categoryType === 'income' ? colors.income : colors.expense;
    const name = category.nameKey ? t(category.nameKey) : category.name;
    const hasChildItems = getChildren(category.id).filter(c => !c.isShadow).length > 0;

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
        {hasChildItems && (
          <View style={styles.folderBadge}>
            <Icon name="folder-outline" size={12} color={colors.mutedText} accessible={false} />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [colors, t, getChildren, handleGridCellPress, handleCategoryLongPress]);

  // Report internal back capability to an embedding parent (the Settings subpanel)
  // so a swipe / hardware-back pops one level here (picker → form → subcategory
  // grid) before the parent closes the whole panel.
  const internalCanGoBack =
    iconPickerVisible || activePicker !== null || activePanel === 'form' || gridParentId !== null;

  const internalGoBack = useCallback(() => {
    if (iconPickerVisible) { setIconPickerVisible(false); return; }
    if (activePicker !== null) { handleClosePicker(); return; }
    if (activePanel === 'form') { closeForm(); return; }
    if (gridParentId !== null) { setGridParentId(null); return; }
  }, [iconPickerVisible, activePicker, activePanel, gridParentId, handleClosePicker, closeForm]);

  useEffect(() => {
    onBackStateChange?.(internalCanGoBack ? internalGoBack : null);
  }, [internalCanGoBack, internalGoBack, onBackStateChange]);

  useEffect(() => () => onBackStateChange?.(null), [onBackStateChange]);

  if (loading) {
    return <LoadingView message={t('loading_categories') || 'Loading categories...'} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Layer 1: Category list (fades/shifts left when form opens) */}
      <Animated.View style={[styles.listLayer, { transform: [{ translateX: listTranslateX }], opacity: listOpacity }]}>
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
          onPress={() => openForm(null)}
          accessibilityLabel={t('add_category')}
          accessibilityHint={t('add_category_hint') || 'Opens form to create a new category'}
        />
      </Animated.View>

      {/* Layer 2: Form panel (slides in from right) */}
      {activePanel === 'form' && (
        <Animated.View
          style={[
            styles.formPanel,
            { backgroundColor: colors.background, transform: [{ translateX: formTranslateX }], opacity: formOpacity },
          ]}
        >
          {/* Form header */}
          <View style={[styles.formPanelHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={closeForm} style={styles.formPanelBack} accessibilityRole="button" accessibilityLabel="Back">
              <Icon name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.formPanelTitle, { color: colors.text }]}>
              {formIsNew ? (t('add_category') || 'New Category') : (t('edit_category') || 'Edit Category')}
            </Text>
            {!formIsNew ? (
              <TouchableOpacity onPress={handleDelete} style={styles.formPanelBack} accessibilityRole="button" accessibilityLabel={t('delete_category')}>
                <Icon name="trash-can-outline" size={22} color={colors.delete || '#ef4444'} />
              </TouchableOpacity>
            ) : (
              <View style={styles.formPanelBack} />
            )}
          </View>

          {/* Form body */}
          <ScrollView style={styles.formPanelScroll} contentContainerStyle={styles.formPanelScrollContent} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('category_name') || 'Name').toUpperCase()}
            </Text>
            <PaperTextInput
              mode="outlined"
              value={formValues.name}
              onChangeText={text => setFormValues(v => ({ ...v, name: text }))}
              placeholder={t('category_name')}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              theme={paperInputTheme}
              style={modalSharedStyles.textInput}
            />

            {/* Type (Folder / Entry) */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('select_type') || 'Type').toUpperCase()}
            </Text>
            <TouchableRipple
              style={[modalSharedStyles.pickerRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => handleOpenPicker('type')}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: colors.text }]}>
                  {TYPE_OPTIONS.find(to => to.key === formValues.type)?.label}
                </Text>
                <Icon name="chevron-right" size={22} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            {/* Category Type (Income / Expense) */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('category_type') || 'Category Type').toUpperCase()}
            </Text>
            <TouchableRipple
              style={[modalSharedStyles.pickerRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => handleOpenPicker('categoryType')}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: colors.text }]}>
                  {CATEGORY_TYPES.find(ct => ct.key === formValues.category_type)?.label}
                </Text>
                <Icon name="chevron-right" size={22} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            {/* Parent Category */}
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('parent_category') || 'Parent').toUpperCase()}
            </Text>
            <TouchableRipple
              style={[modalSharedStyles.pickerRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => handleOpenPicker('parent')}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: colors.text }]}>
                  {getParentName(formValues.parentId)}
                </Text>
                <Icon name="chevron-right" size={22} color={colors.mutedText} />
              </View>
            </TouchableRipple>

            {/* Icon picker button */}
            <Pressable
              testID="category-icon-picker"
              style={[styles.iconPickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder || colors.border }]}
              onPress={() => setIconPickerVisible(true)}
            >
              <Icon name={formValues.icon || 'folder'} size={32} color={colors.text} />
              <Text style={[styles.iconPickerText, { color: colors.mutedText }]}>
                {t('select_icon')}
              </Text>
            </Pressable>

            {formErrors.general && (
              <Text style={styles.errorText}>{formErrors.general}</Text>
            )}
          </ScrollView>

          {/* Form footer */}
          <View style={[styles.formPanelFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + 80 }]}>
            <TouchableRipple
              onPress={closeForm}
              style={[styles.formFooterBtn, { borderColor: colors.border }]}
              borderless={false}
            >
              <Text style={themed.cancelButtonText}>{t('cancel') || 'Cancel'}</Text>
            </TouchableRipple>
            <TouchableRipple
              onPress={handleSave}
              style={[styles.formFooterBtn, styles.formFooterBtnPrimary, { backgroundColor: colors.primary }]}
              borderless={false}
            >
              <Text style={themed.saveButtonText}>{t('save') || 'Save'}</Text>
            </TouchableRipple>
          </View>

          {/* Inline picker panel — slides in from right within the form */}
          {activePicker && (
            <Animated.View
              style={[
                styles.pickerPanel,
                { backgroundColor: colors.card, transform: [{ translateX: pickerSlideAnim }] },
              ]}
            >
              <View style={[styles.pickerPanelHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  testID="picker-back-button"
                  onPress={handleClosePicker}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.pickerPanelTitle, { color: colors.text }]}>
                  {pickerTitle}
                </Text>
              </View>

              {activePicker === 'type' && (
                <FlatList
                  data={TYPE_OPTIONS}
                  keyExtractor={item => item.key}
                  renderItem={({ item }) => {
                    const isDisabled = !formIsNew && hasChildren && item.key === 'entry';
                    return (
                      <Pressable
                        onPress={() => {
                          if (isDisabled) {
                            showDialog(
                              t('error'),
                              t('cannot_change_to_entry_with_children') || 'Cannot change to entry type while category has subcategories',
                              [{ text: t('ok') }],
                            );
                            return;
                          }
                          setFormValues(v => ({ ...v, type: item.key }));
                          handleClosePicker();
                        }}
                        style={({ pressed }) => [
                          styles.pickerOption,
                          { borderColor: colors.border },
                          pressed && !isDisabled && { backgroundColor: colors.selected },
                          isDisabled && styles.disabledOption,
                        ]}
                      >
                        <Text style={[themed.pickerItemText, isDisabled && { color: colors.mutedText }]}>
                          {item.label}{isDisabled && ' ⚠️'}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              )}

              {activePicker === 'categoryType' && (
                <FlatList
                  data={CATEGORY_TYPES}
                  keyExtractor={item => item.key}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setFormValues(v => ({ ...v, category_type: item.key, parentId: null }));
                        handleClosePicker();
                      }}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                      ]}
                    >
                      <Text style={themed.pickerItemText}>{item.label}</Text>
                    </Pressable>
                  )}
                />
              )}

              {activePicker === 'parent' && (
                <FlatList
                  data={[{ id: null, name: t('none'), icon: 'folder-outline' }, ...potentialParents]}
                  keyExtractor={item => item.id || 'none'}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setFormValues(v => ({ ...v, parentId: item.id }));
                        handleClosePicker();
                      }}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                      ]}
                    >
                      <View style={styles.parentOption}>
                        <Icon name={item.icon || 'folder'} size={24} color={colors.text} />
                        <Text style={themed.parentText}>
                          {item.nameKey ? t(item.nameKey) : item.name}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />
              )}
            </Animated.View>
          )}
        </Animated.View>
      )}

      {/* Icon Picker — rendered outside the form panel so it can cover everything */}
      <IconPicker
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={(icon) => setFormValues(v => ({ ...v, icon }))}
        selectedIcon={formValues.icon}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // Grid / list layer
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
  disabledOption: {
    opacity: 0.5,
  },
  emptyList: {
    flex: 1,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  folderBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
  },
  // Form footer buttons
  formFooterBtn: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  formFooterBtnPrimary: {
    borderWidth: 0,
  },
  // Form panel
  formPanel: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  formPanelBack: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  formPanelFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  formPanelHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 8,
  },
  formPanelScroll: {
    flex: 1,
  },
  formPanelScrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  formPanelTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  gridCell: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    gap: SPACING.sm,
    margin: SPACING.xs,
    padding: SPACING.md,
    position: 'relative',
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
  iconPickerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
    padding: SPACING.md,
  },
  iconPickerText: {
    marginLeft: SPACING.md,
  },
  listLayer: {
    flex: 1,
  },
  parentOption: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pickerOption: {
    borderBottomWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  pickerPanel: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pickerPanelHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  pickerPanelTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  toggleBar: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
});

CategoriesScreen.propTypes = {
  onBackStateChange: PropTypes.func,
};

export default CategoriesScreen;
