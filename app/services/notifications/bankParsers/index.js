/**
 * Registry of bank-notification parsers, keyed by source app.
 *
 * Each banking app formats its notifications differently, so parsing rules are
 * grouped per source app (Android package name) rather than assumed to be
 * universal. Ameriabank (`com.banqr.ameriabank`) and Tinkoff / T-Bank
 * (`com.idamob.tinkoff.android`) are supported today; adding another bank is just
 * another parser module registered here.
 *
 * A parser is an object: `{ packageNames: string[], parse(notification) =>
 * descriptor|null, kindRequiresCategory(kind) => boolean,
 * kindIsTransfer(kind) => boolean }`.
 */

import ameriabank from './ameriabank';
import tinkoff from './tinkoff';

/** All registered bank parsers. Order matters only for the fallback scan below. */
export const BANK_PARSERS = [ameriabank, tinkoff];

/**
 * The parser registered for a given source app, or null if none handles it.
 * @param {string|null|undefined} packageName
 * @returns {Object|null}
 */
export const getParserForPackage = (packageName) => {
  if (!packageName) return null;
  return BANK_PARSERS.find((parser) => parser.packageNames.includes(packageName)) || null;
};

export default BANK_PARSERS;
