/**
 * Bank notification parser — source-app dispatcher.
 *
 * Parsing rules are grouped per banking app (see `bankParsers/`), because each
 * bank formats its notifications differently. This module just routes a captured
 * notification to the parser registered for its source app and exposes the
 * per-app `kindRequiresCategory` helper.
 *
 * Today only Ameriabank (`com.banqr.ameriabank`) is supported. When a second
 * bank is added it becomes another parser module in `bankParsers/` — nothing
 * here changes.
 */

import { BANK_PARSERS, getParserForPackage } from './bankParsers';

/**
 * Parse a captured bank notification into a normalized transaction descriptor.
 *
 * Dispatch is by source app: the parser registered for `notification.packageName`
 * handles it. When the package is unknown or missing (e.g. a manual paste), every
 * registered parser is tried in turn and the first to recognize the format wins —
 * each parser returns null for formats it doesn't handle, so this is safe.
 *
 * @param {{ title?: string, text?: string, packageName?: string, postTime?: number }} notification
 * @returns {null | Object} a normalized descriptor (see a parser module for the
 *   exact shape), or null when nothing recognizes the notification.
 */
export const parseBankNotification = (notification) => {
  if (!notification || typeof notification.text !== 'string') return null;

  const parser = getParserForPackage(notification.packageName);
  if (parser) return parser.parse(notification);

  // Unknown/missing source app: fall back to trying every registered parser.
  for (const candidate of BANK_PARSERS) {
    const result = candidate.parse(notification);
    if (result) return result;
  }
  return null;
};

/**
 * Whether a notification kind must always have its category chosen manually
 * (e.g. C2C transfers). Scoped to the source app when known; otherwise true if
 * any registered parser treats the kind that way.
 *
 * @param {string} kind
 * @param {string} [packageName] - source app, for per-app scoping
 * @returns {boolean}
 */
export const kindRequiresCategory = (kind, packageName) => {
  const parser = getParserForPackage(packageName);
  if (parser) return parser.kindRequiresCategory(kind);
  return BANK_PARSERS.some((candidate) => candidate.kindRequiresCategory(kind));
};

export default parseBankNotification;
