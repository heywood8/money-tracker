/**
 * Tests for DisplaySettingsContext - Managing hide-balances preference
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { DisplaySettingsProvider, useDisplaySettings } from '../../app/contexts/DisplaySettingsContext';
import * as PreferencesDB from '../../app/services/PreferencesDB';

jest.mock('../../app/services/PreferencesDB');

describe('DisplaySettingsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PreferencesDB.getPreference.mockResolvedValue('false');
    PreferencesDB.setPreference.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => (
    <DisplaySettingsProvider>{children}</DisplaySettingsProvider>
  );

  describe('Initialization', () => {
    it('defaults to hideBalances=false when stored value is "false"', async () => {
      PreferencesDB.getPreference.mockResolvedValue('false');

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(PreferencesDB.getPreference).toHaveBeenCalled();
      });

      expect(result.current.hideBalances).toBe(false);
    });

    it('sets hideBalances=true when stored value is "true"', async () => {
      PreferencesDB.getPreference.mockResolvedValue('true');

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.hideBalances).toBe(true);
      });
    });

    it('defaults to false when stored value is null', async () => {
      PreferencesDB.getPreference.mockResolvedValue(null);

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(PreferencesDB.getPreference).toHaveBeenCalled();
      });

      expect(result.current.hideBalances).toBe(false);
    });

    it('provides setHideBalances function', async () => {
      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });
      expect(typeof result.current.setHideBalances).toBe('function');
    });
  });

  describe('setHideBalances', () => {
    it('sets hideBalances to true and persists "true" to preferences', async () => {
      PreferencesDB.getPreference.mockResolvedValue('false');

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      // Wait for the initialization useEffect to complete first
      await waitFor(() => {
        expect(PreferencesDB.getPreference).toHaveBeenCalled();
      });

      await act(async () => {
        await result.current.setHideBalances(true);
      });

      expect(result.current.hideBalances).toBe(true);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        expect.any(String),
        'true',
      );
    });

    it('sets hideBalances to false and persists "false" to preferences', async () => {
      PreferencesDB.getPreference.mockResolvedValue('true');

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.hideBalances).toBe(true);
      });

      await act(async () => {
        await result.current.setHideBalances(false);
      });

      expect(result.current.hideBalances).toBe(false);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        expect.any(String),
        'false',
      );
    });

    it('toggles from false to true correctly', async () => {
      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.hideBalances).toBe(false);
      });

      await act(async () => {
        await result.current.setHideBalances(true);
      });

      expect(result.current.hideBalances).toBe(true);
    });

    it('toggles from true to false correctly', async () => {
      PreferencesDB.getPreference.mockResolvedValue('true');

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.hideBalances).toBe(true);
      });

      await act(async () => {
        await result.current.setHideBalances(false);
      });

      expect(result.current.hideBalances).toBe(false);
    });
  });

  describe('attachLocation (issue #1091)', () => {
    it('defaults attachLocation=false', async () => {
      PreferencesDB.getPreference.mockResolvedValue('false');

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(PreferencesDB.getPreference).toHaveBeenCalled();
      });

      expect(result.current.attachLocation).toBe(false);
    });

    it('reads stored attachLocation="true" on mount', async () => {
      PreferencesDB.getPreference.mockImplementation((key) =>
        Promise.resolve(key === 'attach_location' ? 'true' : 'false'),
      );

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.attachLocation).toBe(true);
      });
      // hideBalances stays independent.
      expect(result.current.hideBalances).toBe(false);
    });

    it('setAttachLocation(true) persists "true"', async () => {
      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(PreferencesDB.getPreference).toHaveBeenCalled();
      });

      await act(async () => {
        await result.current.setAttachLocation(true);
      });

      expect(result.current.attachLocation).toBe(true);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith('attach_location', 'true');
    });

    it('setAttachLocation(false) persists "false"', async () => {
      PreferencesDB.getPreference.mockImplementation((key) =>
        Promise.resolve(key === 'attach_location' ? 'true' : 'false'),
      );

      const { result } = await renderHook(() => useDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.attachLocation).toBe(true);
      });

      await act(async () => {
        await result.current.setAttachLocation(false);
      });

      expect(result.current.attachLocation).toBe(false);
      expect(PreferencesDB.setPreference).toHaveBeenCalledWith('attach_location', 'false');
    });
  });
});
