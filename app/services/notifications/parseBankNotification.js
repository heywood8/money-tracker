/**
 * Bank notification parser — source-app dispatcher.
 *
 * Two kinds of parser exist behind this module:
 *
 *   1. **Built-in parsers** (`bankParsers/`), hand-written per banking app —
 *      Ameriabank (`com.banqr.ameriabank`) and Tinkoff / T-Bank
 *      (`com.idamob.tinkoff.android`) today. Adding another bank in code is just
 *      another parser module in `bankParsers/`; nothing here changes.
 *   2. **User-defined parse templates** (`customTemplates.js`), built in the app
 *      by marking the fields in a captured notification. This is how a user
 *      teaches Penny a bank nobody has written a parser for.
 *
 * Custom templates are tried first: a user only writes one for a notification
 * the shipped parsers get wrong or don't handle at all, so when both claim the
 * same message the hand-made one is what they meant. See customTemplates.js for
 * why the template cache must be loaded before any of this runs.
 */

import { findTemplateByKind, parseWithCustomTemplates } from './customTemplates';
import { BANK_PARSERS, getParserForPackage } from './bankParsers';

/**
 * Parse a captured bank notification into a normalized transaction descriptor.
 *
 * Order of attempts:
 *   1. the user's own templates for this app (or, for a notification with no
 *      source app, every template);
 *   2. the built-in parser registered for `notification.packageName`;
 *   3. when the package is unknown or missing (e.g. a manual paste), every
 *      built-in parser in turn — each returns null for formats it doesn't
 *      handle, so this is safe.
 *
 * @param {{ title?: string, text?: string, packageName?: string, postTime?: number }} notification
 * @returns {null | Object} a normalized descriptor (see a parser module for the
 *   exact shape), or null when nothing recognizes the notification.
 */
export const parseBankNotification = (notification) => {
  if (!notification) return null;
  // A template can read the title alone (some apps put everything there), so a
  // text-less notification is only worthless to the built-in parsers, which
  // each re-check `text` themselves.
  if (typeof notification.text !== 'string' && typeof notification.title !== 'string') return null;

  const custom = parseWithCustomTemplates(notification);
  if (custom) return custom;

  if (typeof notification.text !== 'string') return null;

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
 * A queued item parsed by a user template carries the template's name as its
 * kind, so custom kinds are resolved against the templates first. They never
 * force a manual category — a template either names a default category or lets
 * the merchant rules learn one.
 *
 * @param {string} kind
 * @param {string} [packageName] - source app, for per-app scoping
 * @returns {boolean}
 */
export const kindRequiresCategory = (kind, packageName) => {
  if (findTemplateByKind(kind, packageName)) return false;
  const parser = getParserForPackage(packageName);
  if (parser) return parser.kindRequiresCategory(kind);
  return BANK_PARSERS.some((candidate) => candidate.kindRequiresCategory(kind));
};

/**
 * Whether a notification kind maps to a transfer between the user's own accounts
 * (e.g. an ATM cash withdrawal). Scoped to the source app when known; otherwise
 * true if any registered parser treats the kind that way.
 *
 * Custom templates never produce transfers (see customTemplates.js), so a kind
 * that belongs to one is resolved as false without consulting the built-ins.
 *
 * @param {string} kind
 * @param {string} [packageName] - source app, for per-app scoping
 * @returns {boolean}
 */
export const kindIsTransfer = (kind, packageName) => {
  if (findTemplateByKind(kind, packageName)) return false;
  const parser = getParserForPackage(packageName);
  if (parser) return parser.kindIsTransfer(kind);
  return BANK_PARSERS.some((candidate) => candidate.kindIsTransfer(kind));
};

export default parseBankNotification;
