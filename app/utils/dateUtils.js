/**
 * The app's one definition of "what day is it".
 *
 * Every date the user sees or filters on is a **local** calendar day: an
 * operation entered at 01:00 on the 5th belongs to the 5th, whatever UTC thinks.
 * `toISOString().slice(0, 10)` gives the *UTC* day, so in UTC+3/+4 everything
 * booked between midnight and 03:00/04:00 local landed on the previous day — the
 * wrong month, the wrong budget, and invisible to duplicate detection, which
 * compares dates (`duplicateOperations.js`, `OperationsDB` `… AND date = ?`).
 *
 * These helpers replace three separate copies of the same padding code plus the
 * UTC fallbacks in the bank-notification pipeline.
 */

/**
 * Local calendar day of a Date, as `YYYY-MM-DD`.
 * @param {Date} date
 * @returns {string}
 */
export const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Today's local calendar day, as `YYYY-MM-DD`.
 * @returns {string}
 */
export const todayLocalDate = () => formatLocalDate(new Date());

/**
 * Local calendar day of an instant, as `YYYY-MM-DD`, or null when unusable.
 *
 * Accepts anything `new Date()` accepts: epoch millis (a notification's post
 * time) or an ISO timestamp (a pending row's `created_at`, which is stored as a
 * full UTC ISO string — slicing its first ten characters would hand back the UTC
 * day, which is exactly the bug this replaces).
 *
 * @param {number|string|Date|null|undefined} instant
 * @returns {string|null}
 */
export const localDateOf = (instant) => {
  if (instant === null || instant === undefined || instant === '') return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalDate(d);
};

/**
 * The local calendar day `offset` days from today, as `YYYY-MM-DD`.
 *
 * `Date#setDate` walks the calendar, so it lands on the right day across DST
 * boundaries and month/year ends. The alternative — subtracting 86,400,000 ms —
 * is short by an hour on the spring-forward day, which is what made "Yesterday"
 * read as "Today" in the operations list once a year.
 *
 * @param {number} offset - Days from today; negative for the past.
 * @returns {string}
 */
export const localDateWithOffset = (offset) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
};

const WEEKDAY_DAY_OPTIONS = { weekday: 'short', month: 'short', day: 'numeric' };
const SHORT_DAY_OPTIONS = { month: 'short', day: 'numeric' };

/**
 * Human label for a `YYYY-MM-DD` calendar day: "Today", "Yesterday", or the
 * date itself.
 *
 * The comparison is string-to-string rather than a millisecond difference
 * divided by 86,400,000: on the spring-forward day that quotient is 0.96 of a
 * day, so `Math.floor` made yesterday read as today.
 *
 * The date is formatted in the APP's language, not the device's — a user who
 * set Penny to Russian on an English phone was reading "Mon, Sep 1" in the
 * operations list and "1 сентября" in the Graphs drill-down.
 *
 * @param {string} dateString - A local calendar day, `YYYY-MM-DD`.
 * @param {Object} options
 * @param {Function} options.t - Translation function.
 * @param {string} [options.language] - App language code.
 * @param {boolean} [options.withWeekday=true] - Include the weekday in the
 *   fallback format. Off where the label has to fit a chip.
 * @param {boolean} [options.markOtherYears=false] - Add the year when the day is
 *   not in the current one. For a label that is the only report of a date the
 *   user is about to commit to; a list the user scrolled into has its own
 *   context and does not need it on every separator.
 * @returns {string}
 */
export const relativeDayLabel = (dateString, {
  t,
  language,
  withWeekday = true,
  markOtherYears = false,
}) => {
  if (dateString === localDateWithOffset(0)) return t('today');
  if (dateString === localDateWithOffset(-1)) return t('yesterday');
  // T00:00:00 anchors the bare string to local midnight; a bare date parses as
  // UTC, which shifts the day west of Greenwich.
  const date = new Date(`${dateString}T00:00:00`);
  const options = withWeekday ? WEEKDAY_DAY_OPTIONS : SHORT_DAY_OPTIONS;
  // A day in another year says so where the caller asked. Without it "Sep 4" is
  // the same label whether the date-picker wheel landed on this year or the last
  // one, and on the quick-add chip that label is the only report of what the
  // next entry will be booked as.
  const offYear = markOtherYears && date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString(
    language || undefined,
    offYear ? { ...options, year: 'numeric' } : options,
  );
};
