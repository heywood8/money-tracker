# Penny E2E Agent

Autonomous Android UI tester for Penny. It drives the app over ADB and uses
Claude vision to decide each tap/type/swipe, detecting crashes and behavioural
bugs as it walks through scenarios.

## How it authenticates — your Claude subscription, no API key

This agent calls Claude through the **local Claude Code CLI** (`claude -p`),
which uses the subscription you're already signed into. There is **no
`ANTHROPIC_API_KEY` and no metered API billing** — calls draw on your Claude
Pro/Max plan instead.

Each step sends the current screen to Claude: the screenshot is written to
`e2e-reports/.frames/` and Claude views it with its built-in `Read` tool (the
CLI has no direct image flag), alongside a JSON dump of the on-screen elements.

> **Heads up on quota.** Every step is one `claude -p` invocation, and a run is
> up to `maxSteps` (default 50) per scenario. A full comprehensive run is
> hundreds of vision calls drawing on the *same* allowance as your interactive
> Claude Code usage, so a large run can temporarily eat into your quota. Start
> with `--max-steps` low and a single scenario while you try it out.

## Prerequisites

- **Claude Code** installed and signed in: run `claude`, then `/login`, and
  pick your subscription. Verify with `claude --version`.
- **Node.js 20+**.
- **ADB** on `PATH` with an Android emulator or device connected
  (`adb devices`) that has a **dev build of Penny** installed (the
  "Reset to Demo Data" button under Settings › Developer Tools seeds test data).
- **`gh` CLI** (only for `--mode pr`, to fetch the PR diff).

## Install

```bash
npm install --prefix scripts/e2e-agent
# or, from inside the folder:
cd scripts/e2e-agent && npm install
```

## Usage

```bash
# Walk all scenarios; writes a markdown report to e2e-reports/
node scripts/e2e-agent --mode comprehensive

# Review a PR: run only scenarios affected by its diff, post a PR comment
node scripts/e2e-agent --mode pr --pr 123

# Useful flags
node scripts/e2e-agent --mode comprehensive --max-steps 15 --device emulator-5554
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--mode <pr\|comprehensive>` | Which run mode (required) | — |
| `--pr <number>` | PR number (required for `--mode pr`) | — |
| `--device <serial>` | ADB device serial | first connected |
| `--max-steps <n>` | Max actions per scenario | `50` |

### Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `E2E_CLAUDE_MODEL` | Model alias passed to `claude --model` | `opus` |

## Tests

```bash
cd scripts/e2e-agent && npm test
```

These run under the sub-project's own jest config (native ESM via
`node --experimental-vm-modules`); they are intentionally excluded from the
root app test suite.
