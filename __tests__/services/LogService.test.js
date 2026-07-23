import { LogService } from '../../app/services/LogService';

describe('LogService', () => {
  let service;

  beforeEach(() => {
    service = new LogService();
  });

  describe('Circular Buffer', () => {
    it('stores entries up to the max limit', async () => {
      for (let i = 0; i < 500; i++) {
        service._addEntry('info', [`msg ${i}`]);
      }
      expect(service.getEntries().length).toBe(500);
    });

    it('evicts oldest entries when buffer overflows', async () => {
      for (let i = 0; i < 510; i++) {
        service._addEntry('info', [`msg ${i}`]);
      }
      const entries = service.getEntries();
      expect(entries.length).toBe(500);
      expect(entries[0].message).toBe('msg 10');
      expect(entries[499].message).toBe('msg 509');
    });
  });

  describe('Level Filtering', () => {
    it('returns all entries when filter is "all"', async () => {
      service._addEntry('info', ['hello']);
      service._addEntry('error', ['oops']);
      service._addEntry('warn', ['careful']);
      expect(service.getEntries('all').length).toBe(3);
    });

    it('returns all entries when no filter specified', async () => {
      service._addEntry('info', ['hello']);
      service._addEntry('error', ['oops']);
      expect(service.getEntries().length).toBe(2);
    });

    it('filters by level', async () => {
      service._addEntry('info', ['a']);
      service._addEntry('error', ['b']);
      service._addEntry('warn', ['c']);
      service._addEntry('error', ['d']);

      const errors = service.getEntries('error');
      expect(errors.length).toBe(2);
      expect(errors[0].message).toBe('b');
      expect(errors[1].message).toBe('d');
    });

    it('returns empty array for level with no entries', async () => {
      service._addEntry('info', ['a']);
      expect(service.getEntries('debug')).toEqual([]);
    });
  });

  describe('Clear and Notify', () => {
    it('clears all entries', async () => {
      service._addEntry('info', ['a']);
      service._addEntry('error', ['b']);
      service.clear();
      expect(service.getEntries().length).toBe(0);
    });

    it('notifies listeners on clear', async () => {
      const listener = jest.fn();
      service.subscribe(listener);
      service.clear();
      expect(listener).toHaveBeenCalled();
    });

    it('notifies listeners on new entry', async () => {
      const listener = jest.fn();
      service.subscribe(listener);
      service._addEntry('info', ['test']);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Subscribe / Unsubscribe', () => {
    it('subscribe returns an unsubscribe function', async () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      expect(typeof unsub).toBe('function');
    });

    it('unsubscribed listener is not called', async () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      service._addEntry('info', ['test']);
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', async () => {
      const l1 = jest.fn();
      const l2 = jest.fn();
      service.subscribe(l1);
      service.subscribe(l2);
      service._addEntry('info', ['test']);
      expect(l1).toHaveBeenCalled();
      expect(l2).toHaveBeenCalled();
    });
  });

  describe('Message Serialization', () => {
    it('serializes strings as is', async () => {
      service._addEntry('info', ['hello world']);
      expect(service.getEntries()[0].message).toBe('hello world');
    });

    it('joins multiple args with space', async () => {
      service._addEntry('info', ['hello', 'world']);
      expect(service.getEntries()[0].message).toBe('hello world');
    });

    it('serializes objects to JSON', async () => {
      service._addEntry('info', [{ foo: 'bar' }]);
      expect(service.getEntries()[0].message).toBe('{"foo":"bar"}');
    });

    it('handles null and undefined', async () => {
      service._addEntry('info', [null, undefined]);
      expect(service.getEntries()[0].message).toBe('null undefined');
    });

    it('handles circular references without throwing', async () => {
      const obj = { a: 1 };
      obj.self = obj;
      service._addEntry('info', [obj]);
      expect(service.getEntries()[0].message).toContain('[Circular]');
    });

    it('handles numbers', async () => {
      service._addEntry('info', [42]);
      expect(service.getEntries()[0].message).toBe('42');
    });
  });

  describe('Format For Export', () => {
    it('formats entries as plain text lines', async () => {
      service._addEntry('info', ['hello']);
      service._addEntry('error', ['oops']);

      const text = service.formatForExport();
      const lines = text.split('\n');
      expect(lines.length).toBe(2);
      expect(lines[0]).toMatch(/^\[.*\] \[INFO\] hello$/);
      expect(lines[1]).toMatch(/^\[.*\] \[ERROR\] oops$/);
    });

    it('respects filter param', async () => {
      service._addEntry('info', ['a']);
      service._addEntry('error', ['b']);

      const text = service.formatForExport('error');
      const lines = text.split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('[ERROR]');
    });

    it('returns empty string when no entries', async () => {
      expect(service.formatForExport()).toBe('');
    });

    it('redacts monetary amounts and long digit runs from exported messages', async () => {
      service._addEntry('info', ['Balance updated to 1234.56 for account 987654']);

      const text = service.formatForExport();
      expect(text).not.toContain('1234.56');
      expect(text).not.toContain('987654');
      expect(text).toContain('[redacted]');
      // Timestamp/level structure is preserved.
      expect(text).toMatch(/^\[.*\] \[INFO\] /);
    });
  });

  describe('Counts', () => {
    it('returns zeroed counts when empty', () => {
      expect(service.getCounts()).toEqual({ all: 0, error: 0, warn: 0, info: 0, debug: 0 });
    });

    it('tallies entries per level and total', () => {
      service._addEntry('info', ['a']);
      service._addEntry('info', ['b']);
      service._addEntry('error', ['c']);
      service._addEntry('warn', ['d']);
      service._addEntry('debug', ['e']);

      expect(service.getCounts()).toEqual({ all: 5, error: 1, warn: 1, info: 2, debug: 1 });
    });
  });

  describe('Install', () => {
    it('is idempotent', async () => {
      const origLog = console.log;
      service.install();
      const afterFirst = console.log;
      service.install();
      const afterSecond = console.log;
      expect(afterFirst).toBe(afterSecond);
      // restore
      console.log = origLog;
    });

    it('patches console methods to capture entries', async () => {
      const origLog = console.log;
      const origError = console.error;
      const origWarn = console.warn;
      const origDebug = console.debug;

      service.install();

      console.log('test log');
      console.error('test error');
      console.warn('test warn');
      console.debug('test debug');

      const entries = service.getEntries();
      expect(entries.length).toBe(4);
      expect(entries[0].level).toBe('info');
      expect(entries[1].level).toBe('error');
      expect(entries[2].level).toBe('warn');
      expect(entries[3].level).toBe('debug');

      // restore
      console.log = origLog;
      console.error = origError;
      console.warn = origWarn;
      console.debug = origDebug;
    });
  });

  describe('Entry Shape', () => {
    it('entries have id, timestamp, level, message', async () => {
      service._addEntry('warn', ['test']);
      const entry = service.getEntries()[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level', 'warn');
      expect(entry).toHaveProperty('message', 'test');
      expect(typeof entry.id).toBe('number');
      expect(typeof entry.timestamp).toBe('string');
    });
  });

  describe('Immutability', () => {
    it('getEntries returns a copy, not a reference', async () => {
      service._addEntry('info', ['a']);
      const entries1 = service.getEntries();
      const entries2 = service.getEntries();
      expect(entries1).not.toBe(entries2);
      expect(entries1).toEqual(entries2);
    });
  });
});
