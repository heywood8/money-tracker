# Proposal: Cold-start loading animation

## Why

On a cold start the app has nothing in memory: the language preference, accounts,
categories and the first page of operations are all read from SQLite before the
first useful frame can be drawn. Today `AppInitializer` renders `null` for that
whole window, so the user stares at the frozen native splash and then the app
appears with no transition at all. The gap is short — roughly half a second on a
warm device — but it is the first thing anyone sees, and right now it says
nothing about what the app is for.

## What Changes

- A cold-start loading screen that continues the native splash instead of
  replacing it: the Penny mark stays at the same size and position, spins once,
  and three coins drop into a stack below it — money accumulating, which is
  what the app is about.
- The whole sequence is 560 ms and is bounded by the data, not by a timer: it
  never starts if the reads finish inside the first 60 ms, and it truncates
  gracefully when they finish mid-sequence.
- It runs on the first launch of the process only. Returning from the background,
  switching tabs and every later read show no animation at all.
- The screen is brand-dark (`#001329`) whatever theme the app is in, so the
  native splash and the loading screen are one continuous surface.
- The native splash moves from the deprecated top-level `splash` key to the
  `expo-splash-screen` config plugin, so the icon size can be pinned to the size
  the loading screen draws and the background can match it.
- Motion durations become tokens in `app/styles/designTokens.js` rather than
  numbers spread through a component.

## Capabilities

### New Capabilities

- `app-startup`: what the user sees between process launch and the first
  interactive frame.

## Impact

- `app/components/startup/ColdStartScreen.js` (new): the animated screen.
- `app/screens/AppInitializer.js`: renders the screen while the first reads are
  in flight instead of returning `null`; owns the once-per-process flag.
- `app/styles/designTokens.js`: adds the cold-start duration tokens.
- `app.config.js`: replaces the `splash` key with the `expo-splash-screen`
  plugin (`imageWidth: 200`, `backgroundColor: '#001329'`).
- `__tests__/components/ColdStartScreen.test.js` (new),
  `__tests__/screens/AppInitializer.test.js` (new/updated).

No database, schema or migration changes. No user-facing setting is added.
