import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import RowActionMenu, { NO_ACTIONS } from '../RowActionMenu';

/**
 * Context action menu shown on long-pressing an operation row.
 *
 * The lift-and-blur presentation lives in RowActionMenu, which every long-press
 * menu in the app shares; this component is the operation-specific action list:
 * edit, repeat, hide-from-charts (expense/income only — see below) and delete.
 *
 * The parent owns visibility: pass a `menu` object to open, `null` to close.
 */
export default function OperationActionMenu({ menu, colors, t, onClose, onEdit, onRepeat, onToggleCharts, onDelete }) {
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

  return (
    <RowActionMenu
      menu={menu}
      actions={actions}
      colors={colors}
      onClose={onClose}
      testIDPrefix="operation-action"
    />
  );
}

OperationActionMenu.propTypes = {
  menu: PropTypes.shape({
    // Carries `type` and `excludeFromCharts`, which decide whether the
    // hide/show-in-charts action is offered and which way it points.
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
  onClose: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onRepeat: PropTypes.func.isRequired,
  onToggleCharts: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
