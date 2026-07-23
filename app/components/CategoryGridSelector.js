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

/**
 * Inline hierarchical category grid.
 *
 * Two layouts, selected by whether `topCategoryIds` is supplied:
 *
 * - **Legacy (no `topCategoryIds`)**: a flat grid of the current folder level's
 *   categories (folders drill in, a Back chip pops out), three chips across.
 *   Used by the Settings → Notification processing review queue.
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
 * @param {Function} onSelect          Called with the tapped leaf category id.
 * @param {Object}   colors            Theme colours.
 * @param {Function} t                 Translation function.
 * @param {string[]} [topCategoryIds]  Most-frequent-first category ids; presence
 *   switches the grid into the QuickAdd-style suggestions layout.
 */
export default function CategoryGridSelector({
  categories,
  categoryType,
  selectedCategoryId = null,
  onSelect,
  colors,
  t,
  topCategoryIds = null,
}) {
  const suggestMode = Array.isArray(topCategoryIds);
  const columns = suggestMode ? SUGGEST_COLUMNS : LEGACY_COLUMNS;

  // Folders drilled into: [{ id, name }]. Empty array = root level.
  const [breadcrumb, setBreadcrumb] = useState([]);
  // In suggestions mode the grid opens on the shortcuts; "All categories" flips
  // it to the hierarchy browser. In legacy mode the hierarchy is always shown.
  const [browsing, setBrowsing] = useState(!suggestMode);
  const currentFolderId = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].id : null;

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
    const name = folder.nameKey ? t(folder.nameKey) : folder.name;
    setBreadcrumb((prev) => [...prev, { id: folder.id, name }]);
  }, [t]);

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

  // Select a leaf; in suggestions mode also collapse the browser back to the
  // shortcuts so the next open starts clean.
  const selectLeaf = useCallback((id) => {
    onSelect(id);
    if (suggestMode) {
      setBrowsing(false);
      setBreadcrumb([]);
    }
  }, [onSelect, suggestMode]);

  const chipBackground = colors.inputBackground || colors.surface;

  // Build the slot list for the current view, then chunk into rows and pad the
  // final row with invisible spacers so chips keep an even width.
  const rows = useMemo(() => {
    const slots = [];
    if (suggestMode && !browsing) {
      if (showAllButton) slots.push({ kind: 'all' });
      topCategories.forEach((item) => slots.push({ kind: 'item', item }));
    } else {
      // Hierarchy browser (legacy always, or suggestions after "All categories").
      // Suggestions mode shows a Back chip at every level (root Back returns to
      // the shortcuts); legacy only inside a folder.
      if (breadcrumb.length > 0 || suggestMode) slots.push({ kind: 'back' });
      levelItems.forEach((item) => slots.push({ kind: 'item', item }));
    }

    const chunked = [];
    for (let i = 0; i < slots.length; i += columns) chunked.push(slots.slice(i, i + columns));
    if (chunked.length) {
      const last = chunked[chunked.length - 1];
      while (last.length < columns) last.push({ kind: 'spacer', id: `spacer-${last.length}` });
    }
    return chunked;
  }, [suggestMode, browsing, showAllButton, topCategories, breadcrumb.length, levelItems, columns]);

  // In suggestions mode the grid sits over the quick-add panel, so its chips
  // adopt the compact proportions the quick-add category shortcuts use — shorter,
  // smaller text and icons — to occupy the same vertical space.
  const affixIconSize = suggestMode ? 16 : 18; // "All categories" / Back
  const itemIconSize = suggestMode ? 18 : 20;

  const renderSlot = (slot, key) => {
    if (slot.kind === 'spacer') {
      return <View key={key} style={[styles.chip, suggestMode && styles.chipCompact, styles.invisible]} />;
    }

    if (slot.kind === 'all') {
      return (
        <Pressable
          key={key}
          testID="category-grid-all"
          onPress={openBrowse}
          accessibilityRole="button"
          accessibilityLabel={t('all_categories') || 'All categories'}
          style={({ pressed }) => [
            styles.chip,
            suggestMode && styles.chipCompact,
            { backgroundColor: chipBackground, borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
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
          testID="category-grid-back"
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('back') || 'Back'}
          style={({ pressed }) => [
            styles.chip,
            suggestMode && styles.chipCompact,
            { backgroundColor: chipBackground, borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <Icon name="arrow-left" size={affixIconSize} color={colors.text} />
          <Text style={[styles.chipText, suggestMode && styles.chipTextCompact, { color: colors.text }]} numberOfLines={1}>
            {t('back') || 'Back'}
          </Text>
        </Pressable>
      );
    }

    const { item } = slot;
    const isFolder = item.type === 'folder';
    const isSelected = !isFolder && selectedCategoryId === item.id;
    const name = item.nameKey ? t(item.nameKey) : item.name;
    const textColor = isSelected ? '#ffffff' : colors.text;

    return (
      <Pressable
        key={key}
        testID={`category-grid-${item.id}`}
        onPress={() => (isFolder ? enterFolder(item) : selectLeaf(item.id))}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        style={({ pressed }) => [
          styles.chip,
          suggestMode && styles.chipCompact,
          {
            backgroundColor: isSelected ? colors.primary : chipBackground,
            borderColor: isSelected ? colors.primary : colors.border,
          },
          pressed && !isSelected && { backgroundColor: colors.selected },
        ]}
      >
        <Icon name={item.icon || (isFolder ? 'folder' : 'tag')} size={itemIconSize} color={textColor} />
        <Text style={[styles.chipText, suggestMode && styles.chipTextCompact, { color: textColor }]} numberOfLines={2}>
          {name}
        </Text>
        {isFolder && (
          <View style={styles.folderBadge}>
            <Icon name="folder-outline" size={11} color={colors.mutedText} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.grid}>
      {rows.length === 0 ? (
        <Text testID="category-grid-empty" style={[styles.empty, { color: colors.mutedText }]}>
          {t('no_categories') || 'No categories yet.'}
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
  onSelect: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  topCategoryIds: PropTypes.arrayOf(PropTypes.string),
};

const styles = StyleSheet.create({
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
    position: 'absolute',
    right: 4,
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
