import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    const { getByText } = render(<App />);
    // Adjust the text below to match something visible in your App.js
    expect(getByText(/account|settings|money|tracker/i)).toBeTruthy();
  });
});
