/**
 * perfTrace — phase timing for the paths that make the app *look* slow.
 *
 * Written for the notification feed, which is supposed to be an instant,
 * entirely offline read: the listener service has already written every message
 * to SharedPreferences, so putting them on screen needs one bridge call and
 * nothing else. In practice the panel sometimes sat on its spinner for many
 * seconds and nothing said why — the wait came from the *ingestion* work the
 * panel awaited before its first render (a GPS fix, an exchange-rate fetch over
 * the network, a per-notification database sweep), none of which the user asked
 * for by opening the tab.
 *
 * These helpers time each phase and write the slow ones to the app log
 * (Settings → Logs), so the next slow open is answerable from the device rather
 * than by guesswork. Everything goes through `console.debug`, which LogService
 * captures into that viewer and into the day's log file.
 *
 * Logging is threshold-gated on purpose. The feed re-runs its whole pipeline
 * every three seconds while it is open, so logging every fast phase would push
 * everything else out of the 500-entry log ring inside a minute — and a phase
 * that finishes in single-digit milliseconds is not what anyone is looking for.
 */

const TAG = '[perf]';

/**
 * Phases quicker than this are not worth a log line. A quarter second is well
 * under "the user noticed" but far above any local SQLite read, so anything
 * that trips it is genuinely doing something.
 */
export const SLOW_PHASE_MS = 250;

/**
 * Time one async call and log it when it turns out slow.
 *
 * The result (or the thrown error) passes through untouched, so a call can be
 * wrapped in place without changing what the caller sees.
 *
 * @param {string} label - dotted name, e.g. 'location.fix'
 * @param {() => Promise<*>} fn - the work to time
 * @param {Object} [options]
 * @param {number} [options.threshold=SLOW_PHASE_MS] - log only at/above this
 * @param {boolean} [options.always=false] - log regardless of duration
 * @returns {Promise<*>} whatever `fn` resolves to
 */
export const traceAsync = async (label, fn, { threshold = SLOW_PHASE_MS, always = false } = {}) => {
  const started = Date.now();
  let outcome = '';
  try {
    return await fn();
  } catch (error) {
    outcome = ' threw';
    throw error;
  } finally {
    const elapsed = Date.now() - started;
    if (always || elapsed >= threshold) {
      console.debug(`${TAG} ${label} ${elapsed}ms${outcome}`);
    }
  }
};

/**
 * Start a multi-phase stopwatch.
 *
 * `mark(name)` closes the current phase and opens the next; `end(detail)` logs
 * the whole run as one line — `label total=1234ms [a=10ms b=1220ms] detail` —
 * so a slow open is read as "which phase" rather than as a scatter of
 * timestamps to subtract by hand. The line is written only when the total trips
 * the threshold, so a fast open stays silent.
 *
 * Whatever ran after the last `mark()` is reported as a trailing `rest=` phase.
 * Without it the breakdown quietly stops short of `total`, and the unnamed tail
 * — exactly the part nobody thought to mark, and so the likeliest place for a
 * surprise — reads as a gap the reader has to notice and subtract.
 *
 * `end` takes its own threshold so one call site can hold a run to a different
 * bar than another: a pass that did real work is worth a line as soon as it is
 * perceptible, while a pass that found nothing to do runs on a timer and would
 * otherwise report the same handful of milliseconds forever.
 *
 * @param {string} label - dotted name, e.g. 'notifications.panel-open'
 * @param {Object} [options]
 * @param {number} [options.threshold=SLOW_PHASE_MS]
 * @returns {{ mark: (name: string) => void,
 *   end: (detail?: string, options?: { threshold?: number }) => number }}
 */
export const startTrace = (label, { threshold = SLOW_PHASE_MS } = {}) => {
  const started = Date.now();
  let previous = started;
  const phases = [];
  return {
    mark(name) {
      const at = Date.now();
      phases.push(`${name}=${at - previous}ms`);
      previous = at;
    },
    end(detail = '', { threshold: endThreshold = threshold } = {}) {
      const finished = Date.now();
      const total = finished - started;
      if (total >= endThreshold) {
        const tail = finished - previous;
        const named = phases.length > 0 && tail > 0 ? [...phases, `rest=${tail}ms`] : phases;
        const breakdown = named.length > 0 ? ` [${named.join(' ')}]` : '';
        console.debug(`${TAG} ${label} total=${total}ms${breakdown}${detail ? ` ${detail}` : ''}`);
      }
      return total;
    },
  };
};
