import * as FileSystem from 'expo-file-system/legacy';

const LOGS_DIR = FileSystem.documentDirectory + 'logs/';
const FILE_PREFIX = 'penny-logs-';
const FILE_SUFFIX = '.json';

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getTodayPath() {
  return LOGS_DIR + FILE_PREFIX + getTodayDate() + FILE_SUFFIX;
}

function dateFromFilename(filename) {
  // filename: 'penny-logs-YYYY-MM-DD.json'
  return filename.slice(FILE_PREFIX.length, filename.length - FILE_SUFFIX.length);
}

async function ensureDir() {
  await FileSystem.makeDirectoryAsync(LOGS_DIR, { intermediates: true });
}

async function writeTodayLogs(entries) {
  try {
    await ensureDir();
    const today = getTodayDate();
    const todayEntries = entries.filter(e => e.timestamp.startsWith(today));
    await FileSystem.writeAsStringAsync(getTodayPath(), JSON.stringify(todayEntries));
  } catch {
    // Intentionally silent — must not call console.* to avoid infinite loop
  }
}

async function readAllLogs() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!dirInfo.exists) return [];

    const files = await FileSystem.readDirectoryAsync(LOGS_DIR);
    const logFiles = files.filter(f => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX));

    const allEntries = [];
    for (const filename of logFiles) {
      try {
        const path = LOGS_DIR + filename;
        const content = await FileSystem.readAsStringAsync(path);
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          allEntries.push(...parsed);
        }
      } catch {
        // Skip corrupt files silently
      }
    }

    allEntries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    return allEntries;
  } catch {
    return [];
  }
}

async function pruneOldFiles(retentionDays = 7) {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!dirInfo.exists) return;

    const files = await FileSystem.readDirectoryAsync(LOGS_DIR);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    for (const filename of files) {
      if (!filename.startsWith(FILE_PREFIX) || !filename.endsWith(FILE_SUFFIX)) continue;
      const fileDate = dateFromFilename(filename);
      if (fileDate < cutoffStr) {
        try {
          await FileSystem.deleteAsync(LOGS_DIR + filename, { idempotent: true });
        } catch {
          // Skip silently
        }
      }
    }
  } catch {
    // Ignore
  }
}

async function clearAllLogs() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!dirInfo.exists) return;

    const files = await FileSystem.readDirectoryAsync(LOGS_DIR);
    for (const filename of files) {
      if (!filename.startsWith(FILE_PREFIX) || !filename.endsWith(FILE_SUFFIX)) continue;
      try {
        await FileSystem.deleteAsync(LOGS_DIR + filename, { idempotent: true });
      } catch {
        // Skip silently
      }
    }
  } catch {
    // Ignore
  }
}

export { writeTodayLogs, readAllLogs, pruneOldFiles, clearAllLogs };
