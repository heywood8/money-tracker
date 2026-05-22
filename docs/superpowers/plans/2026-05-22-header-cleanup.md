# Header Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the logo image and "Penny" text from the header, and slim the header height to fit only the icon buttons.

**Architecture:** Single-file change in `app/components/Header.js` — remove JSX, dead styles, dead imports, and dead constant. Three existing tests reference the removed elements and must be updated before the implementation change (TDD order).

**Tech Stack:** React Native, Jest, React Native Testing Library

---

### Task 1: Update tests that reference removed elements

**Files:**
- Modify: `__tests__/components/Header.test.js`

Three tests will break once the logo and title are removed:
- `renders without crashing` (line 84) — asserts `getByText('Penny')`
- `renders app title` (line 88) — asserts `getByText('Penny')`
- `renders app icon image` (line 109) — asserts `getByLabelText('Penny app icon')`

- [ ] **Step 1: Update `renders without crashing` — replace the Penny assertion**

In `__tests__/components/Header.test.js`, change the test at line 83–86:

```js
it('renders without crashing', () => {
  const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
  expect(getByTestId('settings-button')).toBeTruthy();
});
```

- [ ] **Step 2: Delete the `renders app title` test**

Remove lines 88–91 entirely:

```js
// DELETE this block:
it('renders app title', () => {
  const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
  expect(getByText('Penny')).toBeTruthy();
});
```

- [ ] **Step 3: Delete the `renders app icon image` test**

Remove lines 109–113 entirely:

```js
// DELETE this block:
it('renders app icon image', () => {
  const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
  expect(getByLabelText('Penny app icon')).toBeTruthy();
});
```

- [ ] **Step 4: Run the Header tests to confirm they now fail (implementation not yet changed)**

```bash
npm test -- --silent __tests__/components/Header.test.js
```

Expected: `renders without crashing` FAILS with "Unable to find an element by: [testId="settings-button"]" — wait, actually `settings-button` already exists in the current implementation, so this test will PASS. That's fine — it just means our updated test is compatible with both old and new code. The deleted tests are gone so they can't fail.

Actually the correct TDD check here: run the full Header test suite and confirm it passes with the test updates applied but before touching the implementation. This verifies we didn't break anything else.

```bash
npm test -- --silent __tests__/components/Header.test.js
```

Expected: All remaining tests PASS.

- [ ] **Step 5: Commit the test updates**

```bash
git add __tests__/components/Header.test.js
git commit -m "test: update Header tests for logo/title removal"
```

---

### Task 2: Implement the Header changes

**Files:**
- Modify: `app/components/Header.js`

- [ ] **Step 1: Remove the `Image` import and `APP_VERSION` constant**

In `app/components/Header.js`, change line 1 (`Image` is removed; `Text` stays because it's still used in the download indicator):

```js
// FROM:
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated } from 'react-native';

// TO:
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
```

Remove line 17:

```js
// DELETE:
const APP_VERSION = require('../../package.json').version;
```

- [ ] **Step 2: Remove the `titleContainer` JSX block**

In the non-search-mode branch (around line 102–110), remove the entire `titleContainer` View:

```jsx
// DELETE this block:
<View style={styles.titleContainer}>
  <Image
    source={require('../../assets/icon.png')}
    style={styles.icon}
    accessibilityLabel="Penny app icon"
  />
  <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
</View>
```

The non-search-mode branch should now contain only the `buttonContainer`:

```jsx
) : (
  <>
    <View style={styles.buttonContainer}>
      {rightContent || (
        <>
          {isDownloading && (
            // ... download indicator unchanged
          )}
          {activeScreen === 'Operations' && (
            // ... search button unchanged
          )}
          <TouchableOpacity
            // ... theme toggle unchanged
          />
          <TouchableOpacity
            // ... settings button unchanged
          />
        </>
      )}
    </View>
  </>
)}
```

- [ ] **Step 3: Add `paddingVertical: 8` to the container style and remove dead styles**

In the `StyleSheet.create` block, update `container` and remove `titleContainer`, `icon`, and `title`:

```js
const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 8,
  },
  containerSearchMode: {
    alignItems: 'stretch',
    flexDirection: 'column',
    paddingHorizontal: 0,
  },
  downloadIndicator: {
    alignItems: 'center',
    gap: 2,
  },
  downloadPercent: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  searchButton: {
    padding: 8,
  },
  searchButtonContainer: {
    position: 'relative',
  },
  settingsButton: {
    padding: 8,
  },
  themeButton: {
    padding: 8,
  },
});
```

Note: `justifyContent` changes from `'space-between'` to `'flex-end'` since there is no longer a left element to push against.

The final import line (set in Task 2 Step 1) should be:

```js
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
```

- [ ] **Step 4: Run the full Header test suite**

```bash
npm test -- --silent __tests__/components/Header.test.js __tests__/components/Header-rightContent.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Run the broader integration tests that touch Header**

```bash
npm test -- --silent __tests__/integration/HeaderSearchIntegration.test.js __tests__/integration/SearchLayout.test.js
```

Expected: All tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
npm test -- --silent
```

Expected: 0 failed tests.

- [ ] **Step 7: Commit the implementation**

```bash
git add app/components/Header.js
git commit -m "feat: remove logo and app name from header, slim header height"
```
