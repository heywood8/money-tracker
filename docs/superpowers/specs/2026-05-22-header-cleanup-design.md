# Header Cleanup Design

**Date:** 2026-05-22

## Goal

Remove the logo image and "Penny" app name from the header, and shrink the header height to the minimum needed to contain the icon buttons.

## Scope

Single file: `app/components/Header.js`

## Changes

### JSX

Remove the `titleContainer` block entirely:

```jsx
// DELETE this entire block
<View style={styles.titleContainer}>
  <Image
    source={require('../../assets/icon.png')}
    style={styles.icon}
    accessibilityLabel="Penny app icon"
  />
  <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
</View>
```

The `buttonContainer` remains. With nothing on the left, icons sit flush right via the existing `justifyContent: 'space-between'`.

### Styles

- Add `paddingVertical: 8` to `container` — header height becomes ~56px (8 + 40 + 8)
- Remove unused styles: `titleContainer`, `icon`, `title`

### Imports and constants

- Remove `Image` from the `react-native` import (no longer used)
- Remove the `APP_VERSION` constant (declared but never rendered)

## What does not change

- Search mode layout (`containerSearchMode`) is unaffected
- All button logic, theme toggle, settings, search, download indicator — unchanged
- No other files need editing
