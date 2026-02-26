const MAX_ENTRIES = 500;

let nextId = 1;

class LogService {
  constructor() {
    this._entries = [];
    this._listeners = new Set();
    this._installed = false;
    this._originals = {};
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
  }

  _addEntry(level, args) {
    const message = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'string') return arg;
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
  }

  getEntries(filter) {
    if (!filter || filter === 'all') return [...this._entries];
    return this._entries.filter(e => e.level === filter);
  }

  clear() {
    this._entries = [];
    this._notify();
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
