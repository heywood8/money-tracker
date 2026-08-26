import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import {
  AppBlurProvider,
  useAppBlurState,
  useAppBlurControls,
} from '../../app/contexts/AppBlurContext';

// The count and the controls are separate contexts; most callers need one or the
// other, so read both here to assert how they move together.
const useBlur = () => ({ count: useAppBlurState(), ...useAppBlurControls() });

const wrapper = ({ children }) => <AppBlurProvider>{children}</AppBlurProvider>;

describe('AppBlurContext', () => {
  describe('Counting', () => {
    it('starts unblurred', async () => {
      const { result } = await renderHook(() => useBlur(), { wrapper });
      expect(result.current.count).toBe(0);
    });

    it('counts overlapping requests and clears on the last release', async () => {
      const { result } = await renderHook(() => useBlur(), { wrapper });

      await act(async () => { result.current.increment(); });
      await act(async () => { result.current.increment(); });
      expect(result.current.count).toBe(2);

      await act(async () => { result.current.decrement(); });
      expect(result.current.count).toBe(1);

      await act(async () => { result.current.decrement(); });
      expect(result.current.count).toBe(0);
    });

    it('never counts below zero', async () => {
      const { result } = await renderHook(() => useBlur(), { wrapper });

      await act(async () => { result.current.decrement(); });
      expect(result.current.count).toBe(0);
    });
  });

  describe('Controls', () => {
    // Regression: the count and the controls used to share one context value, so
    // every consumer re-rendered whenever the blur went up or down — including
    // AppInitializer, which only ever reads the count inside a poll callback. That
    // re-render landed on the exact frame the blur was being removed, which is what
    // made the blur outlast the modal that asked for it.
    it('hands out a value that does not change when the count does', async () => {
      const { result } = await renderHook(() => ({
        controls: useAppBlurControls(),
        count: useAppBlurState(),
      }), { wrapper });

      const firstControls = result.current.controls;

      await act(async () => { result.current.controls.increment(); });

      expect(result.current.count).toBe(1);
      expect(result.current.controls).toBe(firstControls);
      expect(result.current.controls.increment).toBe(firstControls.increment);
      expect(result.current.controls.decrement).toBe(firstControls.decrement);
    });

    it('mirrors the count into a ref for callers that must not subscribe', async () => {
      const { result } = await renderHook(() => useAppBlurControls(), { wrapper });

      expect(result.current.blurCountRef.current).toBe(0);

      await act(async () => { result.current.increment(); });
      expect(result.current.blurCountRef.current).toBe(1);

      await act(async () => { result.current.decrement(); });
      await act(async () => { result.current.decrement(); });
      expect(result.current.blurCountRef.current).toBe(0);
    });
  });
});
