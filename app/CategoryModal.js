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
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useCategories } from './CategoriesContext';
import IconPicker from './IconPicker';

export default function CategoryModal({ visible, onClose, category, isNew }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { categories, addCategory, updateCategory, validateCategory } = useCategories();

  const [values, setValues] = useState({
    name: '',
    type: 'folder',
    parentId: null,
    icon: 'folder',
    categoryType: 'expense',
  });
  const [errors, setErrors] = useState({});
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [parentPickerVisible, setParentPickerVisible] = useState(false);
  const [categoryTypePickerVisible, setCategoryTypePickerVisible] = useState(false);

  useEffect(() => {
    if (category && !isNew) {
      setValues({ ...category });
    } else if (isNew) {
      setValues({
        name: '',
        type: 'folder',
        parentId: null,
        icon: 'folder',
        categoryType: 'expense',
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

  // Get potential parents based on selected type
  const potentialParents = useMemo(() => {
    if (values.type === 'folder') {
      return [];
    }
    if (values.type === 'subfolder') {
      return categories.filter(c => c.type === 'folder');
    }
    if (values.type === 'entry') {
      return categories.filter(c => c.type === 'folder' || c.type === 'subfolder');
    }
    return [];
  }, [categories, values.type]);

  const getParentName = useCallback((parentId) => {
    if (!parentId) return t('select_parent');
    const parent = categories.find(c => c.id === parentId);
    return parent ? (parent.nameKey ? t(parent.nameKey) : parent.name) : t('select_parent');
  }, [categories, t]);

  const TYPES = [
    { key: 'folder', label: t('folder') },
    { key: 'subfolder', label: t('subfolder') },
    { key: 'entry', label: t('entry') },
  ];

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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

            {/* Type Picker */}
            <Pressable
              style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
              onPress={() => setTypePickerVisible(true)}
            >
              <Text style={{ color: colors.text }}>
                {t('select_type')}: {TYPES.find(tp => tp.key === values.type)?.label}
              </Text>
              <Icon name="chevron-down" size={20} color={colors.text} />
            </Pressable>

            {/* Category Type Picker (Income/Expense) */}
            <Pressable
              style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
              onPress={() => setCategoryTypePickerVisible(true)}
            >
              <Text style={{ color: colors.text }}>
                {CATEGORY_TYPES.find(ct => ct.key === values.categoryType)?.label}
              </Text>
              <Icon name="chevron-down" size={20} color={colors.text} />
            </Pressable>

            {/* Parent Picker (only if not folder) */}
            {values.type !== 'folder' && (
              <Pressable
                style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                onPress={() => setParentPickerVisible(true)}
              >
                <Text style={{ color: colors.text }}>
                  {getParentName(values.parentId)}
                </Text>
                <Icon name="chevron-down" size={20} color={colors.text} />
              </Pressable>
            )}

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

      {/* Type Picker Modal */}
      <Modal
        visible={typePickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setTypePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTypePickerVisible(false)}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <FlatList
              data={TYPES}
              keyExtractor={item => item.key}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setValues(v => ({ ...v, type: item.key, parentId: item.key === 'folder' ? null : v.parentId }));
                    setTypePickerVisible(false);
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
            <Pressable style={styles.closeButton} onPress={() => setTypePickerVisible(false)}>
              <Text style={{ color: colors.primary }}>{t('close')}</Text>
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
                    setValues(v => ({ ...v, categoryType: item.key }));
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
              data={potentialParents}
              keyExtractor={item => item.id}
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
              ListEmptyComponent={
                <Text style={{ color: colors.mutedText, textAlign: 'center', padding: 20 }}>
                  {t('no_categories')}
                </Text>
              }
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
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  scrollView: {
    flex: 1,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
