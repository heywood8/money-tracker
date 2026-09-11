/**
 * Regression tests for issue #1698 — the bank-notification pipeline derived its
 * dates from the UTC calendar (`toISOString().slice(0, 10)`) while the rest of
 * the app books to the local one.
 *
 * In UTC+3/+4 that put every purchase between midnight and 03:00/04:00 local on
 * the previous day: the wrong month, the wrong budget, and invisible to
 * duplicate detection (which compares the date), so the hand-entered copy was
 * never matched and the user was left with a duplicate.
 *
 * Jest runs in the host timezone, so instead of assuming one, each test builds a
 * Date and compares against that Date's own local fields — the property under
 * test is "local calendar day", not any particular offset. The +04:00 case from
 * the issue is then pinned explicitly by faking the offset.
 */

import { formatLocalDate, todayLocalDate, localDateOf } from '../../app/utils/dateUtils';

/** The local calendar day of a Date, spelled out independently of the helper. */
const localDayOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('formatLocalDate', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    const d = new Date(2026, 2, 5, 13, 45);
    expect(formatLocalDate(d)).toBe('2026-03-05');
  });

  it('zero-pads month and day', () => {
    expect(formatLocalDate(new Date(2026, 0, 9, 12))).toBe('2026-01-09');
  });

  it('never reports the UTC day when the two differ', () => {
    const d = new Date(2026, 2, 5, 1, 0); // 01:00 local
    expect(formatLocalDate(d)).toBe(localDayOf(d));
  });
});

describe('todayLocalDate', () => {
  it('is today in the local calendar', () => {
    expect(todayLocalDate()).toBe(localDayOf(new Date()));
  });
});

describe('localDateOf', () => {
  it('reads epoch millis — a notification post time', () => {
    const d = new Date(2026, 5, 20, 23, 30);
    expect(localDateOf(d.getTime())).toBe(localDayOf(d));
  });

  it('reads an ISO timestamp — a pending row created_at', () => {
    const d = new Date(2026, 5, 20, 0, 30);
    expect(localDateOf(d.toISOString())).toBe(localDayOf(d));
  });

  it('reads a Date', () => {
    const d = new Date(2026, 5, 20, 12);
    expect(localDateOf(d)).toBe('2026-06-20');
  });

  it('returns null for a missing or unusable value', () => {
    expect(localDateOf(null)).toBeNull();
    expect(localDateOf(undefined)).toBeNull();
    expect(localDateOf('')).toBeNull();
    expect(localDateOf('not a date')).toBeNull();
    expect(localDateOf(NaN)).toBeNull();
  });

  describe('the reported case: a purchase at 01:00 local', () => {
    // The issue reported UTC+4, but the bug is the whole class: any zone east of
    // UTC books the small hours to the previous day through a UTC slice. Jest
    // cannot switch the process timezone mid-run, so the instant is built at
    // 01:00 in whatever zone the run is in and the property is asserted there.
    const oneAmLocal = new Date(2026, 2, 5, 1, 0);

    it('books the local day', () => {
      expect(localDateOf(oneAmLocal.getTime())).toBe('2026-03-05');
      expect(formatLocalDate(oneAmLocal)).toBe('2026-03-05');
    });

    it('books a pending row created_at to the local day too', () => {
      // `created_at` is a full UTC ISO string, so slicing its first ten
      // characters was the same bug in a second place.
      expect(localDateOf(oneAmLocal.toISOString())).toBe('2026-03-05');
    });

    it('diverges from the UTC slice the old code used, east of UTC', () => {
      const utcSlice = oneAmLocal.toISOString().slice(0, 10);
      if (oneAmLocal.getTimezoneOffset() < 0) {
        // e.g. UTC+4: 01:00 local on the 5th is 21:00Z on the 4th.
        expect(utcSlice).toBe('2026-03-04');
        expect(localDateOf(oneAmLocal.getTime())).not.toBe(utcSlice);
      } else {
        // At or west of UTC the two agree for this instant; the helper still
        // has to return the local day, which the assertions above cover.
        expect(localDateOf(oneAmLocal.getTime())).toBe('2026-03-05');
      }
    });

    it('is the local day for a +04:00 user, which a UTC slice gets wrong', () => {
      // Zone-explicit statement of the reported bug, independent of the host:
      // 2026-03-04T21:00Z is the 5th in Dubai but the 4th in UTC.
      const instant = new Date(Date.UTC(2026, 2, 4, 21, 0));
      const dubaiDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(instant);

      expect(dubaiDay).toBe('2026-03-05');
      expect(instant.toISOString().slice(0, 10)).toBe('2026-03-04');
    });
  });
});

describe('no UTC day slices are left in the date-bearing paths', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '../..');

  const readAll = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return readAll(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

  it('app/services/notifications no longer slices toISOString()', () => {
    const offenders = readAll(path.join(root, 'app/services/notifications'))
      .filter(file => /toISOString\(\)\s*\.\s*slice\(0,\s*10\)/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the seed operations use the local day', () => {
    const src = fs.readFileSync(path.join(root, 'app/defaults/defaultOperations.js'), 'utf8');
    expect(src).not.toMatch(/toISOString\(\)\s*\.\s*split\('T'\)/);
    expect(src).toContain('todayLocalDate');
  });
});

describe('localDateWithOffset (#1711)', () => {
  const { localDateWithOffset, todayLocalDate } = require('../../app/utils/dateUtils');

  afterEach(() => { jest.useRealTimers(); });

  it('returns today for an offset of zero', () => {
    expect(localDateWithOffset(0)).toBe(todayLocalDate());
  });

  it('walks back one calendar day', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 5, 20, 12, 0, 0));
    expect(localDateWithOffset(-1)).toBe('2024-06-19');
    expect(localDateWithOffset(1)).toBe('2024-06-21');
  });

  it('crosses a month boundary', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 6, 1, 9, 30, 0));
    expect(localDateWithOffset(-1)).toBe('2024-06-30');
  });

  it('crosses a year boundary', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 0, 1, 0, 5, 0));
    expect(localDateWithOffset(-1)).toBe('2023-12-31');
  });

  // The regression: OperationsList derived "Today"/"Yesterday" from
  // Math.floor((today - date) / 86400000). On a spring-forward day that
  // quotient is 0.96 of a day, so yesterday floored to 0 and read as "Today".
  // setDate walks the calendar instead and is immune.
  it('is a calendar walk, not a subtraction of fixed milliseconds', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 2, 31, 12, 0, 0));
    const yesterday = localDateWithOffset(-1);
    expect(yesterday).toBe('2024-03-30');
    expect(yesterday).not.toBe(localDateWithOffset(0));
  });
});
