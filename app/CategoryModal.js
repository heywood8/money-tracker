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
  Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useCategories } from './CategoriesContext';
import IconPicker from './IconPicker';

export default function CategoryModal({ visible, onClose, category, isNew }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
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
  const [parentPickerVisible, setParentPickerVisible] = useState(false);
  const [categoryTypePickerVisible, setCategoryTypePickerVisible] = useState(false);

  useEffect(() => {
    if (category && !isNew) {
      setValues({
        ...category,
        category_type: category.category_type || category.categoryType || 'expense'
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
    const error = validateCategory(values);
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
  }, [validateCategory, values, isNew, addCategory, updateCategory, category, onClose]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setErrors({});
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    Alert.alert(
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
      ]
    );
  }, [category, deleteCategory, onClose, t]);

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    minHeight: '60%',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'column',
  },
  scrollView: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  pickerButton: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  iconPickerButton: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: 8,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerModalContent: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 12,
    padding: 12,
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  parentOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    marginTop: 8,
    alignSelf: 'center',
    padding: 10,
  },
  deleteButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 20,
    borderTopWidth: 1,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});
