import { writeTodayLogs, readAllLogs, pruneOldFiles, clearAllLogs } from './LogsFile';
import { captureLog } from './sentry';

const MAX_ENTRIES = 500;

let nextId = 1;

class LogService {
  constructor() {
    this._entries = [];
    this._listeners = new Set();
    this._installed = false;
    this._originals = {};
    this._flushTimer = null;
  }

  install() {
    if (this._installed) return;
    this._installed = true;

    const levelMap = {
      log: 'info',
      debug: 'debug',
      warn: 'warn',
      error: 'error',
    };

    for (const method of Object.keys(levelMap)) {
      this._originals[method] = console[method];
      const level = levelMap[method];
      console[method] = (...args) => {
        this._addEntry(level, args);
        this._originals[method].apply(console, args);
      };
    }

    this.loadFromFiles();
  }

  _scheduledFlush() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flushToDisk();
    }, 1000);
  }

  _flushToDisk() {
    writeTodayLogs(this._entries).catch(() => {
      // Intentionally silent — must not call console.* to avoid infinite loop
    });
  }

  async loadFromFiles() {
    try {
      await pruneOldFiles(7);
      const stored = await readAllLogs();
      if (stored.length > 0) {
        // Merge with any entries already captured since startup, dedup by id
        const existingIds = new Set(this._entries.map(e => e.id));
        const newEntries = stored.filter(e => !existingIds.has(e.id));
        const merged = [...newEntries, ...this._entries];
        // Cap at MAX_ENTRIES keeping most recent
        this._entries = merged.length > MAX_ENTRIES
          ? merged.slice(merged.length - MAX_ENTRIES)
          : merged;
        // Ensure nextId is beyond any loaded ids to avoid collisions
        for (const e of stored) {
          if (typeof e.id === 'number' && e.id >= nextId) {
            nextId = e.id + 1;
          }
        }
        this._notify();
      }
    } catch {
      // Intentionally silent
    }
  }

  _addEntry(level, args) {
    const message = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        const seen = new WeakSet();
        return JSON.stringify(arg, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
          }
          return value;
        });
      } catch {
        return String(arg);
      }
    }).join(' ');

    const entry = {
      id: nextId++,
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    this._entries.push(entry);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.splice(0, this._entries.length - MAX_ENTRIES);
    }

    this._notify();
    this._scheduledFlush();
    // Mirror the line to Sentry's structured logs (no-op unless a DSN is
    // configured). Redaction happens centrally in sentry.js `beforeSendLog`.
    captureLog(level, entry.message);
  }

  getEntries(filter) {
    if (!filter || filter === 'all') return [...this._entries];
    return this._entries.filter(e => e.level === filter);
  }

  clear() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    this._entries = [];
    this._notify();
    clearAllLogs().catch(() => {
      // Intentionally silent — must not call console.* to avoid infinite loop
    });
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    for (const listener of this._listeners) {
      listener();
    }
  }

  formatForExport(filter) {
    const entries = this.getEntries(filter);
    return entries.map(e =>
      `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`,
    ).join('\n');
  }
}

export { LogService };
export const logService = new LogService();
