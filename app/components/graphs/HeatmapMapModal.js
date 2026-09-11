import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
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
import Reanimated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { Canvas, Circle, Group, BlurMask } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOperationCoordinates } from '../../services/OperationsDB';
import { getTileUri, getResolvedTileUri, prefetchTiles, pruneTileCache } from '../../services/MapTileCache';
import { ensureLocationPermission, getCurrentLocation } from '../../services/LocationService';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { formatDate } from '../../services/BalanceHistoryDB';
import {
  visibleTiles,
  pointToScreen,
  fitBounds,
  translateRegion,
  scaleRegion,
  latToWorldY,
  TILE_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../../utils/mapProjection';
import EmptyState from '../EmptyState';
import { CARD_SURFACE } from '../../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';

// Fallback view when there is nothing to fit — the whole world.
const WORLD_REGION = { latitude: 20, longitude: 0, zoom: 2 };

// Default camera when the device location is available: the user's current
// city. Zoom 12 spans roughly a city and its districts on a phone screen.
const CITY_ZOOM = 12;

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

// How far outside the viewport the tile grid and the heat blobs are prepared.
// Pan and pinch run as a transform on the UI thread and only commit the new
// region when the finger lifts, so whatever the gesture reveals has to have been
// rendered before it started.
//
// Half the viewport's longer side is what a full zoom level out needs: the
// prepared strip shrinks with the content, and (W + 2·O)·s ≥ W holds down to
// s = 0.5 exactly when O = W/2. The same figure covers a drag of half a screen.
// Past either — a pinch beyond one zoom level out, or a longer drag — the
// leading edge shows background until the finger lifts, which is the price of
// never re-tiling mid-gesture. The floor keeps a very small viewport (a split
// screen, a test) from preparing nothing at all.
const GESTURE_OVERSCAN_MIN_PX = 256;
const gestureOverscan = (width, height) =>
  Math.max(GESTURE_OVERSCAN_MIN_PX, Math.max(width, height) / 2);

// Adjacent-zoom-level prefetch: fire only after the camera has been still
// this long (every move resets the timer), and never more than this many
// tiles per settle — one level in of a phone viewport is ~40–60 tiles.
const PREFETCH_DEBOUNCE_MS = 400;
const PREFETCH_MAX_TILES = 48;

/**
 * One raster tile. A tile some earlier render already resolved paints on its
 * very first frame (synchronous session cache); anything else resolves
 * lazily and renders nothing until then. Memoized so panning only re-renders
 * position styles, not the resolution.
 */
const MapTile = React.memo(function MapTile({ z, x, y, screenX, screenY, size }) {
  const [uri, setUri] = useState(() => getResolvedTileUri(z, x, y));
  useEffect(() => {
    if (uri) return undefined;
    let cancelled = false;
    getTileUri(z, x, y).then((resolved) => {
      if (!cancelled && resolved) setUri(resolved);
    }).catch(() => {});
    return () => { cancelled = true; };
    // `uri` is deliberately not a dependency: once set it never changes.
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
  // No provider in isolated renders (tests) — undefined reads as feature off.
  const { attachLocation } = useDisplaySettings() ?? {};
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
  // The same measurement, readable from a gesture worklet.
  const sizeSV = useSharedValue(size);
  useEffect(() => { sizeSV.value = size; }, [size, sizeSV]);
  // Set when a new point set arrives; consumed once the viewport is measured.
  const fitPendingRef = useRef(false);
  // True once the user pans/zooms — from then on nothing may move the camera
  // out from under them (a late GPS fix, a scope-toggle refit).
  const interactedRef = useRef(false);
  // True once the camera was parked on the device's city. Scope toggles then
  // only swap the points underneath it instead of refitting.
  const locationAppliedRef = useRef(false);

  // Housekeeping once per opening, off the critical path.
  useEffect(() => {
    if (visible) pruneTileCache();
  }, [visible]);

  // Default camera: the user's current city (CITY_ZOOM around the device
  // location). Gated on the attach-location opt-in — the map must not surface
  // a permission prompt for users who kept geolocation off (their heatmap is
  // empty anyway; for opted-in users the permission is already granted and
  // this is silent). The fix can take seconds, so it lands as an override of
  // the points-fit — unless the user has already started moving the map.
  useEffect(() => {
    if (!visible || !attachLocation) return;
    let cancelled = false;
    (async () => {
      const { granted } = await ensureLocationPermission();
      if (!granted || cancelled) return;
      const fix = await getCurrentLocation();
      if (cancelled || !fix) return;
      const latitude = parseFloat(fix.latitude);
      const longitude = parseFloat(fix.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      if (interactedRef.current) return;
      locationAppliedRef.current = true;
      setRegion({ latitude, longitude, zoom: CITY_ZOOM });
    })();
    return () => { cancelled = true; };
  }, [visible, attachLocation]);

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
  // Skipped once the camera belongs to the device-city view or to the user's
  // own gestures — a reload then only swaps the points underneath.
  useEffect(() => {
    if (!fitPendingRef.current || !size.width || !size.height || loading) return;
    fitPendingRef.current = false;
    if (locationAppliedRef.current || interactedRef.current) return;
    setRegion(fitBounds(points, size.width, size.height) ?? WORLD_REGION);
  }, [points, size, loading]);

  const handleLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height });
  }, []);

  // ---------------------------------------------------------------------
  // Gestures.
  //
  // Pan and pinch used to run `.runOnJS(true)` and call `setRegion` from every
  // `onUpdate`. Each of those re-rendered the modal, re-projected every point
  // on the JS thread and rebuilt one Skia node per point, and handed every
  // MapTile a new screenX/screenY — so the `memo` on MapTile never helped
  // during a drag. A few hundred geotagged operations stuttered under the
  // finger; a few thousand were unusable.
  //
  // Now the gesture only moves three shared values, and the whole map layer
  // (tiles and heat canvas together) is drawn through one transform on the UI
  // thread. React sees nothing until the finger lifts, when the accumulated
  // transform is folded into `region` exactly once.
  //
  // The transform is, in screen space:
  //
  //     screen' = (screen - F) * s + F + P
  //
  // with F the pinch anchor, s the accumulated scale and P the accumulated
  // pan. A React Native `scale` transform is anchored on the view's centre C,
  // so the equivalent translate is `P + (F - C) * (1 - s)`.
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const gestureScale = useSharedValue(1);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  // Zoom bounds as a SCALE relative to the committed region, so the worklet can
  // clamp without knowing about zoom levels. Without this the map would keep
  // growing under the fingers past MAX_ZOOM and then snap back on release.
  const minScale = useSharedValue(1);
  const maxScale = useSharedValue(1);
  // Vertical pan bounds, in screen pixels, mirroring the latitude clamp that
  // translateRegion applies at commit: the centre's world Y may only travel
  // within [0, worldSize]. Without them the world could be dragged clear off
  // the screen at low zoom and would snap back when the finger lifted.
  // Longitude wraps, so X needs no bound.
  const minPanY = useSharedValue(-Infinity);
  const maxPanY = useSharedValue(Infinity);
  useEffect(() => {
    minScale.value = Math.pow(2, MIN_ZOOM - region.zoom);
    maxScale.value = Math.pow(2, MAX_ZOOM - region.zoom);
    const worldY = latToWorldY(region.latitude, region.zoom);
    const worldSpan = TILE_SIZE * Math.pow(2, region.zoom);
    minPanY.value = worldY - worldSpan;
    maxPanY.value = worldY;
  }, [region.latitude, region.zoom, minScale, maxScale, minPanY, maxPanY]);

  const animatedLayerStyle = useAnimatedStyle(() => {
    const s = gestureScale.value;
    const cx = sizeSV.value.width / 2;
    const cy = sizeSV.value.height / 2;
    return {
      transform: [
        { translateX: panX.value + (anchorX.value - cx) * (1 - s) },
        { translateY: panY.value + (anchorY.value - cy) * (1 - s) },
        { scale: s },
      ],
    };
  });

  // Fold the gesture's transform into the committed region. Applied in the same
  // order the transform composes it — scale about the anchor, then translate —
  // so what the user watched during the drag is exactly what lands.
  //
  // The transform is NOT reset here. It is reset in a layout effect once React
  // has the new region (see below), so the identity transform and the tiles'
  // new positions reach the native view hierarchy in the same batch. Resetting
  // here would let the reset paint against the old positions, flashing the map
  // back to where the gesture started.
  const commitGesture = useCallback((px, py, scale, ax, ay) => {
    interactedRef.current = true;
    const { width, height } = sizeRef.current;
    if (!width || !height) return;
    let next = regionRef.current;
    if (scale !== 1) next = scaleRegion(next, scale, ax, ay, width, height);
    if (px !== 0 || py !== 0) next = translateRegion(next, px, py);
    setRegion(next);
  }, []);

  useLayoutEffect(() => {
    panX.value = 0;
    panY.value = 0;
    gestureScale.value = 1;
  }, [region, panX, panY, gestureScale]);

  const markInteracted = useCallback(() => { interactedRef.current = true; }, []);

  // Strict split by finger count: ONE finger pans, TWO fingers pinch. The pan
  // is capped at one pointer because letting it run alongside the pinch made
  // the two fight — pan activates first (its ~10px threshold beats the scale
  // change of a starting pinch) and keeps dragging the map while the zoom's
  // contribution drowns. The pinch handler therefore does BOTH two-finger
  // jobs itself: focal-point movement between events is the two-finger pan,
  // the scale delta is the zoom around the current focal point.
  const panStart = useSharedValue({ x: 0, y: 0 });
  const pinchLast = useSharedValue({ scale: 1, fx: 0, fy: 0, pointers: 2 });
  // Pan and pinch run simultaneously and share one accumulated transform, so the
  // transform may only be folded into the region when the LAST of them lets go.
  // Committing on the first `onEnd` wiped the scale a still-running pinch was
  // accumulating, and reset the pan out from under the next gesture's baseline.
  const activeGestures = useSharedValue(0);

  // A finger landing or lifting mid-gesture TELEPORTS the pinch centroid
  // toward the remaining/added finger — that is not the user dragging, and
  // treating it as a focal delta threw the map sideways at the end of every
  // pinch (fingers never lift in the same frame). Any single-event focal move
  // beyond this many px is such a teleport: re-anchor instead of translating.
  // A real drag at 60 Hz stays far below it (48 px/frame ≈ 2900 px/s).
  const FOCAL_TELEPORT_PX = 48;

  const composedGesture = useMemo(() => {
    // Folds the accumulated transform into the region, but only once every
    // gesture has finished. `onFinalize` rather than `onEnd` so a cancelled
    // gesture (a system interruption, a failed recognition) still balances its
    // onStart and cannot strand the counter above zero.
    const finalize = () => {
      'worklet';
      activeGestures.value = Math.max(0, activeGestures.value - 1);
      if (activeGestures.value > 0) return;
      runOnJS(commitGesture)(panX.value, panY.value, gestureScale.value, anchorX.value, anchorY.value);
    };

    const pan = Gesture.Pan()
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        activeGestures.value += 1;
        panStart.value = { x: panX.value, y: panY.value };
        runOnJS(markInteracted)();
      })
      .onUpdate((e) => {
        'worklet';
        panX.value = panStart.value.x + e.translationX;
        panY.value = Math.max(
          minPanY.value,
          Math.min(maxPanY.value, panStart.value.y + e.translationY),
        );
      })
      .onFinalize(finalize);

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        'worklet';
        activeGestures.value += 1;
        const fx = e.focalX ?? sizeSV.value.width / 2;
        const fy = e.focalY ?? sizeSV.value.height / 2;
        // The first pinch of a gesture sets the anchor; a later one re-anchors
        // by folding the old anchor's contribution into the pan, so the picture
        // on screen does not move at the moment of re-anchoring.
        const s = gestureScale.value;
        panX.value += (fx - anchorX.value) * (s - 1);
        panY.value += (fy - anchorY.value) * (s - 1);
        anchorX.value = fx;
        anchorY.value = fy;
        pinchLast.value = { scale: e.scale, fx, fy, pointers: e.numberOfPointers ?? 2 };
        runOnJS(markInteracted)();
      })
      .onUpdate((e) => {
        'worklet';
        const last = pinchLast.value;
        const fx = e.focalX ?? last.fx;
        const fy = e.focalY ?? last.fy;
        const pointers = e.numberOfPointers ?? last.pointers;
        // Centroid teleport (finger count changed, or the focal jumped farther
        // than a finger can move in one frame): re-baseline both the focal point
        // and the scale on the new configuration and apply nothing — the next
        // event's deltas are trustworthy again.
        const teleported = pointers !== last.pointers ||
          Math.abs(fx - last.fx) > FOCAL_TELEPORT_PX ||
          Math.abs(fy - last.fy) > FOCAL_TELEPORT_PX;
        if (teleported) {
          pinchLast.value = { scale: e.scale, fx, fy, pointers };
          return;
        }
        // Two-finger pan: how far the pinch centroid moved since last event.
        panX.value += fx - last.fx;
        panY.value = Math.max(
          minPanY.value,
          Math.min(maxPanY.value, panY.value + (fy - last.fy)),
        );
        // Zoom by the scale delta, clamped to the projection's zoom range.
        const factor = e.scale / (last.scale || 1);
        const nextScale = gestureScale.value * factor;
        gestureScale.value = Math.max(minScale.value, Math.min(maxScale.value, nextScale));
        pinchLast.value = { scale: e.scale, fx, fy, pointers };
      })
      .onFinalize(finalize);

    return Gesture.Simultaneous(pan, pinch);
  }, [panStart, panX, panY, gestureScale, anchorX, anchorY, minScale, maxScale, minPanY, maxPanY, pinchLast, activeGestures, commitGesture, markInteracted]);

  const overscan = gestureOverscan(size.width, size.height);

  const tiles = useMemo(
    () => visibleTiles(region, size.width, size.height, null, overscan),
    [region, size, overscan],
  );

  // Underlay: while zooming across an integer tile level, the level being
  // LEFT keeps rendering (rescaled live) beneath the new one. Its tiles all
  // sit in the synchronous session cache — they were just on screen — so the
  // hand-off never flashes bare background while the new level streams in.
  // Never rendered more than one level apart: a wider gap means the camera
  // jumped (fit, city default), where a 4×-blown underlay would look broken.
  const currentTileZoom = tiles.length > 0 ? tiles[0].z : null;
  const tileZoomRef = useRef(null);
  const underZoomRef = useRef(null);
  if (currentTileZoom !== null && currentTileZoom !== tileZoomRef.current) {
    underZoomRef.current = tileZoomRef.current;
    tileZoomRef.current = currentTileZoom;
  }
  const underlayZoom =
    underZoomRef.current !== null && Math.abs(currentTileZoom - underZoomRef.current) === 1
      ? underZoomRef.current
      : null;
  const underlayTiles = useMemo(
    () => (underlayZoom === null
      ? []
      : visibleTiles(region, size.width, size.height, underlayZoom, overscan)),
    [region, size, underlayZoom, overscan],
  );

  // ONE flat keyed list, underlay first so the current level draws on top.
  // Rendering the two layers as separate arrays remounted every tile on a
  // level crossing: React reconciles keys only within one array, so a tile
  // moving from the current level into the underlay lost its component — and
  // with it the native Image's already-decoded bitmap. The re-decode left
  // both layers transparent for a frame or two: the residual black flash.
  // In a single list the key survives the role change, the instance (and its
  // decoded bitmap) persists, and only its position/size props update.
  const renderTiles = useMemo(
    () => [...underlayTiles, ...tiles],
    [underlayTiles, tiles],
  );

  // Once the camera has been still for a beat, warm the ADJACENT zoom levels
  // of the current viewport (one level in — the likely next pinch — first,
  // then one level out). By the time the user crosses a level its tiles are
  // already on disk and in the synchronous session cache, so the hand-off is
  // seamless. Every camera move resets the debounce, so nothing is fetched
  // mid-gesture; the cap and getTileUri's dedup/cache keep this well within
  // polite use of the OSM tile server (a settled viewport re-fetches nothing).
  useEffect(() => {
    if (tiles.length === 0) return undefined;
    const timer = setTimeout(() => {
      const { width, height } = sizeRef.current;
      const currentRegion = regionRef.current;
      const z = tiles[0].z;
      const targets = [];
      if (z + 1 <= MAX_ZOOM) {
        targets.push(...visibleTiles(currentRegion, width, height, z + 1));
      }
      if (z - 1 >= MIN_ZOOM) {
        targets.push(...visibleTiles(currentRegion, width, height, z - 1));
      }
      prefetchTiles(targets.slice(0, PREFETCH_MAX_TILES));
    }, PREFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tiles]);

  // Projected once per committed region, never during a gesture — the drag moves
  // these through the layer transform instead. The cull margin carries the same
  // overscan as the tiles, so a blob the drag is about to bring into view is
  // already in the list; the canvas below is grown and offset to match, or the
  // extra blobs would be clipped and the point budget spent on nothing.
  // Coordinates are therefore CANVAS-relative: the canvas origin sits at
  // (-overscan, -overscan) in the layer.
  const heatMargin = HEAT_MARGIN + overscan;
  const heatPoints = useMemo(() => {
    if (!size.width || !size.height) return [];
    const projected = [];
    for (const p of points) {
      const sp = pointToScreen(p.latitude, p.longitude, region, size.width, size.height);
      if (sp.x < -heatMargin || sp.x > size.width + heatMargin ||
          sp.y < -heatMargin || sp.y > size.height + heatMargin) continue;
      projected.push({ x: sp.x + overscan, y: sp.y + overscan });
      if (projected.length >= MAX_HEAT_POINTS) break;
    }
    return projected;
  }, [points, region, size, heatMargin, overscan]);

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
                {/* Tiles and heat blobs move as ONE layer under a single UI-thread
                    transform, so a drag repositions nothing per tile and
                    re-projects nothing per point. */}
                <Reanimated.View
                  style={[styles.mapLayer, animatedLayerStyle]}
                  pointerEvents="none"
                  testID="heatmap-map-layer"
                >
                  {renderTiles.map((tile) => (
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
                      style={[styles.heatCanvas, {
                        height: size.height + overscan * 2,
                        left: -overscan,
                        top: -overscan,
                        width: size.width + overscan * 2,
                      }]}
                    >
                      <Group>
                        <BlurMask blur={HEAT_BLUR} style="normal" />
                        {heatPoints.map((p, index) => (
                          <Circle key={index} cx={p.x} cy={p.y} r={HEAT_RADIUS} color={HEAT_COLOR} />
                        ))}
                      </Group>
                    </Canvas>
                  )}
                </Reanimated.View>
              </View>
            </GestureDetector>

            {loading && (
              <View style={styles.centerOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {empty && (
              <View style={styles.centerOverlay} pointerEvents="none">
                <EmptyState
                  icon="map-marker-off-outline"
                  iconSize={28}
                  fill={false}
                  message={t('graphs_map_no_locations')}
                  style={[styles.emptyBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}
                />
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
    borderRadius: BORDER_RADIUS.pill,
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
    borderRadius: BORDER_RADIUS.sm,
    fontSize: FONT_SIZE.xs,
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
    ...CARD_SURFACE,
    marginHorizontal: SPACING.xxl,
    // Both axes stated: EmptyState's container sets paddingVertical, and in
    // React Native the longhand wins over `padding` regardless of merge order,
    // so a lone `padding` here would silently keep the container's vertical
    // value and only apply horizontally.
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    elevation: 4,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  heatCanvas: {
    // left/top/width/height are set inline: the canvas is grown by the gesture
    // overscan on every side so a blob the drag is about to reveal is painted
    // rather than clipped at the viewport edge.
    position: 'absolute',
  },
  mapArea: {
    flex: 1,
    overflow: 'hidden',
  },
  // Covers the map area exactly, so the RN `scale` transform is anchored on the
  // viewport's centre — which is what the anchor maths in animatedLayerStyle
  // corrects against to pin the zoom on the pinch focal point instead.
  mapLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
    borderRadius: BORDER_RADIUS.lg,
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
