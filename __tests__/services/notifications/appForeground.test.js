/**
 * Tests for the on-screen check the background bank checker uses to decide
 * whether an "operations added" receipt is worth posting.
 */

import { AppState } from 'react-native';
import { isAppInForeground } from '../../../app/services/notifications/appForeground';

describe('isAppInForeground', () => {
  const original = AppState.currentState;

  afterEach(() => {
    AppState.currentState = original;
  });

  it('is true while the app is on screen', () => {
    AppState.currentState = 'active';
    expect(isAppInForeground()).toBe(true);
  });

  it('is false while the app is backgrounded', () => {
    AppState.currentState = 'background';
    expect(isAppInForeground()).toBe(false);
  });

  it('treats the transitional "inactive" state as not-foreground', () => {
    // Shade pulled down / permission dialog on top: the user is not reliably
    // looking at the app, and posting is the safer failure.
    AppState.currentState = 'inactive';
    expect(isAppInForeground()).toBe(false);
  });

  it('is false when the state is unknown', () => {
    // A headless JS context may not have an app state at all.
    AppState.currentState = null;
    expect(isAppInForeground()).toBe(false);
  });
});
