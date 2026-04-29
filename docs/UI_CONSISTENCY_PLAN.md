# UI Consistency Audit & Consolidation Plan

This audit follows the same pattern as PR #422 (extracting `AddFAB`): identify
visual/structural duplication that has drifted between screens and consolidate
it into a single shared component.

The top three opportunities are listed below in priority order.

---

## 1. Loading-state full-screen view → `LoadingView`

The "screen is loading" full-screen view is duplicated across four screens with
visible drift in the spinner color and the wrapper text style.

### Where it appears

- `app/screens/AccountsScreen.js:683-688`
  ```jsx
  <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
    <ActivityIndicator size="large" />
    <Text variant="bodyLarge" style={[styles.loadingText, { color: colors.mutedText }]}>
      {t('loading_accounts') || 'Loading accounts...'}
    </Text>
  </View>
  ```
- `app/screens/CategoriesScreen.js:187-192`
  ```jsx
  <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
    <ActivityIndicator size="large" />
    <Text variant="bodyLarge" style={[styles.sectionMarginTop, { color: colors.mutedText }]}>
      {t('loading_categories') || 'Loading categories...'}
    </Text>
  </View>
  ```
- `app/screens/OperationsScreen.js:563-568`
  ```jsx
  <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={[styles.loadingText, { color: colors.mutedText }]}>
      {t('loading_operations')}
    </Text>
  </View>
  ```
- `app/screens/AppInitializer.js:120` — `<ActivityIndicator size="large" color={colors.primary} />`

### Drift

| Property                  | Accounts            | Categories          | Operations          |
| ------------------------- | ------------------- | ------------------- | ------------------- |
| Spinner `color`           | default (theme)     | default (theme)     | `colors.primary`    |
| Text `variant`            | `bodyLarge`         | `bodyLarge`         | none (default)      |
| Text style key            | `loadingText`       | `sectionMarginTop`  | `loadingText`       |
| `loadingContainer` style  | duplicated x3       | duplicated x3       | duplicated x3       |

Same intent, three slightly different implementations.

### Plan

1. Create `app/components/LoadingView.js`:
   - Props: `message: string`, optional `testID`.
   - Renders a full-screen flex container with `colors.background`,
     `<ActivityIndicator size="large" color={colors.primary} />`, and a
     `<Text variant="bodyLarge">` below it in `colors.mutedText` with a
     `marginTop: SPACING.md`.
   - Uses `useThemeColors()` internally so callers don't pass `colors`.
2. Replace the inline blocks in `AccountsScreen.js`, `CategoriesScreen.js`,
   and `OperationsScreen.js` with `<LoadingView message={t('loading_…')} />`.
3. Delete the now-unused `loadingContainer`, `loadingText`, and
   `sectionMarginTop` styles from each screen.
4. Add a unit test under `__tests__/components/LoadingView.test.js`
   verifying the message renders and the spinner is present.

---

## 2. Empty-list placeholder → `EmptyState`

Each list screen has its own "nothing here yet" view with different layout,
icon presence, and centering strategy. This is the most user-visible drift
of the three opportunities.

### Where it appears

- `app/screens/AccountsScreen.js:716-718` — text only, no icon, padding-based:
  ```jsx
  <Text style={[styles.listEmptyText, { color: colors.mutedText }]}>
    {t('no_accounts') || 'No accounts yet.'}
  </Text>
  ```
- `app/screens/CategoriesScreen.js:247-249, 262-264` — text only inside a
  flex-centered container, no icon:
  ```jsx
  <View style={styles.emptyContainer}>
    <Text style={{ color: colors.mutedText }}>{t('no_categories')}</Text>
  </View>
  ```
- `app/screens/PlannedOperationsScreen.js:217-223` — icon + text, fixed 80px
  top-padding:
  ```jsx
  <View style={styles.emptyContainer}>
    <Icon name="calendar-blank-outline" size={48} color={colors.mutedText} />
    <Text style={[styles.emptyText, { color: colors.mutedText }]}>
      {t('no_planned_operations')}
    </Text>
  </View>
  ```

### Drift

| Property             | Accounts             | Categories           | Planned                     |
| -------------------- | -------------------- | -------------------- | --------------------------- |
| Icon                 | none                 | none                 | `calendar-blank-outline` 48 |
| Centering strategy   | `padding: SPACING.xl`| `flex: 1, justifyContent: 'center', paddingTop: TOP_CONTENT_SPACING` | `paddingTop: 80, gap: SPACING.md` |
| Text size            | default              | default              | `FONT_SIZE.md`              |

Three different empty states for the same conceptual surface.

### Plan

1. Create `app/components/EmptyState.js`:
   - Props: `icon?: string` (MaterialCommunityIcons name),
     `iconSize?: number = 48`, `message: string`,
     `testID?: string`.
   - Renders a flex container with `alignItems: 'center'`,
     `justifyContent: 'center'`, `gap: SPACING.md`,
     `paddingVertical: SPACING.xl`. When `icon` is provided it renders the
     `<Icon>` in `colors.mutedText` above the text.
   - Text uses `FONT_SIZE.md`, `colors.mutedText`, `textAlign: 'center'`.
2. Replace the three usages above with:
   - `AccountsScreen` → `<EmptyState icon="bank-outline" message={t('no_accounts')} />`
   - `CategoriesScreen` → `<EmptyState icon="shape-outline" message={t('no_categories')} />`
     (use the same component for both grid and list `ListEmptyComponent`).
   - `PlannedOperationsScreen` → `<EmptyState icon="calendar-blank-outline" message={t('no_planned_operations')} />`.
3. Pick icons that match the screen domain so there is now an icon
   *everywhere* (current default is "no icon"). Confirm icon choices with the
   designer/user if uncertain.
4. Remove `listEmptyText`, `emptyContainer`, `emptyText` styles from each
   screen's StyleSheet.
5. Add a snapshot/render test verifying both the icon-present and icon-absent
   render paths.

---

## 3. Modal title header → `ModalHeader`

Every data-entry modal renders the same title at the top of its scroll view,
but each defines its own `modalTitle` style and they have drifted in font
size, weight, and bottom margin.

### Where it appears

- `app/modals/CategoryModal.js:157-159` and styles at `:497-502`
- `app/modals/BudgetModal.js:242-244` and styles at `:676-681`
- `app/modals/OperationModal.js:376-378` and styles at `:751-756`
- `app/modals/PlannedOperationModal.js:244-246` and styles at `:510-515`

### Drift

| Modal                     | `fontSize`     | `fontWeight` | `marginBottom`  |
| ------------------------- | -------------- | ------------ | --------------- |
| `CategoryModal`           | `20`           | `'bold'`     | `16`            |
| `BudgetModal`             | `20`           | `'bold'`     | `8`             |
| `OperationModal`          | `20`           | `'bold'`     | `16`            |
| `PlannedOperationModal`   | `FONT_SIZE.lg` | `'700'`      | `SPACING.lg`    |

Four copies, three distinct visual results. `BudgetModal`'s `marginBottom: 8`
is half of the others; `PlannedOperationModal` resolves to a different size
(`FONT_SIZE.lg` vs literal `20`).

### Plan

1. Create `app/components/ModalHeader.js`:
   - Props: `title: string`, optional `onClose?: () => void`,
     `testID?: string`.
   - Renders a centered `<Text>` using `FONT_SIZE.lg`, `fontWeight: '700'`,
     `marginBottom: SPACING.lg`, `color: colors.text`.
   - If `onClose` is provided, render an `X` icon on the right side
     (`MaterialCommunityIcons` `close`, `colors.mutedText`) that triggers
     `onClose` — this gives every modal a consistent dismiss affordance.
     For now we do not have to wire `onClose` everywhere; first iteration
     can ship title-only.
2. Replace the four `<Text style={styles.modalTitle}>…</Text>` blocks above
   with `<ModalHeader title={isNew ? t('add_x') : t('edit_x')} />`.
3. Delete `modalTitle` from each of the four StyleSheets.
4. Update tests in `__tests__/modals/*.test.js` (where present) to query the
   header by role/testID rather than by class.
5. Follow-up (separate PR, out of scope here): standardize on the
   `ModalHeader`'s optional `onClose` prop and connect each modal's existing
   close handler. This unblocks a future PR that adds a real close button to
   every modal — currently dismissal is only via the bottom Cancel button.

---

## Roadmap & risk

| Step | Component       | Files touched | Risk   | Recommended order |
| ---- | --------------- | ------------- | ------ | ----------------- |
| 1    | `LoadingView`   | 3 screens     | LOW    | First             |
| 2    | `EmptyState`    | 3 screens     | LOW    | Second            |
| 3    | `ModalHeader`   | 4 modals      | MEDIUM | Third             |

Each step should be its own PR (mirroring the scope of #422) so that visual
regressions can be reviewed in isolation. Run the full Jest suite
(`npm test -- --silent`) after each step; no test should require updating
unless it asserted on the now-removed inline styles.
