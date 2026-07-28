import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../styles/designTokens';

// Legacy (flat all-root) grid width vs. the quick-add-style suggestions grid,
// which lays chips four-across to match the QuickAdd form.
const LEGACY_COLUMNS = 3;
const SUGGEST_COLUMNS = 4;
// Shortcut counts shown in suggestions mode, mirroring the QuickAdd form: 7
// alongside the "All categories" entry (8 slots over two rows of four), or a
// full 8 shortcuts when there are few enough categories to skip the entry.
const TOP_WITH_ALL = 7;
const TOP_WITHOUT_ALL = 8;

// Chips carry their selection as a tint of the accent rather than a solid fill:
// white-on-accent sits at ~2.8:1 in the dark theme, which is what a filled chip
// used to be. Hex alpha suffix on `colors.primary` (a real hex in both themes —
// see ThemeColorsContext), with a graceful fallback for any palette that isn't.
const TINT = '1F';
const tintOf = (primary, fallback) => (
  typeof primary === 'string' && /^#[0-9a-f]{6}$/i.test(primary) ? primary + TINT : fallback
);

const DEFAULT_TEST_ID_PREFIX = 'category-grid';

const displayName = (item, t) => (item.nameKey ? t(item.nameKey) : item.name);

/**
 * The app's one category picker.
 *
 * Categories are a tree (folders holding entries), so every place that asks the
 * user to pick one renders THIS component — a chip grid that drills through the
 * hierarchy — rather than flattening the tree into a list of its own. See
 * CLAUDE.md ("Category selection"); the call sites are the budget line target
 * picker, the split-operation picker, the operations/quick-add picker and the
 * bank-notification binding panels.
 *
 * Two layouts, selected by whether `topCategoryIds` is supplied:
 *
 * - **Hierarchy (no `topCategoryIds`)**: the current folder level's categories
 *   (folders drill in, a Back chip pops out), three chips across.
 *
 * - **Suggestions (`topCategoryIds` given)**: mirrors the QuickAdd category
 *   picker — an "All categories" entry plus the most-frequent leaf shortcuts,
 *   four across. Tapping "All categories" reveals the parent hierarchy in the
 *   same grid (a Back chip returns to the shortcuts); folders drill in, leaves
 *   select. Used by the notification binding card over the quick-add panel, so
 *   its category picker reads identically to the one right beneath it.
 *
 * @param {Array}    categories        All categories (folders + entries).
 * @param {string}   categoryType      'expense' | 'income' — restricts the grid.
 * @param {string}   selectedCategoryId Currently chosen leaf id (highlighted).
 * @param {string[]} [selectedCategoryIds] Multi-select: presence switches chips to
 *   checkboxes that toggle, and the host is expected to keep the array. Takes
 *   precedence over `selectedCategoryId`.
 * @param {Function} onSelect          Called with the tapped category id.
 * @param {Object}   colors            Theme colours.
 * @param {Function} t                 Translation function.
 * @param {string[]} [topCategoryIds]  Most-frequent-first category ids; presence
 *   switches the grid into the QuickAdd-style suggestions layout.
 * @param {boolean}  [selectableFolders] A folder may be picked as a target in its
 *   own right (a budget on a parent category covers its whole subtree). Tapping
 *   the folder still drills in — inside it, a leading "whole category" chip picks
 *   the folder itself, so navigating and selecting never fight over one tap.
 * @param {string}   [query]           External search text. While it is non-empty
 *   the grid shows every match in the tree instead of one folder level; entering
 *   a folder from a result clears it through `onQueryChange`.
 * @param {Function} [onQueryChange]   Required alongside `query` — the grid clears
 *   the search when navigation takes over.
 * @param {string}   [testIDPrefix]    Chip testID prefix, so a host can keep the
 *   ids its own tests already know.
 * @param {string}   [emptyText]       Message for an empty grid (defaults to
 *   `no_categories`; a fruitless search always says `no_results`).
 */
export default function CategoryGridSelector({
  categories,
  categoryType,
  selectedCategoryId = null,
  selectedCategoryIds = null,
  onSelect,
  colors,
  t,
  topCategoryIds = null,
  selectableFolders = false,
  query = '',
  onQueryChange = null,
  testIDPrefix = DEFAULT_TEST_ID_PREFIX,
  emptyText = null,
}) {
  const suggestMode = Array.isArray(topCategoryIds);
  const multiSelect = Array.isArray(selectedCategoryIds);
  const columns = suggestMode ? SUGGEST_COLUMNS : LEGACY_COLUMNS;
  const searchTerm = String(query || '').trim().toLowerCase();
  const searching = searchTerm.length > 0;

  // Folders drilled into: [{ id, name }]. Empty array = root level.
  const [breadcrumb, setBreadcrumb] = useState([]);
  // In suggestions mode the grid opens on the shortcuts; "All categories" flips
  // it to the hierarchy browser. Otherwise the hierarchy is always shown.
  const [browsing, setBrowsing] = useState(!suggestMode);
  const currentFolder = breadcrumb.length ? breadcrumb[breadcrumb.length - 1] : null;
  const currentFolderId = currentFolder ? currentFolder.id : null;

  const selectedIds = useMemo(() => new Set(
    multiSelect ? selectedCategoryIds : (selectedCategoryId ? [selectedCategoryId] : []),
  ), [multiSelect, selectedCategoryIds, selectedCategoryId]);

  // Non-shadow categories (folders + entries) of the requested type.
  const typed = useMemo(
    () => categories.filter((c) => !c.isShadow && c.categoryType === categoryType),
    [categories, categoryType],
  );

  // Items at the current level (root = no parent, otherwise the folder's children).
  const levelItems = useMemo(
    () => typed.filter((c) => (currentFolderId == null ? !c.parentId : c.parentId === currentFolderId)),
    [typed, currentFolderId],
  );

  // A search reaches across the whole tree — the point of typing is to skip the
  // walk down to a category, so results ignore which folder is open.
  const searchResults = useMemo(
    () => (searching
      ? typed.filter((c) => String(displayName(c, t) || '').toLowerCase().includes(searchTerm))
      : []),
    [searching, typed, searchTerm, t],
  );

  // Leaf entries of this type, used for the suggestions shortcuts and to decide
  // whether an "All categories" entry is warranted (mirrors QuickAdd's >8 rule).
  const typedLeaves = useMemo(() => typed.filter((c) => c.type !== 'folder'), [typed]);
  const showAllButton = typedLeaves.length > 8;

  // The frequency-ordered leaf shortcuts, filled from remaining leaves by natural
  // order when history is short — the same shape as QuickAdd's topCategoriesForType.
  const topCategories = useMemo(() => {
    if (!suggestMode) return [];
    const wanted = showAllButton ? TOP_WITH_ALL : TOP_WITHOUT_ALL;
    const byId = new Map(typedLeaves.map((c) => [c.id, c]));
    const fromHistory = (topCategoryIds || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .slice(0, wanted);
    const historyIds = new Set(fromHistory.map((c) => c.id));
    const fillers = typedLeaves.filter((c) => !historyIds.has(c.id)).slice(0, wanted - fromHistory.length);
    return [...fromHistory, ...fillers];
  }, [suggestMode, showAllButton, typedLeaves, topCategoryIds]);

  const enterFolder = useCallback((folder) => {
    // Navigation takes over from the search: results span every level, so the
    // filter would otherwise hide the very children the tap asked to see.
    if (onQueryChange) onQueryChange('');
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: displayName(folder, t) }]);
  }, [t, onQueryChange]);

  // Back: pop a folder level; at root in suggestions mode, return to the shortcuts.
  const goBack = useCallback(() => {
    setBreadcrumb((prev) => {
      if (prev.length === 0) {
        if (suggestMode) setBrowsing(false);
        return prev;
      }
      return prev.slice(0, -1);
    });
  }, [suggestMode]);

  // Open the hierarchy browser (suggestions mode only) at the root level.
  const openBrowse = useCallback(() => {
    setBreadcrumb([]);
    setBrowsing(true);
  }, []);

  // Select a category. In suggestions mode a pick also collapses the browser back
  // to the shortcuts so the next open starts clean; a multi-select grid stays put,
  // since picking several is the whole point.
  const select = useCallback((id) => {
    onSelect(id);
    if (suggestMode && !multiSelect) {
      setBrowsing(false);
      setBreadcrumb([]);
    }
  }, [onSelect, suggestMode, multiSelect]);

  const chipBackground = colors.inputBackground || colors.surface;
  const selectedBackground = tintOf(colors.primary, colors.selected);

  // Build the slot list for the current view, then chunk into rows and pad the
  // final row with invisible spacers so chips keep an even width.
  const rows = useMemo(() => {
    const slots = [];
    if (searching) {
      searchResults.forEach((item) => slots.push({ kind: 'item', item }));
    } else if (suggestMode && !browsing) {
      if (showAllButton) slots.push({ kind: 'all' });
      topCategories.forEach((item) => slots.push({ kind: 'item', item }));
    } else {
      // Hierarchy browser. Suggestions mode shows a Back chip at every level (root
      // Back returns to the shortcuts); otherwise only inside a folder.
      if (breadcrumb.length > 0 || suggestMode) slots.push({ kind: 'back' });
      if (selectableFolders && currentFolder) slots.push({ kind: 'whole', item: currentFolder });
      levelItems.forEach((item) => slots.push({ kind: 'item', item }));
    }

    const chunked = [];
    for (let i = 0; i < slots.length; i += columns) chunked.push(slots.slice(i, i + columns));
    if (chunked.length) {
      const last = chunked[chunked.length - 1];
      while (last.length < columns) last.push({ kind: 'spacer', id: `spacer-${last.length}` });
    }
    return chunked;
  }, [searching, searchResults, suggestMode, browsing, showAllButton, topCategories,
    breadcrumb.length, selectableFolders, currentFolder, levelItems, columns]);

  // In suggestions mode the grid sits over the quick-add panel, so its chips
  // adopt the compact proportions the quick-add category shortcuts use — shorter,
  // smaller text and icons — to occupy the same vertical space.
  const affixIconSize = suggestMode ? 16 : 18; // "All categories" / Back
  const itemIconSize = suggestMode ? 18 : 20;

  const chipStyle = (extra) => ({ pressed }) => [
    styles.chip,
    suggestMode && styles.chipCompact,
    { backgroundColor: chipBackground, borderColor: colors.border },
    extra,
    pressed && { backgroundColor: colors.selected },
  ];

  const renderSlot = (slot, key) => {
    if (slot.kind === 'spacer') {
      return <View key={key} style={[styles.chip, suggestMode && styles.chipCompact, styles.invisible]} />;
    }

    if (slot.kind === 'all') {
      return (
        <Pressable
          key={key}
          testID={`${testIDPrefix}-all`}
          onPress={openBrowse}
          accessibilityRole="button"
          accessibilityLabel={t('all_categories') || 'All categories'}
          style={chipStyle(null)}
        >
          <Icon name="menu" size={affixIconSize} color={colors.text} />
          <Text style={[styles.chipText, suggestMode && styles.chipTextCompact, { color: colors.text }]} numberOfLines={2}>
            {t('all_categories') || 'All categories'}
          </Text>
        </Pressable>
      );
    }

    if (slot.kind === 'back') {
      return (
        <Pressable
          key={key}
          testID={`${testIDPrefix}-back`}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('back') || 'Back'}
          style={chipStyle(null)}
        >
          <Icon name="arrow-left" size={affixIconSize} color={colors.text} />
          <Text style={[styles.chipText, suggestMode && styles.chipTextCompact, { color: colors.text }]} numberOfLines={1}>
            {t('back') || 'Back'}
          </Text>
        </Pressable>
      );
    }

    // "Whole category": picks the folder you are standing in, so a parent can be
    // a target without stealing the tap that walks into it.
    if (slot.kind === 'whole') {
      const folderId = slot.item.id;
      const isSelected = selectedIds.has(folderId);
      const tone = isSelected ? colors.primary : colors.text;
      return (
        <Pressable
          key={key}
          testID={`${testIDPrefix}-whole-${folderId}`}
          onPress={() => select(folderId)}
          accessibilityRole={multiSelect ? 'checkbox' : 'button'}
          accessibilityState={multiSelect ? { checked: isSelected } : { selected: isSelected }}
          accessibilityLabel={`${t('whole_category') || 'Whole category'}: ${slot.item.name}`}
          style={chipStyle(isSelected && { backgroundColor: selectedBackground, borderColor: colors.primary })}
        >
          <Icon name="select-all" size={itemIconSize} color={tone} />
          <Text style={[styles.chipText, suggestMode && styles.chipTextCompact, { color: tone }]} numberOfLines={2}>
            {t('whole_category') || 'Whole category'}
          </Text>
          {isSelected && (
            <View style={styles.checkBadge}>
              <Icon name="check-circle" size={12} color={colors.primary} />
            </View>
          )}
        </Pressable>
      );
    }

    const { item } = slot;
    const isFolder = item.type === 'folder';
    const isSelected = selectedIds.has(item.id);
    const name = displayName(item, t);
    const tone = isSelected ? colors.primary : colors.text;

    return (
      <Pressable
        key={key}
        testID={`${testIDPrefix}-${item.id}`}
        onPress={() => (isFolder ? enterFolder(item) : select(item.id))}
        accessibilityRole={multiSelect && !isFolder ? 'checkbox' : 'button'}
        accessibilityState={multiSelect && !isFolder ? { checked: isSelected } : { selected: isSelected }}
        style={chipStyle(isSelected && { backgroundColor: selectedBackground, borderColor: colors.primary })}
      >
        <Icon name={item.icon || (isFolder ? 'folder' : 'tag')} size={itemIconSize} color={tone} />
        <Text style={[styles.chipText, suggestMode && styles.chipTextCompact, { color: tone }]} numberOfLines={2}>
          {name}
        </Text>
        {isFolder && (
          <View style={styles.folderBadge}>
            <Icon name="folder-outline" size={11} color={colors.mutedText} />
          </View>
        )}
        {isSelected && (
          <View style={styles.checkBadge}>
            <Icon name="check-circle" size={12} color={colors.primary} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.grid}>
      {/* Where you are, once you are anywhere but the root — a Back chip alone
          says there is a way out, not what you walked into. */}
      {!searching && breadcrumb.length > 0 && (
        <Text
          testID={`${testIDPrefix}-breadcrumb`}
          style={[styles.breadcrumb, { color: colors.mutedText }]}
          numberOfLines={1}
        >
          {breadcrumb.map((crumb) => crumb.name).join(' › ')}
        </Text>
      )}
      {rows.length === 0 ? (
        <Text testID={`${testIDPrefix}-empty`} style={[styles.empty, { color: colors.mutedText }]}>
          {searching
            ? (t('no_results') || 'Nothing found')
            : (emptyText || t('no_categories') || 'No categories yet.')}
        </Text>
      ) : (
        rows.map((row, ri) => (
          <View key={`row-${ri}`} style={styles.row}>
            {row.map((slot) => {
              const key = slot.kind === 'item'
                ? `item-${slot.item.id}`
                : slot.kind === 'spacer'
                  ? slot.id
                  : `${slot.kind}-${ri}`;
              return renderSlot(slot, key);
            })}
          </View>
        ))
      )}
    </View>
  );
}

CategoryGridSelector.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    nameKey: PropTypes.string,
    type: PropTypes.string,
    categoryType: PropTypes.string,
    parentId: PropTypes.string,
    icon: PropTypes.string,
    isShadow: PropTypes.oneOfType([PropTypes.bool, PropTypes.number]),
  })).isRequired,
  categoryType: PropTypes.oneOf(['expense', 'income']).isRequired,
  selectedCategoryId: PropTypes.string,
  selectedCategoryIds: PropTypes.arrayOf(PropTypes.string),
  onSelect: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  topCategoryIds: PropTypes.arrayOf(PropTypes.string),
  selectableFolders: PropTypes.bool,
  query: PropTypes.string,
  onQueryChange: PropTypes.func,
  testIDPrefix: PropTypes.string,
  emptyText: PropTypes.string,
};

const styles = StyleSheet.create({
  breadcrumb: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    paddingHorizontal: SPACING.xs,
  },
  checkBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
  },
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
    position: 'relative',
  },
  // Matches the quick-add category shortcut proportions so the grid reads at the
  // same height when laid over the quick-add panel.
  chipCompact: {
    gap: 0,
    minHeight: 48,
    paddingVertical: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  chipTextCompact: {
    fontSize: FONT_SIZE.xs,
  },
  empty: {
    fontSize: FONT_SIZE.md,
    paddingVertical: SPACING.md,
    textAlign: 'center',
  },
  folderBadge: {
    left: 4,
    position: 'absolute',
    top: 4,
  },
  grid: {
    gap: SPACING.xs,
  },
  invisible: {
    opacity: 0,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
});
