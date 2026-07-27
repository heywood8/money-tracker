# Issue #861 — rewrite navigation to @react-navigation/native-stack

Analysis date: 2026-07-27 · analysed against `main` @ 772159b (penny 0.241.0)

## TL;DR

**Recommendation: do not do the full rewrite. Close #861 as obsolete and open a narrow
follow-up for the real debt it accidentally identified (the 2258-line `SettingsScreen`).**

The issue was filed on 2026-05-31, the same day PR #860 landed the "nuclear option"
workaround (rip gesture-handler out of settings). Its premise — *GestureDetector makes
subpanel content untouchable on Android 16* — no longer holds: gesture-handler is back in
`SettingsScreen` (`useSwipeDismiss`, PR #1005/#1009) and has been shipping for ~2 months
without a single follow-up bug report. Two of the three headline benefits do not survive
contact with the current docs, and the cost is ~5.8k lines of source + ~3k lines of tests.

## 1. What changed since the issue was filed

| Issue claim | Reality on 2026-07-27 |
|---|---|
| "GestureDetector makes subpanel content untouchable on Android 16" | Gesture-handler was reinstated in `SettingsScreen` via `app/hooks/useSwipeDismiss.js` (#1005, #1009, #1323). No open bug. `docs/`, `CHANGELOG.md` and the issue tracker contain zero Android-16 touch reports since. |
| "SettingsModal.js (1500+ lines) splits into ~8 screens" | The file is now `app/screens/SettingsScreen.js` at **2258 lines** with **10** subpanels plus nested steps (`importStep`, `exportStep`, `notificationView`, embedded Accounts/Categories back-state). The debt grew, it did not stand still. |
| "SimpleTabs.js gets replaced entirely" | `SimpleTabs.js` is 791 lines and has been actively invested in since: #1001 (keep screens mounted), #1053, #1255, #1322, #1327, #1377 (deferred background mount), #1459 + #1468 (unified spring physics, velocity carry, reduced-motion). |

Issue #861 is the only open issue in the repo, so it has effectively been sitting as a
"someday" ticket while the codebase moved the other way.

## 2. Benefit-by-benefit audit

Verified against current React Navigation docs (context7 `/websites/reactnavigation`) and
`react-native-screens` docs (`/discord/react-native-screens`).

| Claimed benefit | Verdict |
|---|---|
| "Android 16 predictive back compatible out of the box" | **False.** React Navigation's own getting-started page says: *"React Navigation does not yet support Android's predictive back gesture… disable predictive back by setting `android:enableOnBackInvokedCallback="false"`."* Separately, Penny already has it disabled — `@expo/config-plugins/build/android/PredictiveBackGesture.js` writes `false` unless `android.predictiveBackGestureEnabled` is set, and `app.config.js` does not set it. Predictive back is not enabled today and the migration would not enable it. |
| "Proper touch isolation between screens (native screen layers)" | **Partly true**, but solves a problem that no longer reproduces. |
| "Battle-tested on all Android versions" | True, but so is the current code after 40+ PRs of hardening. |
| "Deep linking for free" | True but low value: the one deep-link-ish flow (notification tap → Settings → notification-processing panel) already works through `appEvents` / `EVENTS.OPEN_NOTIFICATION_PROCESSING`. |
| "Proper lifecycle (screens unmount when not visible, reducing memory)" | **Directly contradicts a deliberate design decision.** #1001 ("keep all tab screens mounted to stop blank screens on swipe") exists because unmounting broke the swipe strip. `detachInactiveScreens` defaults to `true` in bottom-tabs, so adopting it re-introduces the exact bug that was fixed. And per the perf skill's own rule — *measure first* — there is no memory measurement on record justifying the change. |

## 3. What the rewrite would break

Functionality that exists today and has no drop-in equivalent in `@react-navigation/bottom-tabs`:

1. **Horizontal swipe between tabs** — bottom-tabs supports only `animation: 'fade' | 'shift' | 'none'`. There is no swipe. Swipe lives in `material-top-tabs` (react-native-tab-view / `react-native-pager-view`), not in bottom-tabs. The issue's proposal silently deletes the app's primary navigation gesture.
2. **Rubber-band overscroll past the first/last tab** (`clampWithRubberband`, `SimpleTabs.js:472`) and **velocity carry into the settle spring** (#1459) — a `ViewPager2`-backed pager has its own fixed physics.
3. **`blocksExternalGesture` composition** — `DescriptionSuggestionRow.js:23` blocks the tab pan gesture so horizontal label chips scroll instead of paging. That composition requires a real gesture-handler `Gesture` object exposed via `SwipeNavigationContext`; a pager does not give you one.
4. **Non-adjacent tab transitions** — the worklet reposition trick (`SimpleTabs.js:361-401`) that makes Operations→Settings feel identical to a single-step move.
5. **Floating pill tab bar** — pill spring, 3-tier width (`floatingBarWide` / `ExtraWide`), the 20-step background-tinted gradient fade, and the elevation ordering that lets the gradient render above the settings subpanel while still letting taps through. All portable to a custom `tabBar`, but it is a re-implementation, not a config flag.
6. **Update-progress icon replacing the Settings cog** while an APK downloads.
7. **Deferred background mount** (#1377) — cold-start optimisation tied to the "everything stays mounted" model.
8. **Subpanel pattern mandated by CLAUDE.md** — "never open a new modal for secondary views inside an existing modal" is the project's stated convention; native-stack screens are a different model and would require rewriting that convention.

Impacted code: `SimpleTabs.js` (791) + `SettingsScreen.js` (2258) + `useSwipeDismiss.js` (161) +
`SwipeNavigationContext.js` (14) + touch points in `AccountsScreen.js` (1770, embedded mode)
and `CategoriesScreen.js` (780). Tests: `SimpleTabs.test.js` (1799 lines / 93 cases),
`SettingsScreen.test.js` (994 / 45), `useSwipeDismiss.test.js` (182), plus new
`jest.setup.js` mocks for the navigation container.

## 4. Options

### A. Do nothing (recommended)
Close #861. Cost: 0. The problem it was filed against is fixed; the benefits are
overstated or already unavailable.

### B. Narrow refactor: decompose `SettingsScreen` without a navigation library
The genuinely defensible part of #861. Extract each subpanel into its own component under
`app/components/settings/`, and replace the ad-hoc `activeSubPanel` + `importStep` +
`exportStep` + `notificationView` + `embeddedCanGoBack` state with one small stack reducer
(`push` / `pop` / `replace`), keeping `useSwipeDismiss` and the existing animation contract.
No new native dependency, no OTA risk, tests can migrate file by file.
Estimated: 3–5 PRs, mechanical, each independently shippable and testable.

### C. Hybrid: keep the swipe strip, put a native-stack inside the Settings slot
Solves the same debt as B but introduces `react-native-screens`. New gesture conflict to
manage: the strip's `Gesture.Pan` (currently gated by `.enabled(!subPanelActive)`) vs the
stack's own back gesture. Buys native screen layers for settings only. Cost of B plus the
native dependency and its risks — poor trade.

### D. Full migration as written in #861
Requires `material-top-tabs` + `react-native-pager-view` (not `bottom-tabs`) to preserve
swipe, which means the issue's own proposal has to be rewritten before it can start.
Then all eight items in §3 must be rebuilt or consciously dropped, ~2 900 lines of tests
rewritten, and section 5's risks accepted. Estimated 4–8 weeks of evenings for a
feature-neutral outcome. Not worth it.

## 5. Risks if it is done anyway

1. **OTA / native mismatch (highest, unmentioned in the issue).**
   `.github/workflows/eas-build-android.yml:60` runs `eas update --platform android --non-interactive --auto` on every push to `main`, and `app.config.js` pins `runtimeVersion.policy: 'sdkVersion'`. Adding `react-native-screens` adds a native module **without changing the runtime version**, so the OTA bundle would be delivered to installed APKs that lack it → hard crash on launch (`RNSScreen` not found). Mitigation is mandatory: switch to `runtimeVersion.policy: 'fingerprint'` (or bump manually) **before** the migration PR merges.
2. **UX regression** on the swipe strip — the app's most-used interaction, tuned across #1053/#1327/#1459/#1468.
3. **Test blast radius** — 138 direct test cases, ~3k lines; CLAUDE.md forbids merging with a red suite, so the PR is all-or-nothing and cannot be split trivially.
4. **Google Play 16 KB page alignment** — any new native dependency must be verified aligned. `react-native-screens` 4.25.2 is the version bundled by Expo SDK 56 (`node_modules/expo/bundledNativeModules.json`), so this is expected to be fine, but it needs an explicit check on a production build.
5. **Release cadence** — the repo ships via release-please on nearly every merge. A multi-week branch fights that model and accumulates conflicts against an actively-edited `SettingsScreen`.
6. **No measured baseline** — the perf skill's rule is measure → optimise → re-measure. There is no TTI or memory number on record for the current navigation, so any perf claim after the migration would be unfalsifiable.

## 6. Compatibility notes (if someone revisits this later)

- Expo SDK 56 bundles `react-native-screens@4.25.2`, `react-native-pager-view@8.0.1`, `react-native-safe-area-context@~5.7.0` — all present in `bundledNativeModules.json`, so `npx expo install` resolves cleanly.
- `react-native-screens` v4 supports **only** `@react-navigation/native-stack` v7 (per its README). Current npm latest: `@react-navigation/native@7.3.14`, `native-stack@7.18.6`, `bottom-tabs@7.18.14`, `material-top-tabs@7.6.13`.
- `material-top-tabs` supports `tabBarPosition: 'bottom'` and a custom `tabBar` — the only React Navigation path that keeps swipe navigation.
- New Architecture is on (`newArchEnabled: true`, required by reanimated 4.x / worklets), which all of the above support.

## Appendix — commands used

```bash
gh issue list --state open --limit 50
gh issue view 861
gh pr view 860
git log --oneline --since=2026-05-25 -- app/navigation/SimpleTabs.js app/screens/SettingsScreen.js
grep -rln "GestureDetector\|Gesture\." app/
grep -rn "blocksExternalGesture" app/
node -e "require('./node_modules/expo/bundledNativeModules.json')"   # SDK 56 pinned versions
npm view react-native-screens version                                # 4.26.2 latest, 4.25.2 pinned
sed -n '25,60p' node_modules/@expo/config-plugins/build/android/PredictiveBackGesture.js
sed -n '40,75p' .github/workflows/eas-build-android.yml              # eas update --auto on main
```

Docs consulted via context7: `/websites/reactnavigation` (bottom-tabs animations,
predictive-back opt-out, `detachInactiveScreens`, material-top-tabs `tabBarPosition`),
`/discord/react-native-screens` (v4 ↔ native-stack v7 support matrix).
