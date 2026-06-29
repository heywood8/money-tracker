import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { SPACING, BORDER_RADIUS, FONT_SIZE } from '../styles/designTokens';

const COLUMNS = 3;

/**
 * Inline hierarchical category grid.
 *
 * The same chip-grid browser the QuickAdd panel uses, lifted into a standalone
 * component so other surfaces (e.g. the notification review queue) can pick a
 * category without a flat dropdown. Categories at the current folder level are
 * laid out as a grid of icon chips: folders drill in (a Back chip pops out),
 * leaf entries select. The selected leaf is highlighted, and the folder the
 * user drills through supplies the parent context a flat list never showed.
 *
 * @param {Array}    categories        All categories (folders + entries).
 * @param {string}   categoryType      'expense' | 'income' — restricts the grid.
 * @param {string}   selectedCategoryId Currently chosen leaf id (highlighted).
 * @param {Function} onSelect          Called with the tapped leaf category id.
 * @param {Object}   colors            Theme colours.
 * @param {Function} t                 Translation function.
 */
export default function CategoryGridSelector({
  categories,
  categoryType,
  selectedCategoryId,
  onSelect,
  colors,
  t,
}) {
  // Folders drilled into: [{ id, name }]. Empty array = root level.
  const [breadcrumb, setBreadcrumb] = useState([]);
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

  const enterFolder = useCallback((folder) => {
    const name = folder.nameKey ? t(folder.nameKey) : folder.name;
    setBreadcrumb((prev) => [...prev, { id: folder.id, name }]);
  }, [t]);

  const goBack = useCallback(() => {
    setBreadcrumb((prev) => prev.slice(0, -1));
  }, []);

  // Build the slot list: a Back chip (only inside a folder) followed by the
  // level's categories, then pad the final row with invisible spacers so chips
  // keep an even width regardless of how many fill the last row.
  const rows = useMemo(() => {
    const slots = [];
    if (breadcrumb.length > 0) slots.push({ kind: 'back' });
    levelItems.forEach((item) => slots.push({ kind: 'item', item }));

    const chunked = [];
    for (let i = 0; i < slots.length; i += COLUMNS) chunked.push(slots.slice(i, i + COLUMNS));
    if (chunked.length) {
      const last = chunked[chunked.length - 1];
      while (last.length < COLUMNS) last.push({ kind: 'spacer', id: `spacer-${last.length}` });
    }
    return chunked;
  }, [breadcrumb.length, levelItems]);

  const chipBackground = colors.inputBackground || colors.surface;

  const renderSlot = (slot, key) => {
    if (slot.kind === 'spacer') {
      return <View key={key} style={[styles.chip, styles.invisible]} />;
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
            { backgroundColor: chipBackground, borderColor: colors.border },
            pressed && { backgroundColor: colors.selected },
          ]}
        >
          <Icon name="arrow-left" size={18} color={colors.text} />
          <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
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
        onPress={() => (isFolder ? enterFolder(item) : onSelect(item.id))}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: isSelected ? colors.primary : chipBackground,
            borderColor: isSelected ? colors.primary : colors.border,
          },
          pressed && !isSelected && { backgroundColor: colors.selected },
        ]}
      >
        <Icon name={item.icon || (isFolder ? 'folder' : 'tag')} size={20} color={textColor} />
        <Text style={[styles.chipText, { color: textColor }]} numberOfLines={2}>
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
            {row.map((slot, ci) => {
              const key = slot.kind === 'item'
                ? `item-${slot.item.id}`
                : slot.kind === 'spacer'
                  ? slot.id
                  : `back-${ri}`;
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
};

CategoryGridSelector.defaultProps = {
  selectedCategoryId: null,
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
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
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
