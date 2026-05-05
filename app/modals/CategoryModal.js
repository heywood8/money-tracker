import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import IconPicker from '../components/IconPicker';
import ModalBlurOverlay from '../components/ModalBlurOverlay';
import PropTypes from 'prop-types';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';

export default function CategoryModal({ visible, onClose, category, isNew }) {
  const { colors } = useThemeColors();
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
      {visible && <ModalBlurOverlay />}
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoid}>
          <Pressable style={styles.modalOverlay} onPress={handleClose}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>

              {/* Drag handle */}
              <View style={[styles.sheetDragHandle, { backgroundColor: colors.border }]} />

              {/* Sheet header */}
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  {isNew ? t('add_category') : t('edit_category')}
                </Text>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                style={styles.sheetScroll}
              >
                {/* Name Input */}
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  ]}
                  value={values.name}
                  onChangeText={text => setValues(v => ({ ...v, name: text }))}
                  placeholder={t('category_name')}
                  placeholderTextColor={colors.mutedText}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {/* Type Picker (Folder/Entry) */}
                <Pressable
                  style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  onPress={() => handleOpenPicker('type')}
                >
                  <Text style={[styles.pickerLabel, { color: colors.mutedText }]}>
                    {t('select_type')}
                  </Text>
                  <Text style={[styles.pickerValue, { color: colors.text }]}>
                    {TYPE_OPTIONS.find(to => to.key === values.type)?.label}
                  </Text>
                </Pressable>

                {/* Category Type Picker (Income/Expense) */}
                <Pressable
                  style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  onPress={() => handleOpenPicker('categoryType')}
                >
                  <Text style={[styles.pickerLabel, { color: colors.mutedText }]}>
                    {t('category_type')}
                  </Text>
                  <Text style={[styles.pickerValue, { color: colors.text }]}>
                    {CATEGORY_TYPES.find(ct => ct.key === values.category_type)?.label}
                  </Text>
                </Pressable>

                {/* Parent Picker */}
                <Pressable
                  style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  onPress={() => handleOpenPicker('parent')}
                >
                  <Text style={[styles.pickerLabel, { color: colors.mutedText }]}>
                    {t('parent_category')}
                  </Text>
                  <Text style={[styles.pickerValue, { color: colors.text }]}>
                    {getParentName(values.parentId)}
                  </Text>
                </Pressable>

                {/* Icon Picker */}
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
              </ScrollView>

              {/* Delete zone (existing categories only) — outside ScrollView */}
              {!isNew && (
                <View style={styles.deleteWrapper}>
                  <Pressable
                    style={[styles.deleteRow, { borderColor: colors.delete + '40' }]}
                    onPress={handleDelete}
                  >
                    <Icon name="delete-outline" size={18} color={colors.delete} />
                    <Text style={[styles.deleteRowText, { color: colors.delete }]}>
                      {t('delete_category')}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Action buttons */}
              <View style={[styles.sheetActions, { borderTopColor: colors.border }]}>
                <Pressable
                  style={[styles.sheetBtn, styles.sheetBtnCancel, { borderColor: colors.border }]}
                  onPress={handleClose}
                >
                  <Text style={[styles.sheetBtnText, { color: colors.text }]}>{t('cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.sheetBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSave}
                >
                  <Text style={[styles.sheetBtnText, styles.sheetBtnSaveText]}>{t('save')}</Text>
                </Pressable>
              </View>

              {/* In-sheet picker panel — slides in from the right */}
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
                              isDisabled && { opacity: 0.5 },
                            ]}
                          >
                            <Text style={[themed.pickerItemText, isDisabled && { color: colors.mutedText }]}>
                              {item.label}
                              {isDisabled && ' ⚠️'}
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

            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>

        {/* Icon Picker Modal */}
        <IconPicker
          visible={iconPickerVisible}
          onClose={() => setIconPickerVisible(false)}
          onSelect={(icon) => setValues(v => ({ ...v, icon }))}
          selectedIcon={values.icon}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  deleteRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  deleteRowText: {
    fontSize: 15,
    fontWeight: '500',
  },
  deleteWrapper: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
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
    padding: SPACING.md,
  },
  iconPickerText: {
    marginLeft: SPACING.md,
  },
  input: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  keyboardAvoid: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    overflow: 'hidden',
    paddingBottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  parentOption: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pickerButton: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  pickerLabel: {
    fontSize: 12,
    marginBottom: 4,
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
  pickerValue: {
    fontSize: 16,
  },
  scrollContent: {
    paddingBottom: SPACING.sm,
  },
  sheetActions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  sheetBtn: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    overflow: 'hidden',
    paddingVertical: SPACING.sm,
  },
  sheetBtnCancel: {
    borderWidth: 1,
  },
  sheetBtnSaveText: {
    color: '#fff',
  },
  sheetBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sheetDragHandle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 4,
    marginBottom: SPACING.md,
    width: 44,
  },
  sheetHeader: {
    marginBottom: SPACING.sm,
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
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
