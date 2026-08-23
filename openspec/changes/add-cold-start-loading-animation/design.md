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

### The whole timeline runs on the UI thread

The reason for the screen is that the JS thread is busy with SQLite reads. An
`Animated` timeline driven from JS would stutter exactly when those reads
resolve — the worst possible moment. The sequence is therefore built with
`react-native-reanimated` (already a dependency at 4.3.1).

That covers the animations, but not the *schedule*: a hold, a stagger and a
threshold expressed as `setTimeout` would collapse the moment the JS thread
blocked, which is the very case this screen exists for. So the entire timeline —
hold, turn, each coin's start, the slow-path caption — is handed to the UI
thread at mount as delayed animations (`withDelay`). Nothing about the motion
waits on JS.

JS timers survive in one place only: the wind-down after the data has landed. By
then the reads are done and the thread is free.

### The wind-down is a pure function

Deciding what happens when the data arrives mid-sequence — which coins are
cancelled, how far the mark still has to turn, how long the screen must wait
before it may leave — is the subtle part. It lives in `planWindDown(angle,
coins)`, a pure function taking the live values and returning a plan, so it can
be checked against real numbers instead of through mocked animations.

### The theme may not be known yet

`ThemeConfigContext` starts at `'system'` and reports the *device's* scheme
until the stored preference has been read, so a Light-theme user on a dark
device would briefly look like a dark-theme user. The context now exposes
`isThemeLoaded`, and the screen takes the longer, always-safe cross-fade until
that is true.

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

- **Reduced motion.** Read through Reanimated's `useReducedMotion()`, which
  reports the setting as it was at app start and returns it synchronously — so
  the first frame already knows which path it is on, with no async read to race
  against. `AccessibilityInfo.isReduceMotionEnabled()` is a promise and would
  resolve after the first frames had already moved.
- **Very slow devices.** If the reads take longer than 1600 ms the stack simply
  stands there. The spec adds a caption at that point rather than looping the
  animation, which would read as a progress bar that does not progress.
