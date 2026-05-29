# Settings Screen Design

**Date:** 2026-05-29  
**Status:** Approved

## Problem

Settings is currently a modal (`app/modals/SettingsModal.js`, 1693 lines) triggered by a gear icon in the header. This pattern is inconsistent with the rest of the app's screen-based navigation and limits discoverability.

## Solution

Move Settings to a proper 6th tab in the bottom bar. Settings content and its sliding subpanels remain in place; only the container changes from a modal to a screen. The gear icon in the header is removed.

## Approach

Option B: Settings as the 6th screen in the swipe container with gesture hoisting.

Settings becomes a true 6th screen inside `screensContainer`. A `subPanelActive` boolean is lifted to `SimpleTabs` and used to disable the tab-level pan gesture when a subpanel is open. `SettingsScreen` owns a local swipe-back gesture that fires when a subpanel is active.

## Architecture

### 1. Navigation — `app/navigation/SimpleTabs.js`

- Add `Settings` as the 6th entry in `TABS`:  
  `{ key: 'Settings', label: t('settings') || 'Settings' }`
- Add `settings-outline` to `TAB_ICONS`
- `screensContainer` width becomes `SCREEN_WIDTH * 6`
- `renderScreens()` appends `<SettingsScreen setSubPanelActive={setSubPanelActive} />`
- Add state: `const [subPanelActive, setSubPanelActive] = React.useState(false)`
- Add `.enabled(!subPanelActive)` to the existing `panGesture` so tab swiping is disabled when a settings subpanel is open
- Remove: `settingsVisible` state, `handleOpenSettings`, `handleCloseSettings`, and the `<SettingsModal>` render
- Remove `onOpenSettings` prop passed to `<Header>`

### 2. New Screen — `app/screens/SettingsScreen.js`

- Created from `app/modals/SettingsModal.js` — all subpanel state, animations, and business logic move over unchanged
- Root element changes from `Portal`/`Modal` to a plain `View` with `flex: 1` and `backgroundColor: colors.background`
- `visible` and `onClose` props removed; screen is always mounted
- New prop: `setSubPanelActive(bool)` — called via `useEffect` on `activeSubPanel`:
  ```js
  useEffect(() => {
    setSubPanelActive(activeSubPanel !== null);
  }, [activeSubPanel, setSubPanelActive]);
  ```
- Local swipe-back gesture added (active only when `activeSubPanel !== null`):
  - Uses `Gesture.Pan()` from react-native-gesture-handler
  - Fires `closeSubPanel()` on rightward swipe with translation > 50px or velocityX > 500
  - Mirrors the easing/spring behavior of the existing tab swipe
- `app/modals/SettingsModal.js` is deleted after migration

### 3. Header — `app/components/Header.js`

- `onOpenSettings` prop removed from component signature, propTypes, and defaultProps
- Settings gear `TouchableOpacity` block (the `settings-outline` icon button) deleted
- `SimpleTabs` stops passing `onOpenSettings` to `<Header>`

## Files Changed

| File | Change |
|------|--------|
| `app/navigation/SimpleTabs.js` | Add 6th tab, add `subPanelActive` state, disable gesture when subpanel open, remove modal state/render |
| `app/screens/SettingsScreen.js` | New file — migrated from SettingsModal |
| `app/modals/SettingsModal.js` | Deleted |
| `app/components/Header.js` | Remove gear icon and `onOpenSettings` prop |

## Gesture Behavior

| State | Tab swipe | Left swipe |
|-------|-----------|------------|
| Settings tab, no subpanel open | Enabled (swipe away from Settings navigates to Planned) | No-op |
| Settings tab, subpanel open | Disabled | Fires `closeSubPanel()` |
| Any other tab | Enabled | Normal tab switch |

## What Does NOT Change

- Subpanel content, animations, easing, and state machine are untouched
- All business logic (backup/restore, Google Sheets, language picker, logs, update checker) stays in place
- The `activeSubPanel` pattern (`'language'` | `'export'` | `'logs'` | `'backups'` | `null`) is preserved
