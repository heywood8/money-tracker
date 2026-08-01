import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Canvas, Circle, Group, BlurMask } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOperationCoordinates } from '../../services/OperationsDB';
import { getTileUri, pruneTileCache } from '../../services/MapTileCache';
import { formatDate } from '../../services/BalanceHistoryDB';
import {
  visibleTiles,
  pointToScreen,
  fitBounds,
  translateRegion,
  scaleRegion,
} from '../../utils/mapProjection';

// Fallback view when there is nothing to fit — the whole world.
const WORLD_REGION = { latitude: 20, longitude: 0, zoom: 2 };

// Heat blob look. Density comes from overlap: each operation is one
// semi-transparent blob, so clusters saturate toward opaque. The color is
// theme-independent like the chart accents (see ExpenseSummaryCard).
const HEAT_RADIUS = 16;
const HEAT_BLUR = 14;
const HEAT_COLOR = 'rgba(233, 30, 99, 0.35)';
// Rendering cap — a pathological all-time set must not sink the Skia canvas.
const MAX_HEAT_POINTS = 4000;
// Blobs just off-screen still bleed their blur into view, so keep a margin.
const HEAT_MARGIN = HEAT_RADIUS + HEAT_BLUR;

/**
 * One raster tile. Resolves its cached-or-downloaded file URI lazily; renders
 * nothing (theme background shows through) until the tile is available.
 * Memoized so panning only re-renders position styles, not the resolution.
 */
const MapTile = React.memo(function MapTile({ z, x, y, screenX, screenY, size }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getTileUri(z, x, y).then((resolved) => {
      if (!cancelled && resolved) setUri(resolved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [z, x, y]);

  if (!uri) return null;
  // floor + 1px bleed hides hairline seams between fractionally-scaled tiles.
  const left = Math.floor(screenX);
  const top = Math.floor(screenY);
  const edge = Math.ceil(size) + 1;
  return (
    <Image
      source={{ uri }}
      style={[styles.tile, { height: edge, left, top, width: edge }]}
      fadeDuration={0}
    />
  );
});

MapTile.propTypes = {
  z: PropTypes.number.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  screenX: PropTypes.number.isRequired,
  screenY: PropTypes.number.isRequired,
  size: PropTypes.number.isRequired,
};

/**
 * Fullscreen pannable/zoomable heatmap of operation locations.
 *
 * Mounted only when opened (see OperationsHeatmapCard), so neither the DB nor
 * the tile network is touched while the Graphs screen merely shows the row.
 * Scope follows the Graphs period by default; the header chip switches to
 * all-time. The initial region fits whatever points the scope returns.
 */
const HeatmapMapModal = ({
  visible,
  onClose,
  colors,
  t,
  selectedYear,
  selectedMonth,
  periodLabel,
}) => {
  const insets = useSafeAreaInsets();
  const [allTime, setAllTime] = useState(false);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [region, setRegion] = useState(WORLD_REGION);

  // Gesture handlers and the fit effect need the latest values synchronously.
  const regionRef = useRef(region);
  regionRef.current = region;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  // Set when a new point set arrives; consumed once the viewport is measured.
  const fitPendingRef = useRef(false);

  // Housekeeping once per opening, off the critical path.
  useEffect(() => {
    if (visible) pruneTileCache();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let loaded;
        if (allTime) {
          loaded = await getOperationCoordinates();
        } else {
          // Same period → date-range mapping as useExpenseData, so the map
          // agrees with the charts about what "this period" means.
          let startDate, endDate;
          if (selectedMonth === null) {
            startDate = new Date(selectedYear, 0, 1);
            endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
          } else {
            startDate = new Date(selectedYear, selectedMonth, 1);
            endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
          }
          loaded = await getOperationCoordinates(formatDate(startDate), formatDate(endDate));
        }
        if (!cancelled) {
          setPoints(loaded);
          fitPendingRef.current = true;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, allTime, selectedYear, selectedMonth]);

  // Fit the loaded points once the viewport is measured (and again on every
  // scope switch). Runs as an effect because layout and data race each other.
  useEffect(() => {
    if (!fitPendingRef.current || !size.width || !size.height || loading) return;
    fitPendingRef.current = false;
    setRegion(fitBounds(points, size.width, size.height) ?? WORLD_REGION);
  }, [points, size, loading]);

  const handleLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height });
  }, []);

  // Strict split by finger count: ONE finger pans, TWO fingers pinch. The pan
  // is capped at one pointer because letting it run alongside the pinch made
  // the two fight — pan activates first (its ~10px threshold beats the scale
  // change of a starting pinch) and keeps dragging the map while the zoom's
  // contribution drowns. The pinch handler therefore does BOTH two-finger
  // jobs itself: focal-point movement between events is the two-finger pan,
  // the scale delta is the zoom around the current focal point.
  // Every handler applies the DELTA since its previous event to the current
  // region (no touch-down snapshots), so gesture hand-offs — lifting to one
  // finger mid-pinch, adding a second finger mid-pan — never jump.
  const panLast = useRef({ x: 0, y: 0 });
  const pinchLast = useRef({ scale: 1, fx: 0, fy: 0 });

  const composedGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onStart(() => {
        panLast.current = { x: 0, y: 0 };
      })
      .onUpdate((e) => {
        const last = panLast.current;
        const dx = e.translationX - last.x;
        const dy = e.translationY - last.y;
        panLast.current = { x: e.translationX, y: e.translationY };
        setRegion(translateRegion(regionRef.current, dx, dy));
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        const { width, height } = sizeRef.current;
        pinchLast.current = {
          scale: 1,
          fx: e.focalX ?? width / 2,
          fy: e.focalY ?? height / 2,
        };
      })
      .onUpdate((e) => {
        const { width, height } = sizeRef.current;
        if (!width || !height) return;
        const last = pinchLast.current;
        const fx = e.focalX ?? last.fx;
        const fy = e.focalY ?? last.fy;
        // Two-finger pan: how far the pinch centroid moved since last event.
        let next = translateRegion(regionRef.current, fx - last.fx, fy - last.fy);
        // Zoom by the scale delta, anchored on the current focal point.
        const factor = e.scale / (last.scale || 1);
        next = scaleRegion(next, factor, fx, fy, width, height);
        pinchLast.current = { scale: e.scale, fx, fy };
        setRegion(next);
      });
    return Gesture.Simultaneous(pan, pinch);
  }, []);

  const tiles = useMemo(
    () => visibleTiles(region, size.width, size.height),
    [region, size],
  );

  const heatPoints = useMemo(() => {
    if (!size.width || !size.height) return [];
    const projected = [];
    for (const p of points) {
      const sp = pointToScreen(p.latitude, p.longitude, region, size.width, size.height);
      if (sp.x < -HEAT_MARGIN || sp.x > size.width + HEAT_MARGIN ||
          sp.y < -HEAT_MARGIN || sp.y > size.height + HEAT_MARGIN) continue;
      projected.push(sp);
      if (projected.length >= MAX_HEAT_POINTS) break;
    }
    return projected;
  }, [points, region, size]);

  const empty = !loading && points.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.flex}>
        <View
          style={[styles.container, { backgroundColor: colors.background }]}
          testID="heatmap-map-modal"
        >
          <View style={styles.mapArea} onLayout={handleLayout}>
            <GestureDetector gesture={composedGesture}>
              <View style={styles.mapSurface} collapsable={false} testID="heatmap-map-surface">
                {tiles.map((tile) => (
                  <MapTile
                    key={tile.key}
                    z={tile.z}
                    x={tile.x}
                    y={tile.y}
                    screenX={tile.screenX}
                    screenY={tile.screenY}
                    size={tile.size}
                  />
                ))}
                {heatPoints.length > 0 && (
                  <Canvas
                    pointerEvents="none"
                    style={[styles.heatCanvas, { height: size.height, width: size.width }]}
                  >
                    <Group>
                      <BlurMask blur={HEAT_BLUR} style="normal" />
                      {heatPoints.map((p, index) => (
                        <Circle key={index} cx={p.x} cy={p.y} r={HEAT_RADIUS} color={HEAT_COLOR} />
                      ))}
                    </Group>
                  </Canvas>
                )}
              </View>
            </GestureDetector>

            {loading && (
              <View style={styles.centerOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {empty && (
              <View style={styles.centerOverlay} pointerEvents="none">
                <View style={[styles.emptyBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Icon name="map-marker-off-outline" size={28} color={colors.mutedText} />
                  <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                    {t('graphs_map_no_locations')}
                  </Text>
                </View>
              </View>
            )}

            {/* OSM tile usage policy requires visible attribution. */}
            <View style={styles.attributionWrap} pointerEvents="none">
              <Text style={[styles.attribution, { backgroundColor: colors.surface + 'CC', color: colors.mutedText }]}>
                © OpenStreetMap contributors
              </Text>
            </View>
          </View>

          {/* box-none: the strip itself must not swallow pan gestures — only
              its buttons and badges are touch targets. */}
          <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={onClose}
              testID="heatmap-close-button"
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Icon name="close" size={22} color={colors.text} />
            </TouchableOpacity>

            <View style={[styles.titleBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={1}>
                {t('graphs_map_title')}
              </Text>
              <Text style={[styles.subtitleText, { color: colors.mutedText }]} numberOfLines={1}>
                {allTime ? t('graphs_map_all_time') : periodLabel}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.allTimeChip,
                {
                  backgroundColor: allTime ? colors.primary : colors.surface,
                  borderColor: allTime ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setAllTime((v) => !v)}
              testID="heatmap-all-time-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: allTime }}
              accessibilityLabel={t('graphs_map_all_time')}
            >
              <Icon
                name="infinity"
                size={16}
                color={allTime ? colors.surface : colors.mutedText}
              />
              <Text style={[styles.allTimeChipText, { color: allTime ? colors.surface : colors.text }]}>
                {t('graphs_map_all_time')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

HeatmapMapModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedYear: PropTypes.number.isRequired,
  selectedMonth: PropTypes.number,
  periodLabel: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  allTimeChip: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 4,
    flexDirection: 'row',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
  },
  allTimeChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  attribution: {
    borderRadius: 4,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  attributionWrap: {
    bottom: 8,
    left: 8,
    position: 'absolute',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  emptyBadge: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 32,
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 4,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  heatCanvas: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  mapArea: {
    flex: 1,
    overflow: 'hidden',
  },
  mapSurface: {
    flex: 1,
  },
  subtitleText: {
    fontSize: 11,
  },
  tile: {
    position: 'absolute',
  },
  titleBadge: {
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  titleText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default HeatmapMapModal;
