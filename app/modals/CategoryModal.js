import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Keyboard,
  Animated,
  Dimensions,
} from 'react-native';
import { TextInput as PaperTextInput, TouchableRipple } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import IconPicker from '../components/IconPicker';
import ModalShell from '../components/ModalShell';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
import PropTypes from 'prop-types';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';

export default function CategoryModal({ visible, onClose, category, isNew }) {
  const { colors } = useThemeColors();
  const { paperInputTheme } = makeModalStyles(colors);
  const themed = useMemo(() => ({
    pickerItemText: { color: colors.text, fontSize: 18 },
    parentText: { color: colors.text, fontSize: 18, marginLeft: 12 },
  }), [colors]);
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { categories, addCategory, updateCategory, deleteCategory, validateCategory } = useCategories();

  const [values, setValues] = useState({
    name: '',
    type: 'folder',
    parentId: null,
    icon: 'folder',
    category_type: 'expense',
  });
  const [errors, setErrors] = useState({});
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  // Single animated panel for all pickers — only one open at a time
  const [activePicker, setActivePicker] = useState(null); // null | 'type' | 'categoryType' | 'parent'
  const pickerSlideAnim = useRef(new Animated.Value(Dimensions.get('window').width)).current;

  useEffect(() => {
    if (category && !isNew) {
      setValues({
        ...category,
        category_type: category.category_type || category.categoryType || 'expense',
      });
    } else if (isNew) {
      setValues({
        name: '',
        type: 'folder',
        parentId: null,
        icon: 'folder',
        category_type: 'expense',
      });
    }
    setErrors({});
  }, [category, isNew, visible]);

  const handleSave = useCallback(() => {
    const error = validateCategory(values, t);
    if (error) {
      setErrors({ general: error });
      return;
    }

    if (isNew) {
      addCategory(values);
    } else {
      updateCategory(category.id, values);
    }

    onClose();
  }, [validateCategory, values, isNew, addCategory, updateCategory, category, onClose, t]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

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
            deleteCategory(category.id);
            onClose();
          },
        },
      ],
    );
  }, [category, deleteCategory, onClose, t, showDialog]);

  const handleOpenPicker = useCallback((pickerKey) => {
    pickerSlideAnim.setValue(Dimensions.get('window').width);
    setActivePicker(pickerKey);
    Animated.timing(pickerSlideAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  }, [pickerSlideAnim]);

  const handleClosePicker = useCallback(() => {
    Animated.timing(pickerSlideAnim, { toValue: Dimensions.get('window').width, duration: 260, useNativeDriver: true })
      .start(() => setActivePicker(null));
  }, [pickerSlideAnim]);

  const potentialParents = useMemo(() => {
    return categories.filter(c => {
      const catType = c.category_type || c.categoryType;
      return catType === values.category_type && c.id !== category?.id;
    });
  }, [categories, values.category_type, category]);

  const getParentName = useCallback((parentId) => {
    if (!parentId) return t('none');
    const parent = categories.find(c => c.id === parentId);
    return parent ? (parent.nameKey ? t(parent.nameKey) : parent.name) : t('none');
  }, [categories, t]);

  const CATEGORY_TYPES = [
    { key: 'expense', label: t('expense') },
    { key: 'income', label: t('income') },
  ];

  const TYPE_OPTIONS = [
    { key: 'folder', label: t('folder') },
    { key: 'entry', label: t('entry') },
  ];

  const hasChildren = useMemo(() => {
    if (!category?.id) return false;
    return categories.some(cat => cat.parentId === category.id);
  }, [category, categories]);

  const pickerTitle = activePicker === 'type'
    ? t('select_type')
    : activePicker === 'categoryType'
      ? t('category_type')
      : t('parent_category');

  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_category') : t('edit_category')}
        onSave={handleSave}
        onCancel={handleClose}
        onDelete={isNew ? undefined : handleDelete}
        deleteLabel={t('delete_category')}
        showBlurOverlay
      >
        {/* Name */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('category_name') || 'Name').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          value={values.name}
          onChangeText={text => setValues(v => ({ ...v, name: text }))}
          placeholder={t('category_name')}
          autoFocus
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
              {TYPE_OPTIONS.find(to => to.key === values.type)?.label}
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
              {CATEGORY_TYPES.find(ct => ct.key === values.category_type)?.label}
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
              {getParentName(values.parentId)}
            </Text>
            <Icon name="chevron-right" size={22} color={colors.mutedText} />
          </View>
        </TouchableRipple>

        {/* Icon Picker (keeps its own style — icon preview) */}
        <Pressable
          testID="category-icon-picker"
          style={[styles.iconPickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          onPress={() => setIconPickerVisible(true)}
        >
          <Icon name={values.icon || 'folder'} size={32} color={colors.text} />
          <Text style={[styles.iconPickerText, { color: colors.mutedText }]}>
            {t('select_icon')}
          </Text>
        </Pressable>

        {errors.general && <Text style={styles.error}>{errors.general}</Text>}

        {/* In-sheet animated picker panel — slides in from the right */}
        {activePicker && (
          <Animated.View
            style={[styles.pickerPanel, { backgroundColor: colors.card, transform: [{ translateX: pickerSlideAnim }] }]}
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
                  const isDisabled = !isNew && hasChildren && item.key === 'entry';
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
                        setValues(v => ({ ...v, type: item.key }));
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
                      setValues(v => ({ ...v, category_type: item.key }));
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
                      setValues(v => ({ ...v, parentId: item.id }));
                      handleClosePicker();
                    }}
                    style={({ pressed }) => [
                      styles.pickerOption,
                      { borderColor: colors.border },
                      pressed && { backgroundColor: colors.selected },
                    ]}
                  >
                    <View style={styles.parentOption}>
                      <Icon name={item.icon} size={24} color={colors.text} />
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
      </ModalShell>

      {/* Icon Picker Modal — outside ModalShell */}
      <IconPicker
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={(icon) => setValues(v => ({ ...v, icon }))}
        selectedIcon={values.icon}
      />
    </>
  );
}

const styles = StyleSheet.create({
  disabledOption: {
    opacity: 0.5,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: SPACING.sm,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
});

CategoryModal.propTypes = {
  visible: PropTypes.bool,
  onClose: PropTypes.func,
  category: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    type: PropTypes.string,
    parentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    icon: PropTypes.string,
    category_type: PropTypes.string,
    categoryType: PropTypes.string,
  }),
  isNew: PropTypes.bool,
};
