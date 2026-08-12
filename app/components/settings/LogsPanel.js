import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useLogEntries } from '../../hooks/useLogEntries';
import EmptyState from '../EmptyState';
import { BADGE, BADGE_TEXT, CHIP, CHIP_TEXT } from '../../styles/componentStyles';
import { DESTRUCTIVE } from '../../styles/semanticColors';
import { FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';
import { EMPTY_CONTAINER, FLEX_LIST } from './settingsPanelStyles';

// Log severity is a categorical scale, fixed across both themes like
// chartPalette — only its red is pinned to the app's one red.
const LOG_LEVEL_COLORS = {
  error: DESTRUCTIVE.light,
  warn: '#fb8c00',
  info: '#1e88e5',
  debug: '#757575',
};

const LOG_FILTERS = ['all', 'error', 'warn', 'info', 'debug'];

// Badge background on a selected (primary-filled) filter chip — translucent
// white so the count reads on the blue fill.
const SELECTED_BADGE_BG = 'rgba(255,255,255,0.3)';

// The developer log viewer: a severity filter strip over a chat-style list.
// The list is inverted with the entries reversed, so the newest is item[0] and
// lands at the bottom without a scroll call, and without paying to render every
// entry on mount.
export default function LogsPanel({ bottomInset }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const [logFilter, setLogFilter] = useState('all');
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const { entries, counts, clearLogs, getExportText } = useLogEntries(logFilter);

  const handleShareLogs = useCallback(async () => {
    try {
      const text = getExportText();
      const date = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `penny-logs-${date}.txt`);
      file.write(text);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
    } catch (error) {
      console.error('Share logs error:', error);
    }
  }, [getExportText]);

  const handleClearLogs = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  const toggleLogExpand = useCallback((id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderLogEntry = useCallback(({ item }) => {
    const isExpanded = expandedLogIds.has(item.id);
    const levelColor = LOG_LEVEL_COLORS[item.level];
    // Tint the row background for the two levels that warrant attention so they
    // stand out while scanning a wall of info/debug lines. `20` = ~12% alpha.
    const rowBackground = item.level === 'error' || item.level === 'warn'
      ? `${levelColor}20`
      : 'transparent';
    return (
      <TouchableOpacity
        onPress={() => toggleLogExpand(item.id)}
        onLongPress={() => Clipboard.setStringAsync(`${item.timestamp} [${item.level.toUpperCase()}] ${item.message}`)}
        activeOpacity={0.7}
        style={[
          styles.logEntry,
          { borderLeftColor: levelColor, borderBottomColor: colors.border, backgroundColor: rowBackground },
        ]}
      >
        <Text style={[styles.logTimestamp, { color: colors.mutedText }]}>
          {isExpanded ? item.timestamp.substring(0, 19).replace('T', ' ') : item.timestamp.substring(11, 19)}
        </Text>
        <Text style={[styles.logLevel, { color: levelColor }]}>
          {item.level.toUpperCase()}
        </Text>
        <Text style={[styles.logMessage, { color: colors.text }]} numberOfLines={isExpanded ? undefined : 3}>
          {item.message}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, expandedLogIds, toggleLogExpand]);

  return (
    <>
      <View style={styles.filterRow}>
        {LOG_FILTERS.map(f => {
          const isSelected = f === logFilter;
          const filterLabelKey = `log_level_${f}`;
          const label = t(filterLabelKey) || f;
          // Badge every level chip that has entries (skip "all"); the
          // absence of a badge on Error/Warn reads as "none", so a
          // zero count needs no badge.
          const count = f === 'all' ? 0 : (counts?.[f] || 0);
          const badgeColor = f === 'error' || f === 'warn' ? LOG_LEVEL_COLORS[f] : colors.mutedText;
          const badgeBackground = isSelected ? SELECTED_BADGE_BG : `${badgeColor}26`;
          const badgeTextColor = isSelected ? '#fff' : badgeColor;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setLogFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
              style={[
                styles.filterChip,
                { borderColor: colors.border },
                isSelected && { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[
                styles.filterChipText,
                isSelected ? styles.filterChipTextSelected : { color: colors.text },
              ]}>
                {label}
              </Text>
              {count > 0 && (
                <View style={[
                  styles.filterChipBadge,
                  { backgroundColor: badgeBackground },
                ]}>
                  <Text style={[
                    styles.filterChipBadgeText,
                    { color: badgeTextColor },
                  ]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={entries.slice().reverse()}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderLogEntry}
        style={styles.flexList}
        inverted
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        contentContainerStyle={entries.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <EmptyState message={t('no_logs') || 'No logs yet'} />
        }
      />

      <Divider />

      <View style={[styles.logsActionBar, { paddingBottom: bottomInset }]}>
        <TouchableOpacity onPress={handleShareLogs} style={styles.logsActionButton}>
          <Ionicons name="share-outline" size={20} color={colors.primary} />
          <Text style={[styles.logsActionText, { color: colors.primary }]}>
            {t('share_logs') || 'Share Logs'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClearLogs} style={styles.logsActionButton}>
          <Ionicons name="trash-outline" size={20} color={LOG_LEVEL_COLORS.error} />
          <Text style={[styles.logsActionText, { color: colors.destructive }]}>
            {t('clear_logs') || 'Clear Logs'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

LogsPanel.propTypes = {
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  emptyContainer: EMPTY_CONTAINER,
  filterChip: CHIP,
  filterChipBadge: BADGE,
  filterChipBadgeText: BADGE_TEXT,
  filterChipText: CHIP_TEXT,
  filterChipTextSelected: {
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.sm,
  },
  flexList: FLEX_LIST,
  logEntry: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    flexDirection: 'row',
    // 6 sits between SPACING.xs and .sm on purpose: these are dense monospace
    // log rows, and either token reads wrong at this size.
    gap: 6,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingLeft: HORIZONTAL_PADDING - 3,
    paddingVertical: 6,
  },
  logLevel: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
    width: 42,
  },
  logMessage: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  logTimestamp: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  logsActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
  },
  logsActionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logsActionText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
});
