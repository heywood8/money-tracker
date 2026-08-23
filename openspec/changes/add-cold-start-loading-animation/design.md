# Design: Cold-start loading animation

## Context

`AppInitializer` currently returns `null` while `LocalizationContext.isLoading`
is true, deliberately, so the native splash stays up rather than flashing the
language-selection screen. That decision stands — this change only replaces the
blank render with a screen that continues the splash, and extends the window it
covers to include the first accounts/categories/operations reads.

## Decisions

### The screen is brand-dark, not themed

The loading screen paints `#001329` — the navy of the disc inside the app mark —
in both themes, and the native splash background is set to the same value. A
themed loading screen would have to know the resolved theme before
`ThemeConfigContext` has read it from storage, which is one of the very reads
being waited on. A fixed brand surface removes that ordering problem entirely.

The cost is real and accepted: a light-theme user dissolves from `#001329` to
`#f8f8f8`. That transition gets 200 ms rather than 120 ms so it reads as a
dissolve and not as a flash.

### The animation runs on the UI thread

The reason for the screen is that the JS thread is busy with SQLite reads. An
`Animated` timeline driven from JS would stutter exactly when those reads
resolve — the worst possible moment. The sequence is therefore built with
`react-native-reanimated` (already a dependency at 4.3.1) so it runs on the UI
thread and is unaffected by JS-thread work.

### "Cold start" is a module-level flag, not state

A `let hasPlayed = false` at module scope in `ColdStartScreen.js`, flipped the
first time the screen mounts. Component state or a ref would replay the
animation on every remount; `AppState` transitions and tab switches must not
retrigger it. The flag lives for the lifetime of the JS runtime, which is
exactly the definition of "this launch".

### Readiness is the conjunction of the existing loading flags

`LocalizationContext.isLoading`, `AccountsDataContext.loading`,
`CategoriesContext.loading` and `OperationsDataContext.loading` already exist and
already start `true`. Readiness is their conjunction; no new signal, no timer, no
artificial minimum wait beyond the truncation rules in the spec.

### Splash configuration

The top-level `splash` key with `resizeMode: 'contain'` scales the icon to the
screen width, so the mark on the splash and the mark on the loading screen are
different sizes and the seam is visible. The `expo-splash-screen` config plugin
pins it:

```json
["expo-splash-screen", {
  "image": "./assets/splash-icon.png",
  "imageWidth": 200,
  "backgroundColor": "#001329"
}]
```

One background for both themes means no `dark` block and no change to
`userInterfaceStyle`.

### Layout

The mark and the stack never overlap: coins appear below the mark's lower edge
and fall a short distance into the stack, so the mark is never partly covered in
any frame. The mark is absolutely centred and the stack is positioned against it
rather than laid out in flow, so the stack cannot shift the mark off the position
the splash left it in.

## Risks

- **Reduced motion.** `AccessibilityInfo.isReduceMotionEnabled()` is async; it is
  read once at module load so the first frame already knows the answer. If it has
  not resolved, the animated path is used — the safer default, since the static
  path is the fallback and not the other way round.
- **Very slow devices.** If the reads take longer than 1600 ms the stack simply
  stands there. The spec adds a caption at that point rather than looping the
  animation, which would read as a progress bar that does not progress.
