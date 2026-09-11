import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  TabFocusProvider,
  useTabFocused,
  useTabFocusedEvent,
  useSetActiveTab,
} from '../../app/contexts/TabFocusContext';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.unmock('../../app/services/eventEmitter');

/**
 * Issue #1705: every tab stays mounted for the whole session, so an app-wide
 * event ran every screen's data hooks — a quick-add on the Operations tab fanned
 * out into the balance history's net-worth pass, two trend series, the donuts,
 * the drill-downs and the plan-status walk, for screens nobody was looking at.
 */
describe('TabFocusContext', () => {
  const wrapper = ({ children }) => <TabFocusProvider>{children}</TabFocusProvider>;

  describe('useTabFocused', () => {
    it('starts on the tab the app opens on', async () => {
      const { result } = await renderHook(() => ({
        operations: useTabFocused('Operations'),
        graphs: useTabFocused('Graphs'),
      }), { wrapper });

      expect(result.current.operations).toBe(true);
      expect(result.current.graphs).toBe(false);
    });

    it('follows the navigator', async () => {
      const { result } = await renderHook(() => ({
        graphs: useTabFocused('Graphs'),
        setActiveTab: useSetActiveTab(),
      }), { wrapper });

      expect(result.current.graphs).toBe(false);
      await act(async () => { result.current.setActiveTab('Graphs'); });
      expect(result.current.graphs).toBe(true);
    });

    it('reads as focused with no provider, so an isolated render keeps working', async () => {
      const { result } = await renderHook(() => useTabFocused('Graphs'));
      expect(result.current).toBe(true);
    });
  });

  describe('useTabFocusedEvent', () => {
    it('refreshes immediately while the tab is on screen', async () => {
      const refresh = jest.fn();
      await renderHook(() => useTabFocusedEvent('Operations', EVENTS.OPERATION_CHANGED, refresh), { wrapper });

      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not touch the database while the tab is hidden', async () => {
      const refresh = jest.fn();
      await renderHook(() => useTabFocusedEvent('Graphs', EVENTS.OPERATION_CHANGED, refresh), { wrapper });

      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

      expect(refresh).not.toHaveBeenCalled();
    });

    it('refreshes once on arrival, however many events landed while away', async () => {
      const refresh = jest.fn();
      const { result } = await renderHook(() => {
        useTabFocusedEvent('Graphs', EVENTS.OPERATION_CHANGED, refresh);
        return useSetActiveTab();
      }, { wrapper });

      await act(async () => {
        appEvents.emit(EVENTS.OPERATION_CHANGED);
        appEvents.emit(EVENTS.OPERATION_CHANGED);
        appEvents.emit(EVENTS.OPERATION_CHANGED);
      });
      expect(refresh).not.toHaveBeenCalled();

      await act(async () => { result.current('Graphs'); });

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    });

    it('does not refresh on arrival when nothing happened while away', async () => {
      const refresh = jest.fn();
      const { result } = await renderHook(() => {
        useTabFocusedEvent('Graphs', EVENTS.OPERATION_CHANGED, refresh);
        return useSetActiveTab();
      }, { wrapper });

      await act(async () => { result.current('Graphs'); });
      await act(async () => { result.current('Operations'); });
      await act(async () => { result.current('Graphs'); });

      expect(refresh).not.toHaveBeenCalled();
    });

    it('listens to every event it is given', async () => {
      const refresh = jest.fn();
      await renderHook(
        () => useTabFocusedEvent('Operations', [EVENTS.OPERATION_CHANGED, EVENTS.RELOAD_ALL], refresh),
        { wrapper },
      );

      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });
      await act(async () => { appEvents.emit(EVENTS.RELOAD_ALL); });

      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('stops listening on unmount', async () => {
      const refresh = jest.fn();
      const { unmount } = await renderHook(
        () => useTabFocusedEvent('Operations', EVENTS.OPERATION_CHANGED, refresh),
        { wrapper },
      );

      await unmount();
      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
