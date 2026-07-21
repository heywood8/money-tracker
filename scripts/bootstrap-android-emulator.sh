#!/usr/bin/env bash
#
# bootstrap-android-emulator.sh
#
# PLATFORM: Linux only (tested on Ubuntu 24.04, x86_64 with KVM).
# Relies on /dev/kvm, apt-get, usermod, swapfile and the Linux Android SDK
# tarballs. It will NOT work on macOS or Windows.
#
# Provisions a headless Android emulator for E2E testing (/verify-pr,
# e2e-verifier) on this host.
#
# Do NOT run the whole file via `bash file`. Run it step by step (STEP 1..7)
# and check the output. sudo blocks are marked. The script is idempotent, so
# it is safe to re-run.
#
set -euo pipefail

# ---- config (tweak as needed) ---------------------------------------------
ANDROID_API="${ANDROID_API:-34}"                 # platform / system-image API level
SYS_IMG="system-images;android-${ANDROID_API};google_apis;x86_64"
AVD_NAME="${AVD_NAME:-penny_test}"
AVD_DEVICE="${AVD_DEVICE:-pixel_5}"
SDK_ROOT="${ANDROID_HOME:-$HOME/Android/Sdk}"
# cmdline-tools: the build number changes over time, grab the latest from
# https://developer.android.com/studio#command-line-tools-only
CMDLINE_ZIP_URL="${CMDLINE_ZIP_URL:-https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip}"
# ----------------------------------------------------------------------------

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# Put the SDK CLIs on PATH for THIS process. step5_env's exports only live in the
# script's own process, so a single-step invocation of step4/6/7 must re-add the
# paths itself - otherwise sdkmanager/adb/emulator resolve to "command not found".
_ensure_env() {
  export ANDROID_HOME="$SDK_ROOT"
  export ANDROID_SDK_ROOT="$SDK_ROOT"
  case ":$PATH:" in
    *":$SDK_ROOT/platform-tools:"*) ;;  # already on PATH
    *) export PATH="$SDK_ROOT/cmdline-tools/latest/bin:$SDK_ROOT/platform-tools:$SDK_ROOT/emulator:$PATH" ;;
  esac
}

# apt packages required for a headless emulator (JDK 17 + runtime libs).
APT_PKGS="openjdk-17-jdk-headless unzip curl \
libpulse0 libgl1 libx11-6 libxcb1 libxdamage1 libnss3 libxcomposite1 libxcursor1 libxi6"

# ============================================================================
# STEP 1 - access to /dev/kvm (needs sudo, then RELOGIN or `newgrp kvm`)
# ============================================================================
step1_kvm() {
  say "STEP 1: kvm group"
  if id -nG "$USER" | grep -qw kvm; then
    echo "already in kvm group - ok"
  else
    sudo usermod -aG kvm "$USER"
    echo ">>> added to kvm. RELOGIN (or run 'newgrp kvm') and continue."
    echo ">>> verify after relogin:  test -w /dev/kvm && echo KVM-writable"
  fi
}

# ============================================================================
# STEP 2 - JDK 17 + system libs for a headless emulator (sudo)
# ============================================================================
step2_apt() {
  say "STEP 2: apt packages (JDK 17 + libs)"
  # Idempotency: skip the (slow) index refresh + install when everything is
  # already present. `dpkg -s` exits non-zero if any package is missing.
  if dpkg -s $APT_PKGS >/dev/null 2>&1; then
    echo "all apt packages already installed - ok"
  else
    sudo apt-get update
    sudo apt-get install -y $APT_PKGS
  fi
  java -version
}

# ============================================================================
# STEP 3 - 4G swap (this host: 7.8G RAM, swap=0 -> OOM is almost guaranteed)
# ============================================================================
step3_swap() {
  say "STEP 3: 4G swapfile"
  if swapon --show | grep -q '/swapfile'; then
    echo "swapfile already active - ok"
  else
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    # persist across reboots:
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
  free -h
}

# ============================================================================
# STEP 4 - cmdline-tools (no sudo, installs under $HOME)
# ============================================================================
step4_cmdline_tools() {
  say "STEP 4: Android cmdline-tools -> $SDK_ROOT"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  if [ -x "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo "cmdline-tools already installed - ok"
    return
  fi
  tmp="$(mktemp -d)"
  # -f makes curl fail loudly on HTTP errors. Without it a rotated/removed URL
  # returns a 404 HTML body with exit 0, which unzip then rejects with a cryptic
  # "End-of-central-directory signature not found" corrupt-zip red herring.
  if ! curl -fSL "$CMDLINE_ZIP_URL" -o "$tmp/cmdline-tools.zip"; then
    echo "ERROR: download failed for $CMDLINE_ZIP_URL" >&2
    echo "The pinned build number is likely rotated out. Grab the current" >&2
    echo "'Command line tools only' link from https://developer.android.com/studio" >&2
    echo "and re-run:  CMDLINE_ZIP_URL=<new-url> $0 step4_cmdline_tools" >&2
    rm -rf "$tmp"
    return 1
  fi
  unzip -q "$tmp/cmdline-tools.zip" -d "$tmp"
  # the archive unpacks into a cmdline-tools/ dir - move it into place as latest/
  rm -rf "$SDK_ROOT/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
  rm -rf "$tmp"
  echo "sdkmanager: $SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
}

# ============================================================================
# STEP 5 - env vars (append to ~/.zshrc yourself; here - current session only)
# ============================================================================
step5_env() {
  say "STEP 5: env (current session)"
  _ensure_env
  cat <<EOF

>>> Add this to ~/.zshrc so it works in new sessions:

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="\$ANDROID_HOME"
export PATH="\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH"
EOF
}

# ============================================================================
# STEP 6 - SDK components + AVD (no sudo). ~1.5-2 GB download.
# ============================================================================
step6_sdk_and_avd() {
  say "STEP 6: platform-tools / emulator / system-image / AVD"
  _ensure_env
  # '|| true' is required: sdkmanager closes the pipe, yes catches SIGPIPE (141),
  # and without it pipefail+set -e silently kill the script before any download.
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  sdkmanager "platform-tools" "emulator" "platforms;android-${ANDROID_API}" "$SYS_IMG"

  # anchor the name with $ so e.g. an existing "penny_test_old" does not match
  # and wrongly skip creating "penny_test".
  if avdmanager list avd 2>/dev/null | grep -qE "Name: ${AVD_NAME}$"; then
    echo "AVD ${AVD_NAME} already exists - ok"
  else
    echo no | avdmanager create avd -n "$AVD_NAME" -k "$SYS_IMG" -d "$AVD_DEVICE"
  fi
  avdmanager list avd | grep -E 'Name|Based on' || true
}

# ============================================================================
# STEP 7 - headless boot + wait until ready
# ============================================================================
step7_boot() {
  say "STEP 7: start emulator (headless)"
  _ensure_env
  # -no-snapshot for a predictable cold start; drop it for fast restarts
  nohup emulator -avd "$AVD_NAME" \
    -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect -accel on \
    >"$HOME/emulator-${AVD_NAME}.log" 2>&1 &
  emu_pid=$!
  echo "PID $emu_pid ; log: $HOME/emulator-${AVD_NAME}.log"
  echo "waiting for boot (timeout ${BOOT_TIMEOUT:-300}s)..."
  # Bounded wait: bail out if the emulator process dies (e.g. no kvm access,
  # missing AVD) or if boot does not complete in time, instead of hanging on a
  # bare `adb wait-for-device` forever.
  deadline=$(( SECONDS + ${BOOT_TIMEOUT:-300} ))
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    if ! kill -0 "$emu_pid" 2>/dev/null; then
      echo "ERROR: emulator process $emu_pid died during boot." >&2
      echo "--- last log lines ---" >&2
      tail -n 20 "$HOME/emulator-${AVD_NAME}.log" >&2 || true
      return 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "ERROR: emulator did not finish booting within ${BOOT_TIMEOUT:-300}s." >&2
      echo "Check the log: $HOME/emulator-${AVD_NAME}.log" >&2
      return 1
    fi
    sleep 3
  done
  adb devices
  echo ">>> device is ready. /verify-pr and e2e-verifier will now see it."
}

# ---- runner ----------------------------------------------------------------
# Run a single step:  ./bootstrap-android-emulator.sh step1_kvm
# Or everything after the relogin (step1 requires a relogin before the rest):
#   ./bootstrap-android-emulator.sh all_after_relogin
case "${1:-help}" in
  step1_kvm|step2_apt|step3_swap|step4_cmdline_tools|step5_env|step6_sdk_and_avd|step7_boot) "$1" ;;
  all_after_relogin)
    step2_apt; step3_swap; step4_cmdline_tools; step5_env; step6_sdk_and_avd; step7_boot ;;
  *)
    echo "Usage: $0 <step1_kvm|step2_apt|step3_swap|step4_cmdline_tools|step5_env|step6_sdk_and_avd|step7_boot|all_after_relogin>"
    echo "Order: step1_kvm -> RELOGIN -> all_after_relogin"
    ;;
esac
