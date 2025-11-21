import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

describe('App', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders without crashing', async () => {
    // Set a language preference so we skip the first-time setup
    await AsyncStorage.setItem('app_language', 'en');

    const { toJSON } = render(<App />);

    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });
});
