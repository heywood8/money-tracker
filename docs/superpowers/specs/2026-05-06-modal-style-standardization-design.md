# Modal Style Standardization

**Date:** 2026-05-06  
**Scope:** OperationModal, CategoryModal, PlannedOperationModal, AccountModal

## Problem

The four bottom-sheet modals were built incrementally without a shared structure, producing visible inconsistencies:
- OperationModal shows no title when editing
- PlannedOperationModal is missing the drag handle
- Delete/Cancel/Save button styles differ across every modal
- Input styling differs: AccountModal uses react-native-paper `TextInput`; the others use raw RN `TextInput` with manual labels
- The Currency picker row in AccountModal has its label inside the row instead of above it

## Goal

All four modals look and feel identical in terms of shell structure and input/button styling. AccountModal is the reference design.

---

## New Files

### `app/components/ModalShell.js`

Structural wrapper that replaces each modal's boilerplate outer layout. Renders:

```
RNModal (animationType="slide", transparent)
  ├── {showBlurOverlay && <ModalBlurOverlay />}   ← outside RNModal, in Fragment
  └── KeyboardAvoidingView (behavior="padding")
        └── Pressable overlay (onPress=onDismiss, flex, justifyContent=flex-end)
              └── Pressable card (stopPropagation, borderTopRadius=24, maxHeight=85%, bg=colors.card)
                    ├── drag handle (44×4, borderRadius=3, bg=colors.border, alignSelf=center, mb=SPACING.md)
                    ├── header View (mb=SPACING.sm)
                    │     ├── Text title (fontSize=18, fontWeight=700, letterSpacing=-0.3)
                    │     └── Text subtitle? (fontSize=12, color=mutedText, mt=2)
                    ├── ScrollView (flexShrink=1, keyboardShouldPersistTaps=handled, showsVerticalScrollIndicator=false)
                    │     └── {children}  ← form content
                    ├── {onDelete && deleteRow}
                    │     └── TouchableRipple (borderRadius=md, borderWidth=1, borderColor=delete+40, full width)
                    │           └── Icon "delete-outline" + Text (color=delete, gap=SPACING.sm)
                    ├── {extraActions}  ← optional slot, used by OperationModal for Split row
                    └── actionRow (borderTopWidth=1, borderTopColor=border, flexDirection=row, gap=SPACING.sm, pt=SPACING.sm, pb=SPACING.xl)
                          ├── Cancel: TouchableRipple (flex=1, borderWidth=1, borderColor=border, borderRadius=md, pv=SPACING.sm)
                          └── Save:   TouchableRipple (flex=1, bg=colors.primary, borderRadius=md, pv=SPACING.sm, text white)
```

**Props:**

| Prop | Type | Required | Default |
|------|------|----------|---------|
| `visible` | bool | yes | — |
| `onDismiss` | fn | yes | — |
| `title` | string | yes | — |
| `subtitle` | string | no | — |
| `onSave` | fn | yes | — |
| `onCancel` | fn | yes | — |
| `saveLabel` | string | no | `t('save')` |
| `cancelLabel` | string | no | `t('cancel')` |
| `onDelete` | fn | no | — (delete row hidden when absent) |
| `deleteLabel` | string | no | `t('delete')` |
| `extraActions` | node | no | — |
| `showBlurOverlay` | bool | no | `false` |
| `children` | node | yes | — |

ModalShell uses `useContext(ThemeColorsContext)` and `useContext(LocalizationContext)` internally for colors and translations.

---

### `app/styles/modalStyles.js`

Exports a function `makeModalStyles(colors)` returning shared styles for form content inside the shell. Does **not** duplicate shell structural styles.

**`paperInputTheme`** — passed as `theme` prop to every `PaperTextInput`:
```js
{
  colors: {
    primary: colors.primary,
    outline: colors.border,
    background: colors.card,
    onSurfaceVariant: colors.mutedText,
    onSurface: colors.text,
    error: colors.error,
  }
}
```

**`pickerRowStyles`** — StyleSheet for tappable picker rows (category, account, currency, icon selectors). Matches AccountModal's `currencyRow` pattern:
```
LABEL TEXT              ← fontSize=11, fontWeight=600, letterSpacing=0.8, color=mutedText, mb=2
┌─── selected value ──────────────── › ──┐   ← borderRadius=md, borderWidth=1, borderColor=border
```
Styles: `pickerRow`, `pickerRowInner`, `pickerLabel`, `pickerValue`

Usage in each modal:
```js
const { paperInputTheme, pickerRowStyles } = makeModalStyles(colors);
// pass paperInputTheme to every PaperTextInput
// apply pickerRowStyles to every tappable picker field
```

---

## Modified Files

### `app/modals/OperationModal.js`

- Replace outer boilerplate with `<ModalShell>`:
  - `title`: `t('add_operation')` when new, `t('edit_operation')` when editing
  - `onDelete`: existing delete handler (shown only in edit mode, so pass `isNew ? undefined : handleDelete`)
  - `extraActions`: existing Split button row JSX
  - `showBlurOverlay`: true
- Remove: `ModalHeader`, `modalButtonRow`, the split/delete bottom row, manual `Modal`/`KAV`/`Pressable` wrapper
- Description field: `TextInput` → `PaperTextInput mode="outlined" theme={paperInputTheme}`
- Category, Account, Date picker rows: apply `pickerRowStyles`
- Amount stays as-is (calculator widget, not a TextInput)

### `app/modals/CategoryModal.js`

- Replace outer boilerplate with `<ModalShell>`:
  - `title`: `t('add_category')` / `t('edit_category')`
  - `onDelete`: existing delete handler (pass `isNew ? undefined : handleDelete`)
  - `showBlurOverlay`: true
- Remove: manual drag handle, `sheetHeader`, `sheetActions`, `deleteWrapper`, manual `Modal`/`KAV`/`Pressable` wrapper
- Name field: `TextInput` → `PaperTextInput mode="outlined" theme={paperInputTheme}`
- Type / Category Type / Parent Category / Icon rows: apply `pickerRowStyles`
- Sliding `Animated.View` picker panel: stays inside `children`, no change

### `app/modals/PlannedOperationModal.js`

- Replace outer boilerplate with `<ModalShell>`:
  - `title`: `t('add_planned_operation')` / `t('edit_planned_operation')`
  - `onDelete`: existing handler (pass `isNew ? undefined : handleDelete`)
  - `showBlurOverlay`: true
- Drag handle now provided by ModalShell (was missing)
- Remove: `ModalHeader`, `buttonRow` (Delete/Cancel/Save), manual `Modal`/`KAV`/`Pressable` wrapper
- Name, Amount, Description fields: `TextInput` → `PaperTextInput mode="outlined" theme={paperInputTheme}`
- Account / Category picker rows: apply `pickerRowStyles`
- Type selector (Expense/Income/Transfer inline buttons): stays as-is
- Recurring toggle: stays as-is

### `app/screens/AccountsScreen.js` (AccountModal section)

- Replace manual outer boilerplate with `<ModalShell>`:
  - `title`: `t('add_account')` / `t('edit_account')`
  - `subtitle`: account name in edit mode
  - `onDelete`: existing handler (pass `editingId === 'new' ? undefined : handleDeleteEditingAccount`)
  - `showBlurOverlay`: false (AccountModal currently has no blur overlay)
- Fix CURRENCY field: replace current `currencyRow` (label inside) with `pickerRowStyles` pattern (label above)
- Existing `PaperTextInput` fields (Name, Balance): keep as-is, add `theme={paperInputTheme}` for consistency
- Remove: manual drag handle, `sheetHeader`, `sheetActions`, `deleteWrapper`, manual `Modal`/`KAV`/`Pressable` wrapper

---

## What Does NOT Change

- Calculator widget in OperationModal
- Expense/Income/Transfer type selector in PlannedOperationModal
- Recurring toggle in PlannedOperationModal
- Animated sliding picker panel in CategoryModal
- All sub-picker modals (icon picker, category hierarchy picker, account picker)
- `ModalHeader.js` component (kept for any future use, just no longer used by these modals)

---

## Testing

All existing modal tests must pass unchanged. No new tests required — this is a visual refactor with no logic changes. Run `npm test -- --silent` before and after to confirm zero regressions.
