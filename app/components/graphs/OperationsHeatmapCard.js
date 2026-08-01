import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import HeatmapMapModal from './HeatmapMapModal';
import { CARD_SURFACE } from '../../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';

/**
 * Collapsed Graphs row for the operations location heatmap.
 *
 * Deliberately inert until tapped: no DB query, no tile traffic, no map math —
 * the fullscreen HeatmapMapModal is not even mounted. Everything loads only
 * when the user opens it, which is the whole point of the row.
 */
const OperationsHeatmapCard = ({
  colors,
  t,
  selectedYear,
  selectedMonth,
  periodLabel,
}) => {
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handleOpen}
        activeOpacity={0.7}
        testID="operations-heatmap-card"
        accessibilityRole="button"
        accessibilityLabel={t('graphs_map_title')}
        accessibilityHint={t('graphs_map_hint')}
      >
        <View style={[styles.iconBadge, { backgroundColor: colors.selected }]}>
          <Icon name="map-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.textColumn}>
          <Text style={[styles.title, { color: colors.text }]}>{t('graphs_map_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]} numberOfLines={1}>
            {t('graphs_map_hint')}
          </Text>
        </View>
        <Icon name="chevron-right" size={24} color={colors.mutedText} />
      </TouchableOpacity>

      {open && (
        <HeatmapMapModal
          visible
          onClose={handleClose}
          colors={colors}
          t={t}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          periodLabel={periodLabel}
        />
      )}
    </>
  );
};

OperationsHeatmapCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedYear: PropTypes.number.isRequired,
  selectedMonth: PropTypes.number,
  periodLabel: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  card: {
    ...CARD_SURFACE,
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: 16,
    padding: 16,
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default OperationsHeatmapCard;
