import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import RowActionMenu, { NO_ACTIONS } from '../RowActionMenu';
import { getCategoryNames } from '../../utils/categoryUtils';
import { parseLabels, visibleListLabels, displayLabel, BALANCE_ADJUST_PREFIX } from '../../utils/labelUtils';

// The labels worth searching by: the ones the row itself shows, minus the
// legacy "Balance adjusted from <a> → <b>" chain, which names one correction and
// would only ever find itself.
export const searchableLabels = (description) => {
  const adjustPrefix = BALANCE_ADJUST_PREFIX.toLowerCase();
  return visibleListLabels(parseLabels(description))
    .filter((label) => !label.toLowerCase().startsWith(adjustPrefix));
};

/**
 * Context action menu shown on long-pressing an operation row.
 *
 * The lift-and-blur presentation lives in RowActionMenu, which every long-press
 * menu in the app shares; this component is the operation-specific action list:
 * edit, repeat, hide-from-charts (expense/income only — see below) and delete.
 *
 * Under the actions sits a "Find by" line: the operation's category and each of
 * its labels as a chip. A chip searches the list for everything sharing it; the
 * host decides what that search is (see OperationsScreen's handleFindBy*).
 *
 * The parent owns visibility: pass a `menu` object to open, `null` to close.
 */
export default function OperationActionMenu({
  menu,
  colors,
  t,
  categories = [],
  onClose,
  onEdit,
  onRepeat,
  onToggleCharts,
  onDelete,
  onFindByCategory,
  onFindByLabel,
}) {
  // Transfers feed no chart, so the hide/show action would be a no-op for them.
  // Balance adjustments DO get it: they have no editable form, which makes this
  // menu their only way to leave the charts.
  const operationType = menu?.operation?.type;
  const showChartsAction = operationType === 'expense' || operationType === 'income';
  const hiddenFromCharts = !!menu?.operation?.excludeFromCharts;

  // Memoized (and NO_ACTIONS while closed) because RowActionMenu is memoized: a
  // fresh array per render of the screen would miss its compare every time.
  const actions = useMemo(() => (menu ? [
    { key: 'edit', icon: 'pencil', label: t('edit'), onPress: onEdit },
    { key: 'repeat', icon: 'repeat', label: t('repeat'), onPress: onRepeat },
    ...(showChartsAction ? [{
      key: 'charts',
      icon: hiddenFromCharts ? 'eye-outline' : 'eye-off-outline',
      // Short label — four buttons share the row width. The full phrase goes to
      // the accessibility label.
      label: hiddenFromCharts ? t('show_in_charts') : t('hide_from_charts'),
      a11yLabel: hiddenFromCharts ? t('include_in_charts') : t('exclude_from_charts'),
      tone: hiddenFromCharts ? 'muted' : undefined,
      onPress: onToggleCharts,
    }] : []),
    { key: 'delete', icon: 'trash-can-outline', label: t('delete'), tone: 'destructive', onPress: onDelete },
  ] : NO_ACTIONS), [menu, t, onEdit, onRepeat, onToggleCharts, onDelete, showChartsAction, hiddenFromCharts]);

  // The category first (every expense and income has one), then the labels in
  // the order the row shows them. A transfer has no category; a category that
  // no longer resolves (deleted under the row) offers nothing to search by.
  // Memoized for the same reason as `actions`.
  const chipRow = useMemo(() => {
    const operation = menu?.operation;
    if (!operation) return null;
    const chips = [];

    if (onFindByCategory && operation.type !== 'transfer' && operation.categoryId) {
      const category = categories.find((cat) => cat.id === operation.categoryId);
      if (category) {
        const { categoryName } = getCategoryNames(operation.categoryId, categories, t);
        chips.push({
          key: 'category',
          label: categoryName,
          icon: category.icon || 'shape-outline',
          a11yLabel: t('find_by_category_a11y').replace('{name}', categoryName),
          onPress: () => onFindByCategory(operation.categoryId),
        });
      }
    }

    if (onFindByLabel) {
      for (const label of searchableLabels(operation.description)) {
        const text = displayLabel(label);
        chips.push({
          key: `label-${label}`,
          label: text,
          icon: 'tag-outline',
          a11yLabel: t('find_by_label_a11y').replace('{name}', text),
          onPress: () => onFindByLabel(label),
        });
      }
    }

    return chips.length > 0 ? { title: t('find_by'), chips } : null;
  }, [menu, categories, t, onFindByCategory, onFindByLabel]);

  return (
    <RowActionMenu
      menu={menu}
      actions={actions}
      chipRow={chipRow}
      colors={colors}
      onClose={onClose}
      testIDPrefix="operation-action"
    />
  );
}

OperationActionMenu.propTypes = {
  menu: PropTypes.shape({
    // Carries `type` and `excludeFromCharts`, which decide whether the
    // hide/show-in-charts action is offered and which way it points, plus the
    // `categoryId` and `description` (labels) the "Find by" chips name.
    operation: PropTypes.object,
    layout: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    row: PropTypes.node,
  }),
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  categories: PropTypes.arrayOf(PropTypes.object),
  onClose: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onRepeat: PropTypes.func.isRequired,
  onToggleCharts: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  // Search the list for the operation's category / one of its labels. Either
  // omitted, its chips are not offered.
  onFindByCategory: PropTypes.func,
  onFindByLabel: PropTypes.func,
};
