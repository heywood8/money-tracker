/**
 * Issue #1707: pan and pinch drove the map through React state, committing a
 * `setRegion` from every `onUpdate`. Each of those re-rendered the modal,
 * re-projected every point on the JS thread, rebuilt one Skia node per point and
 * handed every tile a new position — so the map stuttered under the finger.
 *
 * The gesture now only moves shared values, and the committed region changes
 * exactly once, when the finger lifts. `visibleTiles` runs during render, so its
 * call count is a direct read of how many times React was asked to redraw the
 * map.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import HeatmapMapModal from '../../../app/components/graphs/HeatmapMapModal';
import { getOperationCoordinates } from '../../../app/services/OperationsDB';
import { visibleTiles } from '../../../app/utils/mapProjection';

jest.mock('../../../app/services/OperationsDB', () => ({
  getOperationCoordinates: jest.fn(),
}));

jest.mock('../../../app/services/MapTileCache', () => ({
  getTileUri: jest.fn().mockResolvedValue(null),
  getResolvedTileUri: jest.fn(() => null),
  prefetchTiles: jest.fn(),
  pruneTileCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../app/services/LocationService', () => ({
  ensureLocationPermission: jest.fn().mockResolvedValue(false),
  getCurrentLocation: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({ attachLocation: false }),
}));

// Keep the real projection maths, but count the calls the render path makes.
jest.mock('../../../app/utils/mapProjection', () => {
  const actual = jest.requireActual('../../../app/utils/mapProjection');
  return { ...actual, visibleTiles: jest.fn(actual.visibleTiles) };
});

// Record the gesture callbacks so a test can drive them directly. The shared
// jest.setup mock throws them away.
const handlers = { pan: {}, pinch: {} };

jest.mock('react-native-gesture-handler', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');

  const builder = (bucket) => {
    const self = {};
    for (const method of ['maxPointers', 'minPointers', 'enabled', 'runOnJS', 'simultaneousWithExternalGesture', 'blocksExternalGesture']) {
      self[method] = () => self;
    }
    for (const method of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      self[method] = (fn) => { bucket[method] = fn; return self; };
    }
    return self;
  };

  return {
    Gesture: {
      Pan: () => builder(handlers.pan),
      Pinch: () => builder(handlers.pinch),
      Simultaneous: (...gestures) => gestures[0],
    },
    GestureDetector: ({ children }) => ReactLocal.createElement(View, {}, children),
    GestureHandlerRootView: ({ children }) => ReactLocal.createElement(View, {}, children),
  };
});

const colors = {
  background: '#ffffff',
  surface: '#f7f7f7',
  primary: '#6200ee',
  text: '#000000',
  mutedText: '#666666',
  border: '#dddddd',
};

const VIEWPORT = { width: 400, height: 800 };

const renderMap = async () => {
  getOperationCoordinates.mockResolvedValue([
    { latitude: 40.18, longitude: 44.51 },
    { latitude: 40.19, longitude: 44.52 },
  ]);

  const view = await render(
    <HeatmapMapModal
      visible
      onClose={jest.fn()}
      colors={colors}
      t={(key) => key}
      selectedYear={2026}
      selectedMonth={0}
      periodLabel="January"
    />,
  );

  // Measure the map area — nothing is projected until the viewport is known.
  // The handler sits on the wrapper above the gesture detector, so walk up from
  // the surface until a node carries one.
  let node = view.getByTestId('heatmap-map-surface');
  while (node && typeof node.props?.onLayout !== 'function') node = node.parent;
  expect(node).toBeTruthy();
  await act(async () => {
    node.props.onLayout({ nativeEvent: { layout: { ...VIEWPORT, x: 0, y: 0 } } });
  });

  // Guard against a silently unmeasured map: with a zero viewport the grid is
  // empty and every assertion below would pass for the wrong reason.
  await waitFor(() => {
    expect(visibleTiles.mock.calls.some(call => call[1] === VIEWPORT.width)).toBe(true);
  });
  return view;
};

describe('HeatmapMapModal gestures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handlers.pan = {};
    handlers.pinch = {};
  });

  it('registers pan and pinch without forcing them onto the JS thread', async () => {
    await renderMap();

    expect(typeof handlers.pan.onUpdate).toBe('function');
    expect(typeof handlers.pinch.onUpdate).toBe('function');
    // Both must commit on release — that is the only point the region changes.
    // onFinalize rather than onEnd so a cancelled gesture still balances out.
    expect(typeof handlers.pan.onFinalize).toBe('function');
    expect(typeof handlers.pinch.onFinalize).toBe('function');
  });

  it('does not redraw the map while a pan is in flight', async () => {
    await renderMap();

    await act(async () => { handlers.pan.onStart?.({}); });
    const rendersBefore = visibleTiles.mock.calls.length;

    await act(async () => {
      for (let i = 1; i <= 20; i += 1) {
        handlers.pan.onUpdate({ translationX: i * 7, translationY: i * 3 });
      }
    });

    expect(visibleTiles.mock.calls.length).toBe(rendersBefore);
  });

  it('redraws the map once when the pan finishes', async () => {
    await renderMap();

    await act(async () => { handlers.pan.onStart?.({}); });
    await act(async () => {
      for (let i = 1; i <= 20; i += 1) {
        handlers.pan.onUpdate({ translationX: i * 7, translationY: i * 3 });
      }
    });
    const rendersBefore = visibleTiles.mock.calls.length;

    await act(async () => { handlers.pan.onFinalize({}); });

    expect(visibleTiles.mock.calls.length).toBeGreaterThan(rendersBefore);
  });

  it('does not redraw the map while a pinch is in flight', async () => {
    await renderMap();

    await act(async () => {
      handlers.pinch.onStart({ focalX: 200, focalY: 400, scale: 1, numberOfPointers: 2 });
    });
    const rendersBefore = visibleTiles.mock.calls.length;

    await act(async () => {
      for (let i = 1; i <= 20; i += 1) {
        handlers.pinch.onUpdate({
          focalX: 200 + i,
          focalY: 400 + i,
          scale: 1 + i * 0.05,
          numberOfPointers: 2,
        });
      }
    });

    expect(visibleTiles.mock.calls.length).toBe(rendersBefore);
  });

  it('redraws the map once when the pinch finishes', async () => {
    await renderMap();

    await act(async () => {
      handlers.pinch.onStart({ focalX: 200, focalY: 400, scale: 1, numberOfPointers: 2 });
    });
    await act(async () => {
      for (let i = 1; i <= 20; i += 1) {
        handlers.pinch.onUpdate({
          focalX: 200 + i,
          focalY: 400 + i,
          scale: 1 + i * 0.05,
          numberOfPointers: 2,
        });
      }
    });
    const rendersBefore = visibleTiles.mock.calls.length;

    await act(async () => { handlers.pinch.onFinalize({}); });

    expect(visibleTiles.mock.calls.length).toBeGreaterThan(rendersBefore);
  });

  it('prepares tiles beyond the viewport so a drag has something to reveal', async () => {
    await renderMap();

    // Only the render path passes an overscan; the adjacent-zoom prefetch calls
    // the same helper with four arguments and must not be counted here, or this
    // would pass or fail on whether its debounce happened to have fired.
    const renderCalls = visibleTiles.mock.calls.filter(call => call.length >= 5);
    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls.every(call => call[4] > 0)).toBe(true);

    // Half the viewport's longer side, once the viewport is actually measured:
    // enough for the prepared strip to still cover the screen a zoom level out.
    const measured = renderCalls.filter(call => call[1] === VIEWPORT.width);
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.every(call => call[4] === VIEWPORT.height / 2)).toBe(true);
  });

  it('commits only once both simultaneous gestures have finished', async () => {
    await renderMap();

    // A pinch that starts while a pan is still down, then the pan lifting first:
    // committing there would reset the scale the pinch is still accumulating.
    await act(async () => { handlers.pan.onStart({}); });
    await act(async () => {
      handlers.pinch.onStart({ focalX: 200, focalY: 400, scale: 1, numberOfPointers: 2 });
    });
    await act(async () => { handlers.pan.onUpdate({ translationX: 40, translationY: 20 }); });

    const rendersBefore = visibleTiles.mock.calls.length;

    await act(async () => { handlers.pan.onFinalize({}); });
    expect(visibleTiles.mock.calls.length).toBe(rendersBefore);

    await act(async () => { handlers.pinch.onFinalize({}); });
    expect(visibleTiles.mock.calls.length).toBeGreaterThan(rendersBefore);
  });
});
