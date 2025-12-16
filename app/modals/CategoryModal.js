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

export default function CategoryModal({ visible, onClose, category, isNew }) {
  const { colors } = useTheme();
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior="height"
        style={{ flex: 1 }}
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

              {/* Category Type Picker (Income/Expense) */}
              <Pressable
                style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setCategoryTypePickerVisible(true)}
              >
                <Text style={{ color: colors.mutedText, fontSize: 12, marginBottom: 4 }}>
                  {t('category_type')}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Text style={{ color: colors.text, fontSize: 16 }}>
                    {CATEGORY_TYPES.find(ct => ct.key === values.category_type)?.label}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.text} />
                </View>
              </Pressable>

              {/* Parent Picker */}
              <Pressable
                style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setParentPickerVisible(true)}
              >
                <Text style={{ color: colors.mutedText, fontSize: 12, marginBottom: 4 }}>
                  {t('parent_category')}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Text style={{ color: colors.text, fontSize: 16 }}>
                    {getParentName(values.parentId)}
                  </Text>
                  <Icon name="chevron-down" size={20} color={colors.text} />
                </View>
              </Pressable>

              {/* Icon Picker */}
              <Pressable
                style={[styles.iconPickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setIconPickerVisible(true)}
              >
                <Icon name={values.icon || 'folder'} size={32} color={colors.text} />
                <Text style={{ color: colors.mutedText, marginLeft: 12 }}>
                  {t('select_icon')}
                </Text>
              </Pressable>

              {/* Exclude from Forecast Toggle */}
              <View style={[styles.toggleRow, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
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
                  <Text style={{ color: colors.text, fontSize: 18 }}>{item.label}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.closeButton} onPress={() => setCategoryTypePickerVisible(false)}>
              <Text style={{ color: colors.primary }}>{t('close')}</Text>
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
                    <Text style={{ color: colors.text, fontSize: 18, marginLeft: 12 }}>
                      {item.nameKey ? t(item.nameKey) : item.name}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
            <Pressable style={styles.closeButton} onPress={() => setParentPickerVisible(false)}>
              <Text style={{ color: colors.primary }}>{t('close')}</Text>
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
  input: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    padding: 12,
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
});
