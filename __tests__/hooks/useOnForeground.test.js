/**
 * Tests for the shared foreground-return hook: fires only on a
 * background/inactive → active transition, always with the latest callback,
 * and unsubscribes on unmount.
 */

import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import useOnForeground from '../../app/hooks/useOnForeground';

describe('useOnForeground', () => {
  const originalState = AppState.currentState;
  let handler;
  let remove;

  beforeEach(() => {
    handler = null;
    remove = jest.fn();
    AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, callback) => {
      if (event === 'change') handler = callback;
      return { remove };
    });
  });

  afterEach(() => {
    AppState.addEventListener.mockRestore();
    AppState.currentState = originalState;
  });

  it('fires on a return to the foreground, not on mount or on the way out', async () => {
    const callback = jest.fn();
    await renderHook(() => useOnForeground(callback));

    expect(callback).not.toHaveBeenCalled();
    handler('background');
    expect(callback).not.toHaveBeenCalled();
    handler('active');
    expect(callback).toHaveBeenCalledTimes(1);

    // Android passes through inactive on the way in; that is still one return.
    handler('inactive');
    handler('active');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('invokes the latest callback without re-subscribing, and unsubscribes on unmount', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender, unmount } = await renderHook(
      ({ callback }) => useOnForeground(callback),
      { initialProps: { callback: first } },
    );
    await rerender({ callback: second });

    handler('background');
    handler('active');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);

    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
