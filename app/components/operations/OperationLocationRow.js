import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

/**
 * OperationLocationRow — compact inline row for an operation's attached location.
 *
 * Rendered near the LabelInput only when the "attach location" preference is on.
 * Follows the app's inline-feedback conventions: no nested modal, no dialog.
 * States:
 *  - capturing: spinner + "Getting location…"
 *  - ready: map-pin + "lat, lng" (display-rounded to 4 dp) + a ✕ to remove
 *  - idle/denied/error: a muted "Add location" button that (re)triggers capture
 *
 * Coordinates are display-rounded only; the full-precision values are stored.
 */
const round4 = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(4) : null;
};

const OperationLocationRow = ({ status, location, onCapture, onClear, colors, t }) => {
  const coordText = useMemo(() => {
    if (!location) return null;
    const lat = round4(location.latitude);
    const lng = round4(location.longitude);
    return lat != null && lng != null ? `${lat}, ${lng}` : null;
  }, [location]);

  if (status === 'capturing') {
    return (
      <View
        style={[styles.row, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
        testID="operation-location-row"
      >
        <ActivityIndicator size="small" color={colors.mutedText} />
        <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={1}>
          {t('getting_location') || 'Getting location…'}
        </Text>
      </View>
    );
  }

  if (status === 'ready' && coordText) {
    return (
      <View
        style={[styles.row, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
        testID="operation-location-row"
      >
        <Icon name="map-marker" size={18} color={colors.primary} />
        <Text style={[styles.text, styles.coords, { color: colors.text }]} numberOfLines={1}>
          {coordText}
        </Text>
        <Pressable
          onPress={onClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('remove_location') || 'Remove location'}
          testID="operation-location-remove"
        >
          <Icon name="close" size={16} color={colors.mutedText} />
        </Pressable>
      </View>
    );
  }

  // idle / denied / error → offer a (re)capture affordance.
  return (
    <Pressable
      style={[styles.row, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
      onPress={onCapture}
      accessibilityRole="button"
      accessibilityLabel={t('add_location') || 'Add location'}
      testID="operation-location-add"
    >
      <Icon name="map-marker-plus" size={18} color={colors.mutedText} />
      <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={1}>
        {status === 'denied'
          ? (t('location_permission_denied') || 'Location permission denied. Enable it in system settings.')
          : (t('add_location') || 'Add location')}
      </Text>
    </Pressable>
  );
};

OperationLocationRow.propTypes = {
  status: PropTypes.oneOf(['idle', 'capturing', 'ready', 'denied', 'error']).isRequired,
  location: PropTypes.shape({
    latitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    longitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  onCapture: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  coords: {
    flex: 1,
  },
  row: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  text: {
    fontSize: 14,
  },
});

export default OperationLocationRow;
