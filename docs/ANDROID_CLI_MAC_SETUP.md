# Android CLI Setup (Mac)

This guide gets the Android CLI running on your Mac so you can use `android docs`, `android skills`, and `android run` when developing Penny locally.

## Prerequisites

- macOS 12+
- Android Studio installed (for SDK)
- Node.js 18+ (already required by this project)
- EAS CLI: `npm install -g eas-cli`

## 1. Install Android CLI

Go to [developer.android.com/tools/agents](https://developer.android.com/tools/agents) and click **Download**.

The download is a `.dmg` or `.zip` containing the `android` binary. Move it to your PATH:

```bash
# If downloaded as a zip, unzip and move the binary
unzip android-cli-*.zip
sudo mv android /usr/local/bin/android
chmod +x /usr/local/bin/android

# Verify
android --version
```

## 2. Initialize for Agent Workflows

```bash
cd path/to/money-tracker
android init
```

This installs the `android-cli` skill into your project, enabling agent-aware prompts.

## 3. Load the R8 Skill

This project ships with a `SKILL.md` at the repo root that teaches agents how to handle R8, ProGuard, and Gradle memory configuration.

To also pull Google's official prebuilt skills:

```bash
android skills list          # see available skills
android skills add --skill r8-configuration    # if available
android skills add --skill agp-migration       # Android Gradle Plugin migration
android skills add --skill edge-to-edge        # useful for the tab bar
```

Your local `SKILL.md` is picked up automatically by any agent running in this directory — no install step needed.

## 4. Query the Android Knowledge Base

Instead of relying on potentially outdated LLM training data, use the knowledge base for current guidance:

```bash
# Query docs while developing
android docs query "expo sqlite drizzle orm"
android docs query "R8 minification expo managed workflow"
android docs query "react native new architecture android"
android docs query "EAS build memory github actions"
```

## 5. Emulator & Device Commands

```bash
android emulator list        # list available AVDs
android emulator start       # start default emulator
android run                  # build and deploy to connected device/emulator
```

> Note: `android run` triggers `expo prebuild` + Gradle build + install. Use it instead of the manual `npm run android` flow (which is also disabled per CLAUDE.md).

## 6. Keep the CLI Updated

```bash
android update               # pull latest CLI version and skills
```

Run this periodically — the CLI is in active preview (current: v0.7, April 2026).

## Workflow with Claude Code

Once installed, the Android CLI and `SKILL.md` work together with Claude Code:

1. Claude Code reads `SKILL.md` for R8/Gradle context automatically
2. You can ask: *"analyze the R8 configuration"* and Claude has the right grounding
3. Use `android docs` to pull current docs into a prompt:
   ```bash
   android docs query "expo config plugin withGradleProperties" | pbcopy
   # paste into your Claude Code session for grounded answers
   ```

## Troubleshooting

**`android: command not found`** → The binary isn't on your PATH. Check `/usr/local/bin` or add the install directory to `~/.zshrc`:
```bash
export PATH="$PATH:/path/to/android-cli"
```

**`android emulator` not working** → Requires `$ANDROID_HOME` set. Add to `~/.zshrc`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
```

**Download page shows "not supported"** → Use a desktop browser (Safari or Chrome on Mac), not a mobile browser or server environment.

## References

- [Android CLI overview](https://developer.android.com/tools/agents/android-cli)
- [Android Skills docs](https://developer.android.com/tools/agents/android-skills)
- [Android CLI release notes](https://developer.android.com/tools/agents/android-cli/release-notes)
- [Agent tools landing page](https://developer.android.com/tools/agents)
- Project R8 setup: `docs/R8_CICD_SETUP.md`
