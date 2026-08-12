import { StyleSheet } from 'react-native';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';

// Layouts shared by more than one settings subpanel. They live here rather than
// in each panel's own StyleSheet because the panels are being extracted from
// SettingsScreen one at a time: a list row copied into each new panel would be
// four definitions of the same row within a few PRs, which is exactly the drift
// the shared-style rule in CLAUDE.md exists to prevent.
//
// Spread these into the host's StyleSheet and add whatever layout is specific to
// it alongside — as with componentStyles.js, they deliberately carry no spacing
// that varies by context.

// A tappable row in a settings list (language choice, import source, export
// format): full-bleed touch target, label left, trailing affordance right.
export const LIST_CONTAINER = {
  paddingVertical: SPACING.sm,
};

export const LIST_ITEM = {
  paddingHorizontal: HORIZONTAL_PADDING,
};

export const LIST_ITEM_CONTENT = {
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingVertical: SPACING.lg,
};

export const LIST_ITEM_TEXT = {
  fontSize: FONT_SIZE.base,
};

export const FLEX_LIST = {
  flex: 1,
};

export const EMPTY_CONTAINER = {
  flex: 1,
};

// The centered confirmation layout every destructive subpanel uses: warning
// icon, message, then the destructive button. The back arrow is the cancel, so
// there is no second button to lay out.
export const CONFIRM_CONTENT = {
  alignItems: 'center',
  flex: 1,
  justifyContent: 'center',
  paddingHorizontal: HORIZONTAL_PADDING * 2,
  paddingVertical: SPACING.xl,
};

export const CONFIRM_TEXT = {
  fontSize: 15,
  lineHeight: 22,
  textAlign: 'center',
};

export const CONFIRM_WARNING_ICON = {
  marginBottom: SPACING.lg,
};

export const CONFIRM_BUTTON_DESTRUCTIVE = {
  borderRadius: BORDER_RADIUS.md,
  marginTop: SPACING.xl,
  paddingHorizontal: SPACING.xl,
  paddingVertical: SPACING.md,
};

export const CONFIRM_BUTTON_TEXT = {
  color: '#fff',
  fontSize: FONT_SIZE.base,
  fontWeight: '600',
  textAlign: 'center',
};

// A settings-list row that carries an icon, a title and a description line —
// the shape the export formats and the import sources both use. Sits inside
// LIST_ITEM_CONTENT, left of whatever trailing affordance the row shows.
export const FORMAT_ITEM_ROW = {
  alignItems: 'center',
  flex: 1,
  flexDirection: 'row',
  gap: SPACING.md,
};

export const FORMAT_TEXT_CONTAINER = {
  flex: 1,
  flexShrink: 1,
};

export const FORMAT_DESCRIPTION = {
  fontSize: FONT_SIZE.sm,
  marginTop: SPACING.xs,
};

// Convenience bundle for a panel that is nothing but a settings list.
export const listStyles = StyleSheet.create({
  listContainer: LIST_CONTAINER,
  listItem: LIST_ITEM,
  listItemContent: LIST_ITEM_CONTENT,
  listItemText: LIST_ITEM_TEXT,
});
