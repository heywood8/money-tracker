# E2E Agent Design

**Date:** 2026-06-13
**Status:** Approved

## Summary

An autonomous Android e2e testing agent that runs locally against an emulator. Two modes: PR-review (scoped to changed code, posts findings as a PR comment) and Comprehensive (full app walk, terminal output + report file). Built on raw ADB + Claude vision — no external e2e framework in the initial phase.

---

## 1. Architecture

Five components in a Node.js CLI at `scripts/e2e-agent/`:

```
Context Gatherer
  └─▶ Test Plan Generator
        └─▶ Action Loop  (core)
              └─▶ Findings Collector
                    └─▶ Reporter
```

### File structure

```
scripts/e2e-agent/
  index.js                  # CLI entry point
  app-map.json              # file-pattern → feature mapping
  src/
    modes/
      pr-review.js
      comprehensive.js
    agent/
      loop.js               # core action loop
      planner.js            # test plan generation
      prompts.js            # Claude system prompts
    android/
      adb.js                # ADB wrapper
    reporting/
      pr-comment.js         # gh pr comment integration
      terminal.js           # console reporter
      markdown.js           # report file writer
    utils/
      screenshot.js         # capture + resize
      ui-tree.js            # UIAutomator XML → simplified JSON
```

### CLI

```bash
node scripts/e2e-agent --mode pr --pr 123
node scripts/e2e-agent --mode comprehensive

Options:
  --device <serial>    ADB device serial (default: first connected)
  --max-steps <n>      Max actions per scenario (default: 50)
```

---

## 2. Prerequisite: Database Seeder

Built before the agent. A **"Reset to Demo Data"** button in Settings → Developer Tools.

### Behavior

- Clears all operations, accounts, categories, budgets, planned operations
- Inserts a fixed, deterministic dataset built relative to `today`:
  - 3 accounts: Checking, Savings, Cash
  - ~15 categories covering common types
  - ~60 operations across the last 2 months (expenses, income, transfers)
  - 2–3 budgets
  - 1–2 planned operations
- Dates are computed as `today - N days` — the dataset always looks "live" regardless of when it runs

### Implementation

- `app/defaults/seedData.js` exports `generateSeedData(today: Date)` — all dates relative to the argument
- Button only visible behind `__DEV__` flag
- Button has `testID="seed-demo-data"` for ADB access without visual lookup
- The agent triggers it via the UIAutomator tree before each run

---

## 3. Action Loop

The core of the agent. Max **50 steps** per scenario; records "inconclusive" if limit hit.

### Each iteration

1. `adb shell screencap -p /sdcard/s.png` + pull → resize to **30% resolution** → base64
2. `adb shell uiautomator dump` + pull → parse XML → simplified JSON `{text, bounds, contentDesc, clickable}`
3. Send to Claude: system prompt + current scenario + conversation history + UI JSON + 30% image
4. Claude responds with a structured action:

```json
{ "action": "tap",   "bounds": [x1, y1, x2, y2] }
{ "action": "type",  "text": "..." }
{ "action": "swipe", "from": [x1,y1], "to": [x2,y2] }
{ "action": "back" }
{ "action": "done",  "result": "pass" }
{ "action": "done",  "result": "bug", "description": "..." }
```

5. Execute via ADB
6. Check `adb shell pidof com.heywood8.monkeep` — if missing, record crash as bug, relaunch, move to next scenario

### On bug capture

- Save **full-resolution** screenshot to `e2e-reports/screenshots/`
- Record plain-English description: what was expected, what happened, which screen
- Continue to next scenario

### System prompt seeds

- Package name: `com.heywood8.monkeep`
- The 5 tabs and their purpose
- What "normal" looks like per screen
- Known data from the seeder (account names, approximate operation counts)

---

## 4. PR-Review Mode

### Flow

1. `gh pr diff <number>` → raw diff
2. Match changed files against `app-map.json`:

```json
{
  "app/contexts/Operations*":     ["operations-list", "add-operation", "edit-operation"],
  "app/contexts/Accounts*":       ["accounts-list", "add-account", "transfer"],
  "app/screens/GraphsScreen*":    ["graphs"],
  "app/services/BackupRestore*":  ["backup", "restore"],
  "app/components/Calculator*":   ["add-operation", "edit-operation"]
}
```

3. Claude receives diff + mapping + full scenario list → produces prioritized subset to run (direct + adjacent risk)
4. Seed the database, run scoped scenarios via action loop
5. Post PR comment via `gh pr comment`

### PR comment format

```
## E2E Agent Report — PR #123

**Scenarios run:** 4 / 12 total (scoped to changed files)
**Result:** 1 failure, 3 passed

### ❌ Add Operation — FAILED
After filling in amount "150.00" and tapping Save, the app returned
to the operations list but the new operation did not appear. Expected
to see it at the top of the list. Reproduced consistently.

### ✅ Edit Operation — passed
### ✅ Operations search — passed
### ✅ Quick-add form — passed
```

- No image attachments — failures described in plain English only
- Exit code 1 if any failures

---

## 5. Comprehensive Mode

### Flow

1. Seed the database
2. Claude generates full scenario list from system prompt's app map:
   - Happy paths: add/edit/delete for each entity type
   - Edge cases: empty states, max-length inputs, zero amounts, same-account transfer
   - Navigation: all tabs reachable, back buttons work, modals dismiss
   - Data integrity: balance updates after operations, budget progress reflects spending
3. Execution order: data-mutation scenarios first, then read-only flows
4. Run all scenarios via action loop

### Output

Live terminal:
```
[e2e] Seeding database...
[e2e] Running 24 scenarios

✅ Add expense operation        (12 steps)
✅ Add income operation         (8 steps)
❌ Transfer between accounts    (23 steps) — see report
✅ Edit operation               (9 steps)
...

[e2e] Done: 21 passed, 1 failed, 2 inconclusive
[e2e] Report: e2e-reports/2026-06-13-14-32.md
```

Report file saved to `e2e-reports/YYYY-MM-DD-HH-MM.md` with full failure descriptions.

---

## 6. Out of Scope (Phase 1)

- CI/CD integration
- Maestro codification of discovered flows (Phase 2)
- Screenshot attachment in PR comments
- Physical device support (emulator only)
- iOS
