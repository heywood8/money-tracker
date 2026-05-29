# Settings Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Settings from a modal to a proper 6th tab in the bottom navigation bar, with subpanel swipe-back gesture support and gear icon removal.

**Architecture:** `SettingsModal.js` is cloned into a new `SettingsScreen.js` — the `Portal`/`Modal` wrapper is replaced with a plain `View`, props are simplified, and a swipe-back gesture is added. `SimpleTabs` gains a 6th tab and a `subPanelActive` boolean that disables the tab-level swipe when a subpanel is open. `Header` loses the gear icon entirely.

**Tech Stack:** React Native, react-native-gesture-handler (`Gesture.Pan`, `GestureDetector`), react-native-reanimated (`runOnJS`), Animated API (existing subpanel animations unchanged)

---

### Task 1: Create SettingsScreen.js

**Files:**
- Create: `app/screens/SettingsScreen.js`

- [ ] **Step 1: Copy SettingsModal.js as the starting point**

```bash
cp app/modals/SettingsModal.js app/screens/SettingsScreen.js
```

- [ ] **Step 2: Update imports at the top of `app/screens/SettingsScreen.js`**

Replace the existing import block (lines 1–26) with:

```js
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, ScrollView, FlatList, Linking, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { Text, Divider, TouchableRipple } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAccountsActions } from '../contexts/AccountsActionsContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { exportBackup, pickImportFile, importBackupFromFile, restoreBackup, createBackup, getPreRestoreSnapshots } from '../services/BackupRestore';
import { getStoredBackups, DAILY_BACKUP_DIR } from '../services/DailyBackupService';
import { useLogEntries } from '../hooks/useLogEntries';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { checkForAppUpdate, listDownloadedApks, installApk, checkAlreadyDownloaded } from '../services/AppUpdateService';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { useUpdateDownload } from '../contexts/UpdateDownloadContext';
import { authenticateWithBiometrics, BiometricResult } from '../services/BiometricService';
import { getValidAccessToken, signIn as googleSignIn, exportToSheets, importFromSheets } from '../services/GoogleSheetsService';
import UpdateContentPanel from '../components/UpdateContentPanel';
```

Key changes from the modal version:
- `Portal` and `Modal` removed from the react-native-paper import
- `Gesture`, `GestureDetector` added from react-native-gesture-handler
- `runOnJS` added from react-native-reanimated
- `useMemo` added to React imports

- [ ] **Step 3: Update the component signature and add the swipe-back gesture**

Find the line:
```js
export default function SettingsModal({ visible, onClose }) {
```

Replace it with:
```js
export default function SettingsScreen({ setSubPanelActive }) {
```

Then, after the existing `closeSubPanel` useCallback definition (the block ending with `}, [settingsAnim, subPanelAnim]);`), insert:

```js
  // Signal parent SimpleTabs when a subpanel is open so it can disable tab swiping
  useEffect(() => {
    setSubPanelActive(activeSubPanel !== null);
  }, [activeSubPanel, setSubPanelActive]);

  // Swipe right to close the active subpanel (mirrors Android back gesture)
  const swipeBackGesture = useMemo(() =>
    Gesture.Pan()
      .enabled(activeSubPanel !== null)
      .activeOffsetX([30, 9999])
      .failOffsetY([-15, 15])
      .onEnd((event) => {
        'worklet';
        if (event.translationX > 50 || event.velocityX > 500) {
          runOnJS(closeSubPanel)();
        }
      }),
    [activeSubPanel, closeSubPanel]
  );
```

- [ ] **Step 4: Replace the root JSX — remove Portal/Modal, wrap in GestureDetector**

Find:
```jsx
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={activeSubPanel ? closeSubPanel : onClose}
        dismissable={true}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
```

Replace with:
```jsx
  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
```

- [ ] **Step 5: Simplify the settings header — remove close button**

Find:
```jsx
            <View style={styles.header}>
              <View style={styles.closeButton} />
              <Text variant="titleLarge" style={[styles.headerTitle, { color: colors.text }]}>{t('settings')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} testID="settings-close-button">
                <Ionicons name="close" size={24} color={colors.mutedText} />
              </TouchableOpacity>
            </View>
```

Replace with:
```jsx
            <View style={styles.header}>
              <Text variant="titleLarge" style={[styles.headerTitle, { color: colors.text }]}>{t('settings')}</Text>
            </View>
```

- [ ] **Step 6: Close the root JSX — replace closing Modal/Portal tags**

Find at the bottom of the return statement:
```jsx
      </Modal>
    </Portal>
  );
```

Replace with:
```jsx
      </View>
    </GestureDetector>
  );
```

- [ ] **Step 7: Update styles — replace modalContainer with container, delete centeredModal**

Find in `StyleSheet.create`:
```js
  modalContainer: {
    ...centeredModal,
    overflow: 'hidden',
  },
```

Replace with:
```js
  container: {
    flex: 1,
    overflow: 'hidden',
  },
```

Find and delete the `centeredModal` constant above `StyleSheet.create`:
```js
const centeredModal = {
  borderRadius: BORDER_RADIUS.lg,
  margin: SPACING.md,
  maxHeight: '95%',
};
```

Delete those 5 lines entirely.

- [ ] **Step 8: Update the header style to left-align the title**

Find the `header:` entry in `StyleSheet.create`. It will have `justifyContent: 'space-between'` (used to center the title between two buttons). Change it to `'flex-start'` since there is now only one child:

```js
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
```

(Read the actual values from the file; only change `justifyContent`.)

- [ ] **Step 9: Update propTypes**

Find at the bottom of the file:
```js
SettingsModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
```

Replace with:
```js
SettingsScreen.propTypes = {
  setSubPanelActive: PropTypes.func.isRequired,
};
```

- [ ] **Step 10: Verify no remaining references to `onClose` or `visible` prop exist in this file**

```bash
grep -n "onClose\|visible" app/screens/SettingsScreen.js
```

Any remaining hits should be inside JSDoc comments or unrelated variable names. If `onClose` appears as a callback call, investigate — it shouldn't exist after step 5 and 9.

---

### Task 2: Update SimpleTabs.js

**Files:**
- Modify: `app/navigation/SimpleTabs.js`

- [ ] **Step 1: Swap the SettingsModal import for SettingsScreen**

Find:
```js
import SettingsModal from '../modals/SettingsModal';
```

Replace with:
```js
import SettingsScreen from '../screens/SettingsScreen';
```

- [ ] **Step 2: Add Settings to TAB_ICONS**

Find:
```js
const TAB_ICONS = {
  Operations: 'swap-horizontal',
  Graphs: 'chart-line',
  Accounts: 'wallet-outline',
  Categories: 'shape-outline',
  Planned: 'calendar-clock',
};
```

Replace with:
```js
const TAB_ICONS = {
  Operations: 'swap-horizontal',
  Graphs: 'chart-line',
  Accounts: 'wallet-outline',
  Categories: 'shape-outline',
  Planned: 'calendar-clock',
  Settings: 'settings-outline',
};
```

- [ ] **Step 3: Add Settings to the TABS array**

Find:
```js
  const TABS = useMemo(() => [
    { key: 'Operations', label: t('operations') || 'Operations' },
    { key: 'Graphs', label: t('graphs') || 'Graphs' },
    { key: 'Accounts', label: t('accounts') || 'Accounts' },
    { key: 'Categories', label: t('categories') || 'Categories' },
    { key: 'Planned', label: t('planned') || 'Planned' },
  ], [t]);
```

Replace with:
```js
  const TABS = useMemo(() => [
    { key: 'Operations', label: t('operations') || 'Operations' },
    { key: 'Graphs', label: t('graphs') || 'Graphs' },
    { key: 'Accounts', label: t('accounts') || 'Accounts' },
    { key: 'Categories', label: t('categories') || 'Categories' },
    { key: 'Planned', label: t('planned') || 'Planned' },
    { key: 'Settings', label: t('settings') || 'Settings' },
  ], [t]);
```

- [ ] **Step 4: Replace settingsVisible state with subPanelActive state**

Find:
```js
  const [active, setActive] = React.useState('Operations');
  const [settingsVisible, setSettingsVisible] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);
```

Replace with:
```js
  const [active, setActive] = React.useState('Operations');
  const [subPanelActive, setSubPanelActive] = React.useState(false);
  const [tabBarWidth, setTabBarWidth] = React.useState(SCREEN_WIDTH);
```

- [ ] **Step 5: Delete handleOpenSettings and handleCloseSettings**

Find and delete:
```js
  const handleOpenSettings = useCallback(() => {
    setSettingsVisible(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);
```

- [ ] **Step 6: Add .enabled() guard to panGesture**

Find:
```js
    return Gesture.Pan()
      .activeOffsetX([-10, 10])
```

Replace with:
```js
    return Gesture.Pan()
      .enabled(!subPanelActive)
      .activeOffsetX([-10, 10])
```

Add `subPanelActive` to the panGesture useMemo dependency array. Find:
```js
  }, [translateX, activeIndex, startTranslateX, TABS, setActive]);
```

Replace with:
```js
  }, [translateX, activeIndex, startTranslateX, TABS, setActive, subPanelActive]);
```

- [ ] **Step 7: Update screensContainer width from 5 to 6**

Find in `StyleSheet.create`:
```js
  screensContainer: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * 5,
  },
```

Replace with:
```js
  screensContainer: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * 6,
  },
```

- [ ] **Step 8: Add SettingsScreen to renderScreens**

Find `renderScreens` and add the 6th screen after `PlannedOperationsScreen`:

```js
  const renderScreens = useCallback(() => {
    return (
      <>
        <View style={styles.screen}>
          <OperationsScreen />
        </View>
        <View style={styles.screen}>
          <GraphsScreen />
        </View>
        <View style={styles.screen}>
          <AccountsScreen />
        </View>
        <View style={styles.screen}>
          <CategoriesScreen />
        </View>
        <View style={styles.screen}>
          <PlannedOperationsScreen />
        </View>
        <View style={styles.screen}>
          <SettingsScreen setSubPanelActive={setSubPanelActive} />
        </View>
      </>
    );
  }, [setSubPanelActive]);
```

- [ ] **Step 9: Remove onOpenSettings from Header and delete SettingsModal render**

Find:
```jsx
      <Header onOpenSettings={handleOpenSettings} activeScreen={active} operationsData={operationsData} />
```

Replace with:
```jsx
      <Header activeScreen={active} operationsData={operationsData} />
```

Find and delete:
```jsx
      {settingsVisible && <SettingsModal visible={settingsVisible} onClose={handleCloseSettings} />}
```

---

### Task 3: Update Header.js

**Files:**
- Modify: `app/components/Header.js`

- [ ] **Step 1: Remove onOpenSettings from the function signature**

Find:
```js
export default function Header({ onOpenSettings, rightContent, activeScreen, operationsData }) {
```

Replace with:
```js
export default function Header({ rightContent, activeScreen, operationsData }) {
```

- [ ] **Step 2: Delete the settings gear TouchableOpacity**

Find and delete this entire block:
```jsx
              <TouchableOpacity
                onPress={onOpenSettings}
                testID="settings-button"
                accessibilityLabel={t('settings')}
                accessibilityRole="button"
                accessibilityHint="Opens settings menu"
                style={styles.settingsButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="settings-outline" size={24} color={colors.text} />
              </TouchableOpacity>
```

- [ ] **Step 3: Remove onOpenSettings from propTypes and defaultProps**

Find:
```js
Header.propTypes = {
  onOpenSettings: PropTypes.func,
  rightContent: PropTypes.node,
  activeScreen: PropTypes.string,
  operationsData: PropTypes.object,
};

Header.defaultProps = {
  onOpenSettings: () => {},
  rightContent: null,
  activeScreen: null,
  operationsData: null,
};
```

Replace with:
```js
Header.propTypes = {
  rightContent: PropTypes.node,
  activeScreen: PropTypes.string,
  operationsData: PropTypes.object,
};

Header.defaultProps = {
  rightContent: null,
  activeScreen: null,
  operationsData: null,
};
```

- [ ] **Step 4: Delete the settingsButton style**

Find in `StyleSheet.create`:
```js
  settingsButton: {
    padding: 8,
  },
```

Delete those 3 lines.

---

### Task 4: Update Tests

**Files:**
- Create: `__tests__/screens/SettingsScreen.test.js`
- Modify: `__tests__/components/Header.test.js`
- Modify: `__tests__/navigation/SimpleTabs.test.js`

- [ ] **Step 1: Copy the SettingsModal test as a starting point**

```bash
cp __tests__/modals/SettingsModal.test.js __tests__/screens/SettingsScreen.test.js
```

- [ ] **Step 2: Update the import in SettingsScreen.test.js**

Find:
```js
import SettingsModal from '../../app/modals/SettingsModal';
```

Replace with:
```js
import SettingsScreen from '../../app/screens/SettingsScreen';
```

- [ ] **Step 3: Add mockSetSubPanelActive and update all render calls**

Add near the top with other mocks:
```js
const mockSetSubPanelActive = jest.fn();
```

Add `mockSetSubPanelActive.mockClear()` in `beforeEach` alongside the other clears.

Replace every render call from:
```js
render(<SettingsModal visible={true} onClose={jest.fn()} />)
```
to:
```js
render(<SettingsScreen setSubPanelActive={mockSetSubPanelActive} />)
```

- [ ] **Step 4: Remove modal-specific tests from SettingsScreen.test.js**

Delete any test cases that test:
- `visible={false}` renders nothing
- Backdrop tap dismisses the modal
- `settings-close-button` testID existence or press behavior
- `onDismiss` prop behavior

Update the top-level `describe` title from `'SettingsModal'` to `'SettingsScreen'`.

- [ ] **Step 5: Run SettingsScreen.test.js**

```bash
npm test -- --silent --testPathPattern="SettingsScreen.test" 2>&1
```

Expected: all tests pass.

- [ ] **Step 6: Update Header.test.js — remove settings button tests**

Open `__tests__/components/Header.test.js`. Delete:
- The `mockOnOpenSettings` mock variable and its `beforeEach` clear
- Every test case that tests `settings-button` testID or calls `onOpenSettings`
- The `it('uses default onOpenSettings when not provided', ...)` test

For every remaining render call that passes `onOpenSettings={mockOnOpenSettings}`, remove that prop:
```js
// FROM:
render(<Header onOpenSettings={mockOnOpenSettings} />)
// TO:
render(<Header />)
```

- [ ] **Step 7: Run Header.test.js**

```bash
npm test -- --silent --testPathPattern="Header.test" 2>&1
```

Expected: all tests pass.

- [ ] **Step 8: Update SimpleTabs.test.js**

Open `__tests__/navigation/SimpleTabs.test.js`:

1. Update the Header mock — remove the `onOpenSettings`-based Pressable:
```js
// Replace the existing Header mock function body with:
function Header() {
  return React.createElement(View, { testID: 'mock-header' });
}
```

2. Replace the SettingsModal mock with a SettingsScreen mock:
```js
jest.mock('../../app/screens/SettingsScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  function SettingsScreen({ setSubPanelActive }) {
    return React.createElement(View, { testID: 'settings-screen' });
  }
  return SettingsScreen;
});
```

3. Delete the old SettingsModal mock:
```js
// Delete this entire block:
jest.mock('../../app/modals/SettingsModal', () => { ... });
```

4. Delete all test cases that reference `settings-button`, `settingsVisible`, `openSettings`, or `closeSettings`.

5. Add new tests:
```js
it('renders the Settings tab button', () => {
  const { getAllByRole } = render(<SimpleTabs />);
  const tabs = getAllByRole('button');
  // 6 tabs total: Operations, Graphs, Accounts, Categories, Planned, Settings
  expect(tabs.length).toBeGreaterThanOrEqual(6);
});
```

- [ ] **Step 9: Run SimpleTabs.test.js**

```bash
npm test -- --silent --testPathPattern="SimpleTabs.test" 2>&1
```

Expected: all tests pass.

---

### Task 5: Delete old files and final commit

**Files:**
- Delete: `app/modals/SettingsModal.js`
- Delete: `__tests__/modals/SettingsModal.test.js`

- [ ] **Step 1: Run the full test suite before deleting**

```bash
npm test -- --silent 2>&1
```

Expected: 0 failures.

- [ ] **Step 2: Delete old files**

```bash
rm app/modals/SettingsModal.js
```

```bash
rm __tests__/modals/SettingsModal.test.js
```

- [ ] **Step 3: Run the full test suite after deleting**

```bash
npm test -- --silent 2>&1
```

Expected: 0 failures. If any test imports from `../../app/modals/SettingsModal`, it will fail — update that import to `../../app/screens/SettingsScreen`.

- [ ] **Step 4: Stage and commit**

```bash
git add app/screens/SettingsScreen.js app/navigation/SimpleTabs.js app/components/Header.js __tests__/screens/SettingsScreen.test.js __tests__/components/Header.test.js __tests__/navigation/SimpleTabs.test.js
```

```bash
git rm app/modals/SettingsModal.js __tests__/modals/SettingsModal.test.js
```

```bash
git commit -m "feat(nav): move settings from modal to 6th tab screen"
```
