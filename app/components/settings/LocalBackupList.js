import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import EmptyState from '../EmptyState';
import { FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';
import { EMPTY_CONTAINER, FLEX_LIST } from './settingsPanelStyles';

// Backups are named by how they were made — `daily_2026-08-01`,
// `weekly_2026-31`, `manual_2026-08-01_10-30` — and the filename is not what a
// person wants to read. Turn it into a date they recognise, falling back to the
// raw name for anything that does not match a known shape.
export function formatBackupLabel(filename, t = (k) => k) {
  const asDate = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  if (filename.startsWith('daily_')) {
    const [year, month, day] = filename.replace('daily_', '').replace('.json', '').split('-').map(Number);
    return asDate(year, month, day);
  }
  if (filename.startsWith('weekly_')) {
    const [year, weekPart] = filename.replace('weekly_', '').replace('.json', '').split('-');
    return `${t('weekly') || 'Weekly'} ${weekPart}, ${year}`;
  }
  if (filename.startsWith('manual_')) {
    const [datePart, timePart] = filename.replace('manual_', '').replace('.json', '').split('_');
    if (datePart) {
      const [year, month, day] = datePart.split('-').map(Number);
      const dateLabel = asDate(year, month, day);
      if (timePart) {
        const [hh, mm] = timePart.split('-');
        return `${dateLabel} · ${hh}:${mm}`;
      }
      return dateLabel;
    }
  }
  return filename;
}

// The stored local backups, each offering restore and delete. Delete confirms
// in place — the row turns into "Delete this backup?" with cancel/delete —
// rather than opening a dialog over a list the user is scanning.
export default function LocalBackupList({ backups, loading, onRestore, onDelete, bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const [pendingDeleteUri, setPendingDeleteUri] = useState(null);

  const renderItem = useCallback(({ item }) => {
    const isDaily = item.filename.startsWith('daily_');
    const isManual = item.filename.startsWith('manual_');
    const label = formatBackupLabel(item.filename, t);
    const typeLabel = isDaily ? 'Daily' : isManual ? 'Manual' : (t('weekly') || 'Weekly');
    const sizeKB = item.size ? `${(item.size / 1024).toFixed(1)} KB` : '';
    const isPending = pendingDeleteUri === item.uri;
    return (
      <View style={[styles.backupItem, { borderBottomColor: colors.border }]}>
        <View style={styles.backupItemLeft}>
          <Ionicons
            name={isDaily ? 'calendar-outline' : isManual ? 'save-outline' : 'calendar-number-outline'}
            size={22}
            color={isPending ? colors.mutedText : colors.text}
          />
          <View style={styles.backupItemText}>
            <Text style={[styles.backupItemLabel, { color: isPending ? colors.mutedText : colors.text }]}>{label}</Text>
            <Text style={[styles.backupItemMeta, { color: colors.mutedText }]}>
              {isPending ? (t('delete_backup_confirm') || 'Delete this backup?') : `${typeLabel}${sizeKB ? ` · ${sizeKB}` : ''}`}
            </Text>
          </View>
        </View>
        <View style={styles.backupItemActions}>
          {isPending ? (
            <>
              <TouchableOpacity onPress={() => setPendingDeleteUri(null)} style={styles.backupConfirmButton}>
                <Text style={[styles.backupConfirmButtonText, { color: colors.mutedText }]}>{t('cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setPendingDeleteUri(null); onDelete(item.uri); }}
                style={styles.backupConfirmButton}
              >
                <Text style={[styles.backupConfirmButtonDestructiveText, { color: colors.destructive }]}>{t('delete') || 'Delete'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => onRestore(item)} style={styles.backupActionButton}>
                <Ionicons name="refresh-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPendingDeleteUri(item.uri)} style={styles.backupActionButton}>
                <Ionicons name="trash-outline" size={18} color={colors.destructive} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }, [colors, t, onRestore, onDelete, pendingDeleteUri]);

  if (loading) {
    return <EmptyState message={'Loading...'} style={styles.emptyContainer} />;
  }

  return (
    <FlatList
      data={backups}
      keyExtractor={(item) => item.uri}
      renderItem={renderItem}
      style={styles.flexList}
      contentContainerStyle={[
        backups.length === 0 && styles.emptyContainer,
        { paddingBottom: bottomInset },
      ]}
      ListEmptyComponent={
        <EmptyState message={t('local_backups_empty') || 'No local backups yet'} />
      }
    />
  );
}

LocalBackupList.propTypes = {
  backups: PropTypes.arrayOf(PropTypes.shape({
    uri: PropTypes.string.isRequired,
    filename: PropTypes.string.isRequired,
    size: PropTypes.number,
  })).isRequired,
  loading: PropTypes.bool,
  onRestore: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  backupActionButton: {
    padding: 6,
  },
  backupConfirmButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backupConfirmButtonDestructiveText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  backupConfirmButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  backupItem: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
  backupItemActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  backupItemLabel: {
    fontSize: 15,
  },
  backupItemLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  backupItemMeta: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  backupItemText: {
    flex: 1,
  },
  emptyContainer: EMPTY_CONTAINER,
  flexList: FLEX_LIST,
});
