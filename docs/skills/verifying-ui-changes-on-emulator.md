---
name: verifying-ui-changes-on-emulator
description: Use Android emulator via adb to verify UI and functional changes after implementing features
---

# Verifying UI Changes on Emulator

After implementing UI changes or new features, verify them on the Android emulator using adb commands. This skill covers how to interact with the running emulator to test functionality without manual clicking.

## Prerequisites

- Android emulator must be running (user manages this locally)
- Never run `npm start`, `npm run android`, or similar commands (user manages dev server)
- adb must be available in PATH

## Workflow

### 1. Check Emulator Status

```bash
adb devices
```

Expected output shows one device in `device` state:
```
List of devices attached
emulator-5554	device
```

If no devices, the emulator is not running. Wait for user to start it.

### 2. Get Screen Dimensions

```bash
adb shell wm size
```

Example output: `Physical size: 1440x3120`

Use these dimensions to calculate tap coordinates.

### 3. Interact with UI Elements

**Tapping elements:**

```bash
adb shell input tap <x> <y>
```

Example coordinates (for 1440x3120 screen):
- Search button in header: `adb shell input tap 976 228`
- Close button: `adb shell input tap 50 228`

**Typing text:**

```bash
adb shell input text "search_query"
```

Notes:
- Use underscores or escape spaces (adb doesn't handle spaces well)
- Use quotes around text with special characters
- For actual spaces, use `%s`: `adb shell input text "coffee%sshop"`

**Pressing keys:**

```bash
adb shell input keyevent KEYCODE_BACK    # Back button
adb shell input keyevent KEYCODE_ENTER   # Enter key
adb shell input keyevent KEYCODE_DEL     # Delete/backspace
```

### 4. Verification Steps

After each interaction, verify:

1. **Visual state**: Describe what you observe (e.g., "search overlay appeared")
2. **Text persistence**: Type text, wait, verify it doesn't disappear
3. **Filter behavior**: Apply filters, verify operations list updates
4. **No crashes**: Check logs for errors (user may share if needed)
5. **Expected count**: Verify number of results matches expectations

### 5. Common Test Scenarios

**Search flow:**
```bash
# 1. Get screen size
adb shell wm size

# 2. Tap search button (adjust coordinates for your screen)
adb shell input tap 976 228

# 3. Type search query
adb shell input text "coffee"

# 4. Wait for debounce (300ms)
# Verify text persists in search bar

# 5. Verify filtered results appear
# Describe what you see in the operations list
```

**Filter toggle:**
```bash
# 1. Open search
adb shell input tap 976 228

# 2. Tap filters toggle (adjust coordinates)
adb shell input tap 720 350

# 3. Verify expandable filters appear
```

**Close and reopen:**
```bash
# 1. Close search overlay
adb shell input tap 50 228

# 2. Reopen search
adb shell input tap 976 228

# 3. Verify previous search text is preserved (if filters were active)
```

## Finding Tap Coordinates

### Method 1: Enable Pointer Location (Recommended)

```bash
# Enable pointer location overlay
adb shell settings put system pointer_location 1

# Now tap where you want coordinates
# Read coordinates from overlay at top of screen

# Disable when done
adb shell settings put system pointer_location 0
```

### Method 2: Calculate from Layout

For elements with known positions:
- Header height: ~80-100px
- Right-aligned icons: screen_width - 50-100px
- Use testID in code to identify element positions

### Method 3: Screenshot + Measure

```bash
# Take screenshot
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png .

# Open in image viewer and measure coordinates
```

## Common Pitfalls

**Avoid:**
- Tapping too fast (wait for animations ~500ms between taps)
- Using spaces in text input (use underscores or %s)
- Assuming coordinates across different screen sizes
- Forgetting to check screen size first

**Always:**
- Get screen dimensions before calculating coordinates
- Wait for debounce timeouts (300ms for search text)
- Verify visual state after each interaction
- Test both opening and closing flows
- Check that text persists across component remounts

## Example: Search Redesign Verification

```bash
# Step 1: Check emulator is running
adb devices

# Step 2: Get screen size
adb shell wm size
# Output: Physical size: 1440x3120

# Step 3: Open search (search button at top-right)
# For 1440x3120: x ≈ screen_width - 100, y ≈ header_height/2
adb shell input tap 976 228

# Step 4: Type search query
adb shell input text "coffee"

# Step 5: Observe results
# - Search bar shows "coffee"
# - Operations list filters to matching items
# - Count shows correct number of results

# Step 6: Verify text persistence
# - Text should remain visible
# - Should not float out or disappear
# - No infinite loading loops

# Step 7: Try type search
adb shell input text "Transfer"
# - Should match all transfer operations
# - Type field is now searchable

# Step 8: Close search
adb shell input tap 50 228
# - If filters active: alert appears
# - If no filters: closes immediately
```

## Integration with Testing

After manual verification via emulator:

1. **Run automated tests**: `npm test -- --silent`
2. **Check all tests pass**: Verify 0 failures
3. **Commit changes**: Only commit when both manual and automated tests pass

## When to Use This Skill

- After implementing new UI components
- When fixing interaction bugs (infinite loops, text disappearing, etc.)
- Before creating a PR for UI changes
- When user reports UI issues that need reproduction
- To verify animations and transitions work correctly

## Reporting Results

When reporting verification results to user, include:

1. **Commands used**: Exact adb commands executed
2. **Observations**: What you saw on screen
3. **Expected vs actual**: Did behavior match expectations?
4. **Any issues**: Crashes, errors, unexpected behavior
5. **Verification status**: ✅ Verified working / ❌ Issues found

Example:
```
Verified search functionality on Android emulator:

Commands:
- adb shell input tap 976 228 (opened search)
- adb shell input text "coffee" (typed query)

Observations:
- Search overlay appeared immediately
- Text "coffee" visible in search bar
- Operations list filtered to 0 matching items
- Text persisted (no disappearing)
- No infinite loop or reloading

Status: ✅ All behaviors working as expected
```
