/**
 * Notification Parser Registry
 * Auto-detects bank from notification and routes to appropriate parser
 */

import * as ArcaParser from './ArcaParser';

// Registry of all bank parsers
const parsers = [
  ArcaParser,
  // Add more bank parsers here as they are implemented
  // Example: AcbaParser, InecobankParser, etc.
];

/**
 * Get the appropriate parser for a notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @returns {Object|null} Parser object or null if no parser found
 */
export const getParser = (title, body) => {
  for (const parser of parsers) {
    if (parser.canParse(title, body)) {
      return parser;
    }
  }

  return null;
};

/**
 * Get list of all registered parsers
 * @returns {Array} Array of parser objects
 */
export const getAllParsers = () => {
  return [...parsers];
};

/**
 * Register a new parser
 * @param {Object} parser - Parser object with parse() and canParse() methods
 */
export const registerParser = (parser) => {
  if (!parser || typeof parser.parse !== 'function' || typeof parser.canParse !== 'function') {
    throw new Error('Parser must have parse() and canParse() methods');
  }

  parsers.push(parser);
};
