# /verify-pr [N]

Verify a pull request against the Penny app running on a connected Android device.
Runs a mix of baseline scenarios (matched from the diff) and PR-specific scenarios brainstormed
from the PR body, then optionally posts the results as a GitHub PR comment.

**Argument:** PR number. If `$ARGUMENTS` is empty, ask the user for it before proceeding.

---

## Step 1 — Resolve the PR

```
gh pr view $ARGUMENTS --json number,title,body,headRefName,baseRefName
```

Store the title and body for brainstorming in Step 4.

Then get the diff:

```
gh pr diff $ARGUMENTS
```

Parse the changed file paths from lines matching `^diff --git a/(.+) b/`.

---

## Step 2 — Load scenario data

Read both files from the repo:
- `scripts/e2e/app-map.json` — maps file glob patterns to arrays of scenario IDs
- `scripts/e2e/scenarios.json` — full scenario objects `{id, name, description}`

**Pattern matching rule:** a file path matches a pattern if the path starts with the pattern
after replacing `*` with `.*` (glob-style prefix match). This is the same logic as in
`scripts/e2e-agent/src/agent/planner.js → matchDiffToScenarios`.

Collect the union of all matched scenario IDs, then resolve them to full scenario objects
from `scenarios.json`. Call this the **baseline set**.

---

## Step 3 — Brainstorm PR-specific scenarios (hybrid)

Read the PR title and body. Based on what the PR changes (not already in the baseline set),
synthesize **1–3 additional scenarios** that specifically target the PR's stated behaviour.

Format each as:
```json
{ "id": "pr-specific-N", "name": "...", "description": "..." }
```

These are ephemeral — they do not need to exist in `scenarios.json`.

Merge with the baseline set (PR-specific go last). Deduplicate by `id`.

---

## Step 4 — Confirm scenario list

Count the combined scenarios.

**If > 5:** Use AskUserQuestion to present the full list and ask which to keep.
Options: "Run all (N)", "Run baseline only (M)", "Let me choose" (multiSelect of names).
Wait for the user's answer before proceeding.

If ≤ 5, proceed without confirmation.

---

## Step 5 — Preflight checks

Run these two checks. Fail loudly if either fails.

**Check 1 — ADB device connected:**
```
adb devices
```
Parse output. If no device is listed (beyond the header line), stop and tell the user
to connect a device or start an emulator. Do not dispatch subagents.

**Check 2 — App is running:**
```
adb -s $DEVICE shell pidof com.heywood8.monkeep
```
Where `$DEVICE` is the device serial from Check 1 (e.g. `emulator-5554` or the USB serial).
If the command returns empty output (non-zero exit or blank), stop and tell the user to
launch Penny on the device first. Do not dispatch subagents.

---

## Step 6 — Run scenarios via e2e-verifier subagent

For **each** scenario in the confirmed list, dispatch the `e2e-verifier` subagent
**sequentially** (one at a time — do not run in parallel, as they share the device screen).

Pass this exact block in the subagent prompt:

```
DEVICE: <device-serial>
SCENARIO_ID: <id>
SCENARIO_NAME: <name>
SCENARIO_DESCRIPTION: <description>
```

Collect the structured output block from each subagent:
```
VERDICT: PASS | BUG | INCONCLUSIVE
SCENARIO: <id>
STEPS_TAKEN: <n>
EVIDENCE: <...>
BUG_DETAIL: <...>   (only if BUG)
```

---

## Step 7 — Assemble the PR comment

Format a markdown comment:

```markdown
## E2E Verification — PR #N: <title>

Verified against `com.heywood8.monkeep` on device `<serial>`.

| Scenario | Result | Evidence |
|----------|--------|----------|
| <name> | ✅ PASS / ❌ BUG / ⚠️ INCONCLUSIVE | <evidence> |
...

<details><summary>Bug details</summary>

**<scenario-name>:** <BUG_DETAIL>

</details>

<!-- omit the <details> block if no BUGs -->

_Scenarios matched from diff: <baseline-ids>_
_PR-specific scenarios: <pr-specific-ids or "none">_
_Seeder note: for reproducible results, use a `__DEV__` build with the seed-data button to pre-populate the DB before running these scenarios._
```

Use ✅ for PASS, ❌ for BUG, ⚠️ for INCONCLUSIVE.

---

## Step 8 — Approve and post

Show the formatted comment to the user.

Use AskUserQuestion with two options:
- **"Post comment"** — posts to the PR
- **"Skip"** — discard

If the user chooses "Post comment":

Write the comment body to `/tmp/verify-pr-comment.md`, then:
```
gh pr comment $ARGUMENTS --body-file /tmp/verify-pr-comment.md
```

Confirm with the URL returned by gh.
