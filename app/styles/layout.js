/**
 * Shared layout constants for consistent spacing across screens
 *
 * DEPRECATED: These values are now defined in designTokens.js. Nothing under
 * `app/` imports this module any more — import from designTokens.js directly:
 * import { SPACING, HORIZONTAL_PADDING, TOP_CONTENT_SPACING } from '../styles/designTokens';
 *
 * The re-export list below is a full mirror rather than the five names it used
 * to carry. A partial mirror is a trap: `import { FONT_SIZE } from './layout'`
 * is valid JS, passes lint, and silently yields `undefined` — which then reads
 * as `undefined.sm` at StyleSheet build time, i.e. a crash at import, in a file
 * that looks correct.
 */

// Re-export from design tokens for backward compatibility
export {
  HORIZONTAL_PADDING,
  TOP_CONTENT_SPACING,
  SPACING,
  BORDER_RADIUS,
  HEIGHTS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  ELEVATION,
  OPACITY,
  DURATION,
  Z_INDEX,
} from './designTokens';
