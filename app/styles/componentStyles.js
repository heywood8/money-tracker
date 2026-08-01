// app/styles/componentStyles.js
import { StyleSheet } from 'react-native';
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  HEIGHTS,
  SPACING,
} from './designTokens';

/**
 * Shared *composite* styles — the recurring UI elements that were each being
 * re-specified per file.
 *
 * designTokens.js holds the scalars (a spacing step, a radius, a font size).
 * This file holds the handful of small elements that are assembled from those
 * scalars the same way everywhere: a card surface, an eyebrow label, a modal
 * title, a button, a count badge. Before this file each of those existed in
 * four or five slightly different versions — chips at five radii, cards at two
 * radii and two border widths, eyebrow labels at four weight/tracking pairs.
 *
 * Colors are not included: they depend on the active theme and are applied
 * inline by the host from ThemeColorsContext.
 */

/**
 * Card surface — the bordered container that holds a chunk of content: a graph
 * card, a plan section, a notification rule.
 *
 * Border is hairline rather than 1px. At 1px a card outline competes with the
 * content it is supposed to be grouping; the whole job here is separation, and
 * hairline is the least ink that still does it.
 */
export const CARD_SURFACE = {
  borderRadius: BORDER_RADIUS.lg,
  borderWidth: StyleSheet.hairlineWidth,
};

/**
 * Pill chip — filter chips, label chips, suggestion chips, the drill-down back
 * chip. Fully rounded via `pill` rather than a hand-computed half-height: every
 * one of these was already trying to be a pill (radius 12/14/16/20 against a
 * 26-30px height), each arriving at it by a different guess.
 */
export const CHIP = {
  alignItems: 'center',
  borderRadius: BORDER_RADIUS.pill,
  borderWidth: 1,
  flexDirection: 'row',
  gap: SPACING.xs,
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.xs,
};

export const CHIP_TEXT = {
  fontSize: FONT_SIZE.sm,
  fontWeight: FONT_WEIGHT.medium,
};

/**
 * Eyebrow / overline label — the small uppercase text that names a group of
 * fields or a section of a panel.
 */
export const SECTION_LABEL = {
  fontSize: FONT_SIZE.xs,
  fontWeight: FONT_WEIGHT.semibold,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
};

/**
 * Section heading — a real heading that titles a block of content, as opposed
 * to the eyebrow above. Bigger and sentence-weight rather than tracked-out.
 */
export const SECTION_HEADING = {
  fontSize: FONT_SIZE.md,
  fontWeight: FONT_WEIGHT.bold,
  textTransform: 'uppercase',
};

/**
 * Modal / bottom-sheet title. Negative tracking because at this size and weight
 * the default spacing reads loose against the sheet's tight top padding.
 */
export const MODAL_TITLE = {
  fontSize: FONT_SIZE.lg,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: -0.3,
};

/**
 * Button that owns its own line — a modal's Save, a dialog's confirm.
 */
export const BUTTON = {
  alignItems: 'center',
  borderRadius: BORDER_RADIUS.md,
  justifyContent: 'center',
  minHeight: HEIGHTS.input,
  paddingHorizontal: SPACING.lg,
};

/**
 * Button that sits inside a row of other content — a card's inline action.
 */
export const BUTTON_COMPACT = {
  alignItems: 'center',
  borderRadius: BORDER_RADIUS.md,
  justifyContent: 'center',
  minHeight: HEIGHTS.buttonCompact,
  paddingHorizontal: SPACING.md,
};

export const BUTTON_TEXT = {
  fontSize: FONT_SIZE.md,
  fontWeight: FONT_WEIGHT.semibold,
};

/**
 * Count badge — the small round counter on a filter button or a rule card.
 */
export const BADGE = {
  alignItems: 'center',
  borderRadius: BORDER_RADIUS.pill,
  justifyContent: 'center',
  // Both minimums, not just minWidth: with only a width floor a single-digit
  // count collapses to the line height of its own text and the badge stops
  // being round. Equal floors give a circle at one digit and a pill past that.
  minHeight: HEIGHTS.badge,
  minWidth: HEIGHTS.badge,
  paddingHorizontal: SPACING.xs,
};

export const BADGE_TEXT = {
  fontSize: FONT_SIZE.xs,
  fontWeight: FONT_WEIGHT.bold,
};
