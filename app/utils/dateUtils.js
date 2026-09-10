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
