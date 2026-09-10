/**
 * Money aggregation in SQLite without binary-float noise.
 *
 * `operations.amount` is TEXT holding a decimal string, and every aggregate used
 * to fold it with `SUM(CAST(amount AS REAL))` — a binary double. `1.10 + 2.20`
 * came back as `3.3000000000000003`, and because that result is handed to
 * decimal.js as a string, the `Currency.*` layer faithfully preserved the noise:
 * an exactly-met budget reported "exceeded", 101% and a remaining of `-0.00`.
 *
 * {@link sumMoneySql} folds the same column exactly. Each amount is scaled to an
 * integer number of minor units first, so `ROUND()` is the only rounding, it
 * happens once per row before any addition, and SQLite adds integers exactly.
 * The exact integer total is scaled back down and rounded to the scale's own
 * precision, so the value that reaches JavaScript is the nearest double to the
 * true decimal sum and `String()` prints it as that decimal.
 */

/**
 * Minor-unit scale for SQL money aggregates: 4 decimal places.
 *
 * Every currency in `assets/currencies.json` has at most 2 `decimal_digits`, so
 * 4 leaves room for stored amounts carrying more precision than their currency
 * displays (a converted foreign amount, an imported row) while keeping the
 * scaled sum far inside SQLite's INTEGER range: the ceiling is 2^63 / 10^4,
 * about 9.2e14.
 */
export const MONEY_SCALE = 10000;

/** Decimal places `MONEY_SCALE` represents — the precision of the unscaled sum. */
const MONEY_SCALE_DIGITS = String(MONEY_SCALE).length - 1;

/**
 * SQL expression summing a money column exactly.
 *
 * A drop-in replacement for `SUM(CAST(<expr> AS REAL))`: it yields the same
 * decimal value (NULL when there are no rows, so `result.total != null` checks
 * still read as "nothing to sum"), just without the accumulated float error, and
 * it stays monotonic so `ORDER BY total DESC` is unaffected.
 *
 * @param {string} [expr='o.amount'] - Column expression to sum. Interpolated
 *   straight into SQL, so it must be a literal from this codebase, never input.
 * @returns {string} SQL expression.
 */
export const sumMoneySql = (expr = 'o.amount') =>
  `ROUND(SUM(CAST(ROUND(CAST(${expr} AS REAL) * ${MONEY_SCALE}) AS INTEGER)) / ${MONEY_SCALE}.0, ${MONEY_SCALE_DIGITS})`;
