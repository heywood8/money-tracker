# Modal Style Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all four bottom-sheet modals (Operation, Category, PlannedOperation, Account) to share a common shell component and input style matching AccountModal.

**Architecture:** A new `ModalShell` component handles the outer structure (drag handle, title, scroll area, delete row, cancel/save buttons). A new `modalStyles.js` exports a static `modalSharedStyles` StyleSheet and a `makeModalStyles(colors)` function returning the Paper theme object. Each modal is refactored to use these shared pieces.

**Tech Stack:** React Native, react-native-paper (`TextInput`, `TouchableRipple`), `@expo/vector-icons`

---

## File Map

| File | Action |
|------|--------|
| `app/styles/modalStyles.js` | Create |
| `app/components/ModalShell.js` | Create |
| `app/modals/CategoryModal.js` | Modify |
| `app/modals/PlannedOperationModal.js` | Modify |
| `app/modals/OperationModal.js` | Modify |
| `app/screens/AccountsScreen.js` | Modify (modal section only) |

---

## Task 1: Create `app/styles/modalStyles.js`

**Files:**
- Create: `app/styles/modalStyles.js`

- [ ] **Step 1: Create the file**

```javascript
// app/styles/modalStyles.js
import { StyleSheet } from 'react-native';
import { SPACING, BORDER_RADIUS } from './designTokens';

/**
 * Static styles shared across all modal form content.
 * Colors are applied inline since they depend on the active theme.
 */
export const modalSharedStyles = StyleSheet.create({
  // Small-caps label rendered above each input or picker row
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 2,
    marginTop: SPACING.sm,
  },
  // Spacing below PaperTextInput
  textInput: {
    marginBottom: SPACING.xs,
  },
  // TouchableRipple container for tappable picker rows
  pickerRow: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
  },
  // Inner row: value text + chevron
  pickerRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  // Selected value text inside a picker row
  pickerRowValue: {
    fontSize: 16,
    fontWeight: '500',
  },
});

/**
 * Returns a react-native-paper theme object that maps app colors
 * onto Paper's TextInput outlined style.
 * Call inside the component after reading colors from ThemeColorsContext.
 *
 * Usage:
 *   const { colors } = useThemeColors();
 *   const { paperInputTheme } = makeModalStyles(colors);
 *   <PaperTextInput mode="outlined" theme={paperInputTheme} ... />
 */
export function makeModalStyles(colors) {
  return {
    paperInputTheme: {
      colors: {
        primary: colors.primary,
        outline: colors.border,
        background: colors.card,
        onSurfaceVariant: colors.mutedText,
        onSurface: colors.text,
        error: colors.error,
      },
    },
  };
}
```

- [ ] **Step 2: Run tests to confirm nothing broken**

```bash
npm test -- --silent
```
Expected: all tests pass, 0 failed.

- [ ] **Step 3: Commit**

```bash
git add app/styles/modalStyles.js
git commit -m "feat(ui): add modalStyles shared stylesheet and PaperTextInput theme helper"
```

---

## Task 2: Create `app/components/ModalShell.js`

**Files:**
- Create: `app/components/ModalShell.js`

- [ ] **Step 1: Create the file**

```javascript
// app/components/ModalShell.js
import React from 'react';
import {
  View,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
import ModalBlurOverlay from './ModalBlurOverlay';

/**
 * ModalShell — shared bottom-sheet wrapper for all modals.
 *
 * Renders: blur overlay → RNModal → KAV → overlay Pressable →
 *   card (drag handle, header, ScrollView[children],
 *          optional delete row, optional extraActions, cancel/save row)
 *
 * When onSave is omitted (shadow operations), only the cancel button is shown.
 * When onDelete is omitted, the delete row is hidden.
 */
export default function ModalShell({
  visible,
  onDismiss,
  title,
  subtitle,
  onSave,
  onCancel,
  saveLabel,
  cancelLabel,
  onDelete,
  deleteLabel,
  deleteDisabled,
  extraActions,
  scrollRef,
  showBlurOverlay,
  children,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();

  return (
    <>
      {showBlurOverlay && visible && <ModalBlurOverlay />}
      <RNModal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onDismiss}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.flex1}>
          <Pressable style={styles.overlay} onPress={onDismiss}>
            <Pressable
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => {}}
            >
              {/* Drag handle */}
              <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                {subtitle ? (
                  <Text style={[styles.subtitle, { color: colors.mutedText }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              {/* Scrollable form content */}
              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>

              {/* Delete row (shown only when onDelete is provided) */}
              {onDelete ? (
                <View style={styles.deleteWrapper}>
                  <TouchableRipple
                    onPress={deleteDisabled ? undefined : onDelete}
                    disabled={deleteDisabled}
                    rippleColor={colors.delete + '18'}
                    style={[
                      styles.btn,
                      styles.deleteRow,
                      { borderColor: colors.delete + '40', opacity: deleteDisabled ? 0.5 : 1 },
                    ]}
                    borderless={false}
                  >
                    <View style={styles.deleteRowContent}>
                      <Icon name="delete-outline" size={18} color={colors.delete} />
                      <Text style={[styles.deleteRowText, { color: colors.delete }]}>
                        {deleteLabel || t('delete')}
                      </Text>
                    </View>
                  </TouchableRipple>
                </View>
              ) : null}

              {/* Extra actions slot (e.g. Split button in OperationModal) */}
              {extraActions || null}

              {/* Cancel / Save (or full-width Cancel when onSave is absent) */}
              <View style={[styles.actions, { borderTopColor: colors.border }]}>
                <TouchableRipple
                  onPress={onCancel}
                  style={[
                    styles.btn,
                    styles.cancelBtn,
                    { borderColor: colors.border },
                    !onSave && styles.fullWidthBtn,
                  ]}
                  rippleColor="rgba(0,0,0,0.05)"
                  borderless={false}
                >
                  <Text style={[styles.btnText, { color: colors.text }]}>
                    {cancelLabel || t('cancel')}
                  </Text>
                </TouchableRipple>

                {onSave ? (
                  <TouchableRipple
                    onPress={onSave}
                    style={[styles.btn, { backgroundColor: colors.primary }]}
                    rippleColor="rgba(255,255,255,0.2)"
                    borderless={false}
                  >
                    <Text style={[styles.btnText, styles.saveBtnText]}>
                      {saveLabel || t('save')}
                    </Text>
                  </TouchableRipple>
                ) : null}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </RNModal>
    </>
  );
}

ModalShell.propTypes = {
  visible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  onSave: PropTypes.func,
  onCancel: PropTypes.func.isRequired,
  saveLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  onDelete: PropTypes.func,
  deleteLabel: PropTypes.string,
  deleteDisabled: PropTypes.bool,
  extraActions: PropTypes.node,
  scrollRef: PropTypes.object,
  showBlurOverlay: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

ModalShell.defaultProps = {
  subtitle: null,
  onSave: null,
  saveLabel: null,
  cancelLabel: null,
  onDelete: null,
  deleteLabel: null,
  deleteDisabled: false,
  extraActions: null,
  scrollRef: null,
  showBlurOverlay: false,
};

const styles = StyleSheet.create({
  actions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  btn: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    overflow: 'hidden',
    paddingVertical: SPACING.sm,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    overflow: 'hidden',
    paddingBottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  deleteRow: {
    borderWidth: 1,
  },
  deleteRowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  deleteRowText: {
    fontSize: 15,
    fontWeight: '500',
  },
  deleteWrapper: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
  },
  dragHandle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 4,
    marginBottom: SPACING.md,
    width: 44,
  },
  flex1: {
    flex: 1,
  },
  fullWidthBtn: {
    flex: 1,
  },
  header: {
    marginBottom: SPACING.sm,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  saveBtnText: {
    color: '#fff',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --silent
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/components/ModalShell.js
git commit -m "feat(ui): add ModalShell shared bottom-sheet wrapper component"
```

---

## Task 3: Refactor `CategoryModal.js`

**Files:**
- Modify: `app/modals/CategoryModal.js`

**What changes:**
- Replace `Modal + KAV + Pressable + drag handle + sheetHeader + sheetActions + deleteWrapper` with `<ModalShell>`
- Name `TextInput` → `PaperTextInput mode="outlined"` with fieldLabel above
- Three picker rows (Type, CategoryType, Parent) → `pickerRowStyles` with fieldLabel above
- Icon picker row stays as-is (special — shows icon preview)
- Import `TouchableRipple, TextInput as PaperTextInput` from `react-native-paper`
- Remove from RN imports: `Modal`, `KeyboardAvoidingView`, `TextInput`

- [ ] **Step 1: Replace imports block (lines 1–26)**

```javascript
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Animated,
  Dimensions,
} from 'react-native';
import { TextInput as PaperTextInput, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useCategories } from '../contexts/CategoriesContext';
import IconPicker from '../components/IconPicker';
import ModalBlurOverlay from '../components/ModalBlurOverlay';
import ModalShell from '../components/ModalShell';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
import PropTypes from 'prop-types';
import { SPACING, BORDER_RADIUS } from '../styles/designTokens';
```

- [ ] **Step 2: Add `makeModalStyles` call inside the component, right after `const { colors } = useThemeColors();` (around line 29)**

```javascript
  const { colors } = useThemeColors();
  const { paperInputTheme } = makeModalStyles(colors);
```

- [ ] **Step 3: Replace the entire `return (...)` block**

Replace everything from `return (` through the closing `);` of the component with:

```javascript
  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_category') : t('edit_category')}
        onSave={handleSave}
        onCancel={handleClose}
        onDelete={isNew ? undefined : handleDelete}
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
                        isDisabled && { opacity: 0.5 },
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
```

- [ ] **Step 4: Replace the `StyleSheet.create` block**

Keep only styles that are still used (picker panel, icon picker button, error):

```javascript
const styles = StyleSheet.create({
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
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --silent
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/modals/CategoryModal.js
git commit -m "feat(ui): refactor CategoryModal to use ModalShell and PaperTextInput"
```

---

## Task 4: Refactor `PlannedOperationModal.js`

**Files:**
- Modify: `app/modals/PlannedOperationModal.js`

**What changes:**
- Replace outer `Modal + KAV + Pressable` boilerplate + `ModalHeader` + `buttonRow` with `<ModalShell>`
- Name, Amount, Description `TextInput` → `PaperTextInput mode="outlined"` with fieldLabel
- Account / Category picker `Pressable` rows → `pickerRowStyles` + `TouchableRipple`
- Delete moves out of `buttonRow` into `ModalShell.onDelete`
- Type selector (Expense/Income/Transfer buttons) and Recurring toggle: unchanged
- Drag handle now provided by ModalShell (was missing)
- Remove from RN imports: `Modal`, `KeyboardAvoidingView`, `TextInput`; keep `Platform` (still used in `renderPickerModal`)

- [ ] **Step 1: Replace imports block (lines 1–28)**

```javascript
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  Keyboard,
  Switch,
} from 'react-native';
import { TextInput as PaperTextInput, TouchableRipple } from 'react-native-paper';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { usePlannedOperations } from '../contexts/PlannedOperationsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import useOperationPicker from '../hooks/useOperationPicker';
import PickerModal from '../components/operations/PickerModal';
import ModalShell from '../components/ModalShell';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
import { SPACING, BORDER_RADIUS, FONT_SIZE, HEIGHTS } from '../styles/designTokens';
```

- [ ] **Step 2: Add `makeModalStyles` call inside component after `const { colors } = useThemeColors();`**

```javascript
  const { colors } = useThemeColors();
  const { paperInputTheme } = makeModalStyles(colors);
```

- [ ] **Step 3: Replace entire `return (...)` block**

```javascript
  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_planned_operation') : t('edit_planned_operation')}
        onSave={handleSave}
        onCancel={handleClose}
        onDelete={isNew ? undefined : handleDelete}
        showBlurOverlay
      >
        {/* Name */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('planned_name') || 'Name').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          value={values.name}
          onChangeText={text => setValues(v => ({ ...v, name: text }))}
          placeholder={t('planned_operation_name_hint')}
          returnKeyType="next"
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
        {errors.name && <Text style={[styles.error, { color: colors.error }]}>{errors.name}</Text>}

        {/* Type Selector */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('operation_type') || 'Type').toUpperCase()}
        </Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map(opt => {
            const isActive = values.type === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isActive ? colors[opt.colorKey] : colors.inputBackground,
                    borderColor: isActive ? colors[opt.colorKey] : colors.inputBorder,
                  },
                ]}
                onPress={() => setValues(v => ({ ...v, type: opt.key, categoryId: null }))}
              >
                <Icon name={opt.icon} size={18} color={isActive ? '#fff' : colors.mutedText} />
                <Text style={[styles.typeLabel, { color: isActive ? '#fff' : colors.mutedText }]}>
                  {t(`${opt.key}_label`) || t(opt.key)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Amount */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('amount') || 'Amount').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          value={values.amount}
          onChangeText={text => setValues(v => ({ ...v, amount: text }))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
        {errors.amount && <Text style={[styles.error, { color: colors.error }]}>{errors.amount}</Text>}

        {/* Account */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('select_account') || 'Account').toUpperCase()}
        </Text>
        <TouchableRipple
          testID="planned-account-picker"
          style={[modalSharedStyles.pickerRow, { borderColor: errors.accountId ? colors.error : colors.border, backgroundColor: colors.card }]}
          onPress={() => setAccountPickerVisible(true)}
          rippleColor="rgba(0,0,0,0.05)"
          borderless={false}
        >
          <View style={modalSharedStyles.pickerRowInner}>
            <Text style={[modalSharedStyles.pickerRowValue, { color: values.accountId ? colors.text : colors.mutedText }]}>
              {values.accountId ? getAccountName(values.accountId) : t('select_account')}
            </Text>
            <Icon name="chevron-down" size={20} color={colors.mutedText} />
          </View>
        </TouchableRipple>
        {errors.accountId && <Text style={[styles.error, { color: colors.error }]}>{errors.accountId}</Text>}

        {/* Category (expense/income only) */}
        {values.type !== 'transfer' && (
          <>
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('select_category') || 'Category').toUpperCase()}
            </Text>
            <TouchableRipple
              testID="planned-category-picker"
              style={[modalSharedStyles.pickerRow, { borderColor: errors.categoryId ? colors.error : colors.border, backgroundColor: colors.card }]}
              onPress={() => openCategoryPicker('category', filteredCategories)}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: values.categoryId ? colors.text : colors.mutedText }]}>
                  {values.categoryId ? getCategoryName(values.categoryId) : t('select_category')}
                </Text>
                <Icon name="chevron-down" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>
            {errors.categoryId && <Text style={[styles.error, { color: colors.error }]}>{errors.categoryId}</Text>}
          </>
        )}

        {/* To Account (transfer only) */}
        {values.type === 'transfer' && (
          <>
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('to_account') || 'To Account').toUpperCase()}
            </Text>
            <TouchableRipple
              style={[modalSharedStyles.pickerRow, { borderColor: errors.toAccountId ? colors.error : colors.border, backgroundColor: colors.card }]}
              onPress={() => setToAccountPickerVisible(true)}
              rippleColor="rgba(0,0,0,0.05)"
              borderless={false}
            >
              <View style={modalSharedStyles.pickerRowInner}>
                <Text style={[modalSharedStyles.pickerRowValue, { color: values.toAccountId ? colors.text : colors.mutedText }]}>
                  {values.toAccountId ? getAccountName(values.toAccountId) : t('select_account')}
                </Text>
                <Icon name="chevron-down" size={20} color={colors.mutedText} />
              </View>
            </TouchableRipple>
            {errors.toAccountId && <Text style={[styles.error, { color: colors.error }]}>{errors.toAccountId}</Text>}
          </>
        )}

        {/* Recurring Toggle */}
        <View style={styles.switchRow}>
          <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText, marginTop: 0 }]}>
            {(t('recurring') || 'Recurring').toUpperCase()}
          </Text>
          <Switch
            value={values.isRecurring}
            onValueChange={val => setValues(v => ({ ...v, isRecurring: val }))}
            trackColor={{ false: colors.border, true: colors.primary + '66' }}
            thumbColor={values.isRecurring ? colors.primary : colors.mutedText}
          />
        </View>

        {/* Description */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('description') || 'Description').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          multiline
          numberOfLines={2}
          value={values.description}
          onChangeText={text => setValues(v => ({ ...v, description: text }))}
          placeholder={t('description')}
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
      </ModalShell>

      {/* Account Picker Modal */}
      {renderPickerModal(
        accountPickerVisible,
        setAccountPickerVisible,
        accounts.map(a => ({ id: a.id, name: `${a.name} (${a.currency})` })),
        (id) => setValues(v => ({ ...v, accountId: id })),
        t('select_account'),
      )}

      {/* To Account Picker Modal */}
      {renderPickerModal(
        toAccountPickerVisible,
        setToAccountPickerVisible,
        accounts.filter(a => a.id !== values.accountId).map(a => ({ id: a.id, name: `${a.name} (${a.currency})` })),
        (id) => setValues(v => ({ ...v, toAccountId: id })),
        t('to_account'),
      )}

      {/* Category Picker Modal (hierarchical) */}
      <PickerModal
        visible={categoryPickerState.visible}
        pickerType={categoryPickerState.type}
        pickerData={categoryPickerState.data}
        colors={colors}
        t={t}
        onClose={closeCategoryPicker}
        categoryNavigation={categoryNavigation}
        quickAddValues={{ ...values, amount: '' }}
        onNavigateBack={navigateBack}
        onNavigateIntoFolder={navigateIntoFolder}
        onSelectCategory={(id) => { setValues(v => ({ ...v, categoryId: id })); closeCategoryPicker(); }}
      />
    </>
  );
```

- [ ] **Step 4: Replace `StyleSheet.create` block — keep only styles still used in the new return block**

```javascript
const styles = StyleSheet.create({
  error: {
    color: '#ff6b6b',
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
  pickerCancel: {
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: SPACING.md,
  },
  pickerCancelText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  pickerContent: {
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '60%',
    paddingTop: SPACING.lg,
    width: '100%',
  },
  pickerItem: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  pickerItemIcon: {
    marginRight: SPACING.sm,
  },
  pickerItemText: {
    fontSize: FONT_SIZE.base,
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    marginHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --silent
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/modals/PlannedOperationModal.js
git commit -m "feat(ui): refactor PlannedOperationModal to use ModalShell and PaperTextInput"
```

---

## Task 5: Refactor `OperationModal.js`

**Files:**
- Modify: `app/modals/OperationModal.js`

**What changes:**
- Replace `Modal + KAV + Pressable + ModalHeader + modalButtonRow + splitDeleteRow` with `<ModalShell>`
- Title always shown: `t('add_operation')` for new, `t('edit_operation')` for edit
- `onSave={isShadowOperation ? undefined : handleSave}` — hides Save for shadow ops
- `cancelLabel={isShadowOperation ? t('close') : t('cancel')}`
- `onDelete={!isNew && onDelete && canDeleteShadowOperation ? handleDelete : undefined}` (show delete only when actionable; pass `deleteDisabled` otherwise)
- Split button → `extraActions` prop
- Category/date picker rows → `pickerRowStyles` with fieldLabel above
- Remove from imports: `ModalHeader`; keep everything else

- [ ] **Step 1: Replace the `ModalHeader` import**

Find line:
```javascript
import ModalHeader from '../components/ModalHeader';
```
Replace with:
```javascript
import ModalShell from '../components/ModalShell';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
```

- [ ] **Step 2: Add `makeModalStyles` call inside component after `const { colors } = useThemeColors();`**

```javascript
  const { colors } = useThemeColors();
  const { paperInputTheme } = makeModalStyles(colors);
```

- [ ] **Step 3: Replace the `return (...)` block**

Replace from `return (` through the closing `);`:

```javascript
  const splitExtraActions = (canSplit || (!isNew && onDelete)) ? (
    <View style={styles.splitDeleteRow}>
      {canSplit && (
        <Pressable
          style={[styles.splitButtonContainer, { backgroundColor: colors.card }]}
          onPress={() => setShowSplitModal(true)}
          testID="split-button"
        >
          <Icon name="call-split" size={18} color={colors.primary} />
          <Text style={[styles.splitButtonText, { color: colors.primary }]}>
            {t('split_transaction')}
          </Text>
        </Pressable>
      )}
    </View>
  ) : null;

  return (
    <>
      <ModalShell
        visible={visible}
        onDismiss={handleClose}
        title={isNew ? t('add_operation') : t('edit_operation')}
        onSave={isShadowOperation ? undefined : handleSave}
        onCancel={handleClose}
        cancelLabel={isShadowOperation ? t('close') : t('cancel')}
        onDelete={!isNew && onDelete ? handleDelete : undefined}
        deleteDisabled={!canDeleteShadowOperation}
        extraActions={splitExtraActions}
        scrollRef={scrollViewRef}
        showBlurOverlay
      >
        {/* Shared Form Fields: type selector, amount, account(s), category, multi-currency */}
        <OperationFormFields
          colors={colors}
          t={t}
          values={values}
          setValues={setValues}
          accounts={accounts}
          categories={filteredCategories}
          getAccountName={getAccountName}
          getAccountBalance={getAccountBalance}
          getCategoryName={getCategoryName}
          openPicker={openPicker}
          onAmountChange={handleAmountChange}
          TYPES={TYPES}
          showTypeSelector={true}
          showAccountBalance={true}
          showFieldIcons={true}
          hideCategoryPicker={!isNew}
          hideTransferTargetPicker={true}
          transferLayout="sideBySide"
          disabled={isShadowOperation}
          containerBackground={colors.card}
          onExchangeRateChange={handleExchangeRateChange}
          onDestinationAmountChange={handleDestinationAmountChange}
          rateSource={rateSource}
        />

        {/* Category / To Account + Date row */}
        <View style={styles.categoryDateRow}>
          {values.type === 'transfer' ? (
            <View style={styles.halfFieldWrapper}>
              <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                {(t('to_account') || 'To').toUpperCase()}
              </Text>
              <Pressable
                style={[
                  styles.pickerButtonHalf,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  isShadowOperation && styles.disabledInput,
                ]}
                onPress={() => !isShadowOperation && openPicker('toAccount', accounts.filter(acc => acc.id !== values.accountId))}
                disabled={isShadowOperation}
                accessibilityRole="button"
                accessibilityLabel={t('to_account')}
                testID="to-account-picker"
              >
                <Icon name="swap-horizontal" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                <Text
                  style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}
                  numberOfLines={1}
                >
                  {values.toAccountId ? getAccountName(values.toAccountId) : t('to_account')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.halfFieldWrapper}>
              <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
                {(t('select_category') || 'Category').toUpperCase()}
              </Text>
              <Pressable
                style={[
                  styles.pickerButtonHalf,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  isShadowOperation && styles.disabledInput,
                ]}
                onPress={() => !isShadowOperation && openPicker('category', filteredCategories)}
                disabled={isShadowOperation}
                accessibilityRole="button"
                accessibilityLabel={t('select_category')}
              >
                <Icon name="tag" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
                <Text
                  style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}
                  numberOfLines={1}
                >
                  {getCategoryName(values.categoryId)}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.halfFieldWrapper}>
            <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
              {(t('select_date') || 'Date').toUpperCase()}
            </Text>
            <Pressable
              style={[
                styles.pickerButtonHalf,
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                isShadowOperation && styles.disabledInput,
              ]}
              onPress={handleOpenDatePicker}
              disabled={isShadowOperation}
              accessibilityRole="button"
              accessibilityLabel={t('select_date')}
              testID="date-input"
            >
              <Icon name="calendar" size={20} color={isShadowOperation ? colors.mutedText : colors.text} />
              <Text style={[styles.pickerButtonText, { color: isShadowOperation ? colors.mutedText : colors.text }]}>
                {formatDateForDisplay(values.date)}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Description with autocomplete */}
        <DescriptionAutocomplete
          value={values.description || ''}
          onChangeText={handleDescriptionChange}
          suggestions={descriptionSuggestions}
          placeholder={t('description')}
          editable={!isShadowOperation}
          colors={colors}
          onFocus={handleDescriptionFocus}
        />

        {errors.general && <Text style={styles.error}>{errors.general}</Text>}
      </ModalShell>

      {/* Split Operation Modal */}
      <SplitOperationModal
        visible={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        onConfirm={handleSplitConfirm}
        originalAmount={values.amount}
        operationType={values.type}
        categories={categories}
        colors={colors}
        t={t}
      />

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={new Date(values.date)}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      {/* Unified Picker Modal */}
      <Modal
        visible={pickerState.visible && visible}
        animationType="slide"
        transparent
        onRequestClose={closePicker}
      >
        <Pressable style={styles.pickerOverlay} onPress={closePicker}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={handleStopPropagation}>
            {pickerState.type === 'category' && categoryNavigation.breadcrumb.length > 0 && (
              <View style={[styles.breadcrumbContainer, { borderBottomColor: colors.border }]}>
                <Pressable onPress={navigateBack} style={styles.backButton}>
                  <Icon name="arrow-left" size={24} color={colors.primary} />
                </Pressable>
                <Text style={[styles.breadcrumbText, { color: colors.text }]} numberOfLines={1}>
                  {categoryNavigation.breadcrumb[categoryNavigation.breadcrumb.length - 1].name}
                </Text>
              </View>
            )}
            <FlatList
              data={pickerState.data}
              keyExtractor={keyExtractor}
              numColumns={pickerState.type === 'category' ? 3 : 1}
              columnWrapperStyle={pickerState.type === 'category' ? styles.gridRow : undefined}
              contentContainerStyle={pickerState.type === 'category' ? styles.gridContent : undefined}
              renderItem={renderPickerItem}
              ListEmptyComponent={
                <Text style={[styles.pickerEmptyText, { color: colors.mutedText }]}>
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            {(pickerState.type !== 'category' || !isNew) && (
              <Pressable style={styles.closeButton} onPress={closePicker}>
                <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
```

- [ ] **Step 4: Add `halfFieldWrapper` style to the existing `StyleSheet.create` block and remove unused styles**

Add inside the existing `StyleSheet.create({...})`:
```javascript
  halfFieldWrapper: {
    flex: 1,
  },
```

Remove these now-unused styles from the StyleSheet: `modalButton`, `modalButtonRow`, `splitButtonContainer`, `splitButtonText`, `splitDeleteRow`, `deleteButtonContainer`, `deleteButtonText`, `disabledButton`, `fullFlex`, `modalContent`, `modalOverlay`, `sheetDragHandle`.

Keep: `accountName`, `accountOption`, `backButton`, `breadcrumbContainer`, `breadcrumbText`, `buttonText`, `categoryDateRow`, `closeButton`, `closeButtonText`, `disabledInput`, `error`, `folderBadge`, `gridCell`, `gridCellName`, `gridContent`, `gridRow`, `halfFieldWrapper`, `pickerButtonHalf`, `pickerButtonText`, `pickerEmptyText`, `pickerModalContent`, `pickerOption`, `pickerOptionCurrency`, `pickerOptionText`, `pickerOverlay`, `scrollContent`, `scrollView`.

- [ ] **Step 5: Run tests**

```bash
npm test -- --silent
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/modals/OperationModal.js
git commit -m "feat(ui): refactor OperationModal to use ModalShell, add edit-mode title"
```

---

## Task 6: Refactor `AccountsScreen.js` (AccountModal section)

**Files:**
- Modify: `app/screens/AccountsScreen.js`

**What changes:**
- Replace `{!!editingId && <ModalBlurOverlay />} + RNModal + KAV + Pressable` boilerplate with `<ModalShell>`
- Add `theme={paperInputTheme}` to existing `PaperTextInput` fields (Name, Balance)
- Fix Currency field: move label above the `TouchableRipple` row (out of the row's inner View)
- Remove `ModalBlurOverlay` import (ModalShell handles it); remove `Modal as RNModal` and `KeyboardAvoidingView` from RN imports
- Import `ModalShell` and `makeModalStyles, modalSharedStyles`

- [ ] **Step 1: Update imports**

In the RN import at line 3, remove `KeyboardAvoidingView` and `Modal as RNModal`:
```javascript
import { View, StyleSheet, ScrollView, Keyboard, FlatList, TouchableOpacity, Pressable, Animated, Dimensions } from 'react-native';
```

Remove line 4:
```javascript
import ModalBlurOverlay from '../components/ModalBlurOverlay';
```

After the existing imports, add:
```javascript
import ModalShell from '../components/ModalShell';
import { makeModalStyles, modalSharedStyles } from '../styles/modalStyles';
```

- [ ] **Step 2: Add `makeModalStyles` call inside `AccountsScreen` component**

Find `const { colors } = useThemeColors();` inside the component body and add below it:
```javascript
  const { paperInputTheme } = makeModalStyles(colors);
```

- [ ] **Step 3: Replace the AccountModal JSX block**

Find and replace the entire block from `{!!editingId && <ModalBlurOverlay />}` through `</RNModal>` (lines ~818–1015) with:

```javascript
      <ModalShell
        visible={!!editingId}
        onDismiss={handleCloseModal}
        title={editingId === 'new' ? (t('add_account') || 'New Account') : (t('edit_account') || 'Edit Account')}
        subtitle={editingId !== 'new' && editValues.name ? editValues.name : undefined}
        onSave={saveEdit}
        onCancel={handleCloseModal}
        onDelete={editingId !== 'new' ? handleDeleteEditingAccount : undefined}
        showBlurOverlay
      >
        {/* Account name */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('account_name') || 'Account name').toUpperCase()}
        </Text>
        <PaperTextInput
          mode="outlined"
          value={editValues.name}
          onChangeText={handleNameChange}
          error={!!errors.name}
          autoFocus={editingId === 'new'}
          returnKeyType="next"
          onSubmitEditing={() => balanceInputRef.current?.focus()}
          blurOnSubmit={false}
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
        {errors.name && <Text variant="bodySmall" style={styles.error}>{errors.name}</Text>}

        {/* Balance */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('balance') || 'Balance').toUpperCase()}
        </Text>
        <PaperTextInput
          ref={balanceInputRef}
          mode="outlined"
          value={editValues.balance}
          onChangeText={handleBalanceChange}
          error={!!errors.balance}
          keyboardType="numeric"
          returnKeyType="done"
          placeholder={(() => {
            const dec = currencies[editValues.currency]?.decimal_digits ?? 2;
            return dec === 0 ? '0' : `0.${'0'.repeat(dec)}`;
          })()}
          onSubmitEditing={Keyboard.dismiss}
          theme={paperInputTheme}
          style={modalSharedStyles.textInput}
        />
        {errors.balance && <Text variant="bodySmall" style={styles.error}>{errors.balance}</Text>}

        {/* Currency — label now above the row */}
        <Text style={[modalSharedStyles.fieldLabel, { color: colors.mutedText }]}>
          {(t('currency') || 'Currency').toUpperCase()}
        </Text>
        <TouchableRipple
          onPress={handleOpenPicker}
          style={[styles.currencyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.currencyRowInner}>
            <Text style={[styles.currencyRowValue, { color: colors.text }]}>
              {editValues.currency
                ? `${currencies[editValues.currency]?.name} · ${currencies[editValues.currency]?.symbol}`
                : (t('select_currency') || 'Select currency')}
            </Text>
            <Icon name="chevron-right" size={22} color={colors.mutedText} />
          </View>
        </TouchableRipple>
        {errors.currency && <Text variant="bodySmall" style={styles.error}>{errors.currency}</Text>}

        {/* Settings group */}
        <View style={[styles.settingsGroup, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {editingId !== 'new' && (
            <View style={[styles.settingItem, styles.settingItemBorder, { borderBottomColor: colors.border }]}>
              <View style={styles.settingItemText}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>
                  {t('create_adjustment_operation') || 'Log adjustment'}
                </Text>
                <Text style={[styles.settingHint, { color: colors.mutedText }]}>
                  {t('create_adjustment_operation_hint') || 'Record balance change as a transaction'}
                </Text>
              </View>
              <Switch
                value={createAdjustmentOperation}
                onValueChange={handleToggleAdjustmentSwitch}
                color={colors.primary}
              />
            </View>
          )}
          <View style={styles.settingItem}>
            <View style={styles.settingItemText}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>
                {t('hidden_account') || 'Hidden account'}
              </Text>
              <Text style={[styles.settingHint, { color: colors.mutedText }]}>
                {t('hidden_account_hint') || 'Hide from main list and operations'}
              </Text>
            </View>
            <Switch
              value={!!editValues.hidden}
              onValueChange={handleToggleHiddenSwitch}
              color={colors.primary}
            />
          </View>
        </View>

        {/* In-sheet currency picker — slides in from the right */}
        {currencyPanelVisible && (
          <Animated.View
            style={[styles.currencyPanel, { backgroundColor: colors.card, transform: [{ translateX: currencySlideAnim }] }]}
          >
            <View style={[styles.currencyPanelHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={handleClosePicker} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="arrow-left" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.currencyPanelTitle, { color: colors.text }]}>
                {t('select_currency') || 'Currency'}
              </Text>
            </View>
            <FlatList
              data={Object.entries(currencies)}
              keyExtractor={([code]) => code}
              renderItem={({ item: [code, cur] }) => (
                <TouchableRipple
                  onPress={() => handleCurrencySelect(code)}
                  style={styles.currencyPanelItem}
                  rippleColor="rgba(0,0,0,0.08)"
                >
                  <Text style={[styles.currencyPanelItemText, { color: colors.text }]}>
                    {cur.name} ({cur.symbol})
                  </Text>
                </TouchableRipple>
              )}
              ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            />
          </Animated.View>
        )}
      </ModalShell>
```

- [ ] **Step 4: Remove unused styles from `StyleSheet.create`**

Remove: `currencyRowLabel`, `deleteRow`, `deleteRowContent`, `deleteRowText`, `deleteWrapper`, `fieldLabel`, `modalContent`, `modalKAV`, `modalOverlay`, `sheetActions`, `sheetBtn`, `sheetBtnCancel`, `sheetBtnSaveText`, `sheetBtnText`, `sheetDragHandle`, `sheetHeader`, `sheetScroll`, `sheetSubtitle`, `sheetTitle`.

Update `currencyRowInner` — remove `paddingVertical: SPACING.sm` since value-only row is slightly taller now:
```javascript
  currencyRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
```
(no change needed — keep as-is)

- [ ] **Step 5: Run tests**

```bash
npm test -- --silent
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/screens/AccountsScreen.js
git commit -m "feat(ui): refactor AccountModal to use ModalShell, move currency label above row"
```

---

## Self-Review Checklist

- [x] All i18n keys exist: `add_operation`, `edit_operation`, `add_account`, `edit_account`, `add_category`, `edit_category`, `add_planned_operation`, `edit_planned_operation` — verified against `assets/i18n/en.json`
- [x] `ModalShell` handles `onSave=null` (shadow ops) with full-width cancel button
- [x] `deleteDisabled` prop propagated correctly — OperationModal passes it for shadow ops
- [x] Animated currency picker panel in AccountModal stays inside ModalShell `children` — absolute-positioned, still works
- [x] Animated picker panel in CategoryModal also inside `children` — same reasoning
- [x] Sub-modals (SplitOperationModal, DateTimePicker, picker modals) rendered outside ModalShell as siblings in Fragment — correct, they each have their own `visible` state
- [x] `ModalBlurOverlay` import removed from AccountsScreen (moved into ModalShell)
- [x] `scrollRef` prop added to ModalShell and forwarded to its ScrollView; OperationModal passes `scrollRef={scrollViewRef}` so `handleDescriptionFocus` continues to work
- [x] No TBDs, no incomplete sections
