# Tasks

## 1. Tokens and splash configuration
- [ ] 1.1 Add cold-start durations to `DURATION` in `app/styles/designTokens.js` (hold 60, spin 300, coin fall 150, coin stagger 70, dissolve 120, dissolve-to-light 200, caption threshold 1600, caption fade 200)
- [ ] 1.2 Replace the top-level `splash` key in `app.config.js` with the `expo-splash-screen` plugin (`imageWidth: 200`, `backgroundColor: '#001329'`)
- [ ] 1.3 Verify on a device that the splash mark and the loading-screen mark are the same size and position

## 2. ColdStartScreen component
- [ ] 2.1 Create `app/components/startup/ColdStartScreen.js` with the brand-dark surface and the centred 200 dp mark
- [ ] 2.2 Add the coin stack below the mark, positioned so the two never overlap in any frame
- [ ] 2.3 Build the Reanimated timeline: hold, single rotation, three staggered coin drops with landing squash, dissolve
- [ ] 2.4 Implement the module-level once-per-process flag
- [ ] 2.5 Implement truncation: skip coins that have not appeared, let falling coins land, finish the current half-turn before dissolving
- [ ] 2.6 Implement the 1600 ms caption using an existing `i18n` key
- [ ] 2.7 Implement the reduced-motion path (static mark and full stack, dissolve only)

## 3. Wiring
- [ ] 3.1 Consume `loading` from the accounts, categories and operations contexts plus `isLoading` from localization in `AppInitializer`
- [ ] 3.2 Render `ColdStartScreen` instead of `null` while those are pending on the first launch
- [ ] 3.3 Confirm no animation on background return, tab switch or any later read

## 4. Tests
- [ ] 4.1 Component tests: renders on first mount, does not animate on a second mount, reduced-motion path, caption after the threshold
- [ ] 4.2 `AppInitializer` tests: screen shows while any first read is pending and unmounts once all resolve
- [ ] 4.3 Regression test: reads resolving inside the hold window produce no animated frame

## 5. Ship
- [ ] 5.1 `npx eslint . --ext .js,.jsx,.ts,.tsx --max-warnings 0` clean
- [ ] 5.2 `npx jest --testPathIgnorePatterns=/node_modules/` green
- [ ] 5.3 Code review, then PR, then CI green
