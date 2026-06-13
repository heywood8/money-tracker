// scripts/e2e-agent/src/android/adb.js
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PACKAGE = 'com.heywood8.monkeep';

function adb(serial, command) {
  const flag = serial ? `-s ${serial} ` : '';
  return execSync(`adb ${flag}${command}`, { encoding: 'utf8' });
}

export function takeScreenshot(serial) {
  adb(serial, 'shell screencap -p /sdcard/e2e_screen.png');
  const dest = join(tmpdir(), 'e2e_screen.png');
  adb(serial, `pull /sdcard/e2e_screen.png ${dest}`);
  return readFileSync(dest);
}

export function dumpUITree(serial) {
  adb(serial, 'shell uiautomator dump /sdcard/e2e_ui.xml');
  const dest = join(tmpdir(), 'e2e_ui.xml');
  adb(serial, `pull /sdcard/e2e_ui.xml ${dest}`);
  return readFileSync(dest, 'utf8');
}

export function tap(serial, x, y) {
  adb(serial, `shell input tap ${x} ${y}`);
}

export function typeText(serial, text) {
  const escaped = text.replace(/['"\\]/g, '\\$&').replace(/ /g, '%s');
  adb(serial, `shell input text "${escaped}"`);
}

export function pressBack(serial) {
  adb(serial, 'shell input keyevent KEYCODE_BACK');
}

export function swipe(serial, x1, y1, x2, y2, durationMs = 300) {
  adb(serial, `shell input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`);
}

export function isAppRunning(serial) {
  try {
    const result = adb(serial, `shell pidof ${PACKAGE}`).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

export function launchApp(serial) {
  adb(serial, `shell am start -n ${PACKAGE}/.MainActivity`);
  execSync('sleep 1');
}

export function getFirstDevice() {
  const output = execSync('adb devices', { encoding: 'utf8' });
  for (const line of output.split('\n').slice(1)) {
    const parts = line.trim().split('\t');
    if (parts.length === 2 && parts[1] === 'device') return parts[0];
  }
  throw new Error('No connected ADB device found. Start an emulator first.');
}
