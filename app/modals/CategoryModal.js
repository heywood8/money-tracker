import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Platform,
  Keyboard,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import IconPicker from '../components/IconPicker';
import PropTypes from 'prop-types';

export default function CategoryModal({ visible, onClose, category, isNew }) {
  const { colors } = useTheme();
  const themed = useMemo(() => ({
    closeText: { color: colors.primary },
    parentText: { color: colors.text, fontSize: 18, marginLeft: 12 },
    pickerItemText: { color: colors.text, fontSize: 18 },
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
    excludeFromForecast: false,
  });
  const [errors, setErrors] = useState({});
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [parentPickerVisible, setParentPickerVisible] = useState(false);
  const [categoryTypePickerVisible, setCategoryTypePickerVisible] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);

  useEffect(() => {
    if (category && !isNew) {
      setValues({
        ...category,
        category_type: category.category_type || category.categoryType || 'expense',
        excludeFromForecast: category.excludeFromForecast || false,
      });
    } else if (isNew) {
      setValues({
        name: '',
        type: 'folder',
        parentId: null,
        icon: 'folder',
        category_type: 'expense',
        excludeFromForecast: false,
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

  // Get potential parents - all folders of the same category_type
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

  // Check if category has children
  const hasChildren = useMemo(() => {
    if (!category?.id) return false;
    return categories.some(cat => cat.parentId === category.id);
  }, [category, categories]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior="height"
        style={styles.keyboardAvoid}
      >
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isNew ? t('add_category') : t('edit_category')}
              </Text>

              {/* Name Input */}
              <TextInput
                style={[
                  styles.input,
                  styles.inputThemed,
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
                style={[styles.pickerButton, styles.pickerButtonThemed, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setTypePickerVisible(true)}
              >
                <Text style={[styles.pickerLabel, { color: colors.mutedText }]}>
                  {t('select_type')}
                </Text>
                <View style={styles.pickerRow}>
                  <Text style={[styles.pickerValue, { color: colors.text }]}>
                    {TYPE_OPTIONS.find(to => to.key === values.type)?.label}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.text} />
                </View>
              </Pressable>

              {/* Category Type Picker (Income/Expense) */}
              <Pressable
                style={[styles.pickerButton, styles.pickerButtonThemed, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setCategoryTypePickerVisible(true)}
              >
                <Text style={[styles.pickerLabel, { color: colors.mutedText }]}>
                  {t('category_type')}
                </Text>
                <View style={styles.pickerRow}>
                  <Text style={[styles.pickerValue, { color: colors.text }]}>
                    {CATEGORY_TYPES.find(ct => ct.key === values.category_type)?.label}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.text} />
                </View>
              </Pressable>

              {/* Parent Picker */}
              <Pressable
                style={[styles.pickerButton, styles.pickerButtonThemed, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setParentPickerVisible(true)}
              >
                <Text style={[styles.pickerLabel, { color: colors.mutedText }]}>
                  {t('parent_category')}
                </Text>
                <View style={styles.pickerRow}>
                  <Text style={[styles.pickerValue, { color: colors.text }]}>
                    {getParentName(values.parentId)}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.text} />
                </View>
              </Pressable>

              {/* Icon Picker */}
              <Pressable
                style={[styles.iconPickerButton, styles.iconPickerButtonThemed, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setIconPickerVisible(true)}
              >
                <Icon name={values.icon || 'folder'} size={32} color={colors.text} />
                <Text style={[styles.iconPickerText, { color: colors.mutedText }]}> 
                  {t('select_icon')}
                </Text>
              </Pressable>

              {/* Exclude from Forecast Toggle */}
              <View style={[styles.toggleRow, styles.toggleRowThemed, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>
                    {t('exclude_from_forecast')}
                  </Text>
                  <Text style={[styles.toggleHint, { color: colors.mutedText }]}>
                    {t('exclude_from_forecast_hint')}
                  </Text>
                </View>
                <Switch
                  value={values.excludeFromForecast || false}
                  onValueChange={(value) => setValues(v => ({ ...v, excludeFromForecast: value }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>

              {errors.general && <Text style={styles.error}>{errors.general}</Text>}

              {/* Delete Button (only for existing categories) */}
              {!isNew && (
                <Pressable
                  style={[styles.deleteButtonContainer, { borderTopColor: colors.border }]}
                  onPress={handleDelete}
                >
                  <Icon name="delete-outline" size={20} color={colors.delete} />
                  <Text style={[styles.deleteButtonText, { color: colors.delete }]}>
                    {t('delete_category')}
                  </Text>
                </Pressable>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={[styles.modalButtonRow, { backgroundColor: colors.card }]}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.secondary }]}
                onPress={handleClose}
              >
                <Text style={[styles.buttonText, { color: colors.text }]}>
                  {t('cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
              >
                <Text style={[styles.buttonText, { color: colors.text }]}>
                  {t('save')}
                </Text>
              </Pressable>
            </View>
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

      {/* Type Picker Modal (Folder/Entry) */}
      <Modal
        visible={typePickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setTypePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTypePickerVisible(false)}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <FlatList
              data={TYPE_OPTIONS}
              keyExtractor={item => item.key}
              renderItem={({ item }) => {
                // Disable changing to 'entry' if category has children
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
                      setTypePickerVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.pickerOption,
                      { borderColor: colors.border },
                      pressed && !isDisabled && { backgroundColor: colors.selected },
                      isDisabled && { opacity: 0.5 },
                    ]}
                    disabled={isDisabled}
                  >
                    <Text style={[themed.pickerItemText, isDisabled && { color: colors.mutedText }]}>
                      {item.label}
                      {isDisabled && ' ⚠️'}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.closeButton} onPress={() => setTypePickerVisible(false)}>
              <Text style={themed.closeText}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category Type Picker Modal */}
      <Modal
        visible={categoryTypePickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryTypePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryTypePickerVisible(false)}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <FlatList
              data={CATEGORY_TYPES}
              keyExtractor={item => item.key}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setValues(v => ({ ...v, category_type: item.key }));
                    setCategoryTypePickerVisible(false);
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
            <Pressable style={styles.closeButton} onPress={() => setCategoryTypePickerVisible(false)}>
              <Text style={themed.closeText}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Parent Picker Modal */}
      <Modal
        visible={parentPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setParentPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setParentPickerVisible(false)}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <FlatList
              data={[{ id: null, name: t('none'), icon: 'folder-outline' }, ...potentialParents]}
              keyExtractor={item => item.id || 'none'}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setValues(v => ({ ...v, parentId: item.id }));
                    setParentPickerVisible(false);
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
            <Pressable style={styles.closeButton} onPress={() => setParentPickerVisible(false)}>
              <Text style={themed.closeText}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 8,
    padding: 10,
  },
  deleteButtonContainer: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: 8,
  },
  iconPickerButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 12,
  },
  // Previously added themed/static helpers (placed near related styles)
  iconPickerButtonThemed: {
    padding: 12,
  },
  iconPickerText: {
    marginLeft: 12,
  },
  input: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    padding: 12,
  },
  inputThemed: {},
  keyboardAvoid: {
    flex: 1,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 12,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalContent: {
    borderRadius: 12,
    elevation: 5,
    flexDirection: 'column',
    maxHeight: '80%',
    minHeight: '60%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    width: '90%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  parentOption: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pickerButton: {
    alignItems: 'flex-start',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'column',
    marginBottom: 12,
    padding: 12,
  },
  pickerButtonThemed: {},
  pickerLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  pickerModalContent: {
    borderRadius: 12,
    maxHeight: '70%',
    padding: 12,
    width: '90%',
  },
  pickerOption: {
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  pickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  pickerValue: {
    fontSize: 16,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  toggleHint: {
    fontSize: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  toggleLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleRow: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 12,
  },
  toggleRowThemed: {},
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
    excludeFromForecast: PropTypes.bool,
  }),
  isNew: PropTypes.bool,
};
