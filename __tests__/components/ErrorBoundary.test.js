/**
 * Tests for ErrorBoundary Component - Error catching and recovery
 * Tests error boundary lifecycle, error display, and reset functionality
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ErrorBoundary from '../../app/components/ErrorBoundary';

// Component that throws an error when shouldThrow prop is true
const ThrowError = ({ shouldThrow, message = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <Text>Normal content</Text>;
};

ThrowError.propTypes = {
  shouldThrow: PropTypes.bool,
  message: PropTypes.string,
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Suppress console.error for expected errors in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Normal Rendering', () => {
    it('renders children when no error occurs', async () => {
      const { getByText, queryByText } = await render(
        <ErrorBoundary>
          <Text>Test content</Text>
        </ErrorBoundary>,
      );

      expect(getByText('Test content')).toBeTruthy();
      expect(queryByText('Something went wrong')).toBeNull();
    });

    it('renders multiple children when no error occurs', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <Text>First child</Text>
          <Text>Second child</Text>
        </ErrorBoundary>,
      );

      expect(getByText('First child')).toBeTruthy();
      expect(getByText('Second child')).toBeTruthy();
    });

    it('renders nested components when no error occurs', async () => {
      const NestedComponent = () => (
        <Text>Nested component</Text>
      );

      const { getByText } = await render(
        <ErrorBoundary>
          <NestedComponent />
        </ErrorBoundary>,
      );

      expect(getByText('Nested component')).toBeTruthy();
    });
  });

  describe('Error Catching', () => {
    it('catches error from child component', async () => {
      const { getByText, queryByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
      expect(queryByText('Normal content')).toBeNull();
    });

    it('displays error message', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(
        getByText("We're sorry for the inconvenience. Please try restarting the app."),
      ).toBeTruthy();
    });

    it('displays Try Again button when error occurs', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Try Again')).toBeTruthy();
    });

    it('calls componentDidCatch when error is caught', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Custom error message" />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('catches errors from nested components', async () => {
      const NestedThrowError = () => <ThrowError shouldThrow={true} />;

      const { getByText } = await render(
        <ErrorBoundary>
          <NestedThrowError />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('catches errors with custom messages', async () => {
      await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Custom error message" />
        </ErrorBoundary>,
      );

      // Error is caught regardless of message
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('has a Try Again button that can be pressed', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Try Again button should be pressable
      const button = getByText('Try Again');
      await fireEvent.press(button);
    });

    it('catches error again if children still throw after reset', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Click Try Again - error will occur again
      await fireEvent.press(getByText('Try Again'));

      // Should still show error UI (children still throw)
      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('allows multiple button presses', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const button = getByText('Try Again');

      // Click Try Again multiple times - should not throw
      await (async () => {
        await fireEvent.press(button);
        await fireEvent.press(button);
        await fireEvent.press(button);
      })();
    });

    it('handleReset method exists and can be called', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Verify button exists and can be pressed without throwing
      const button = getByText('Try Again');
      expect(button).toBeTruthy();
      await fireEvent.press(button);

      // Error boundary stays in error state (expected behavior)
      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Error State Management', () => {
    it('initializes with no error state', async () => {
      const { queryByText } = await render(
        <ErrorBoundary>
          <Text>Content</Text>
        </ErrorBoundary>,
      );

      expect(queryByText('Something went wrong')).toBeNull();
    });

    it('updates state when error is caught', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Error UI is shown, indicating state was updated
      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('maintains error state after catching error', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Error state should be maintained
      expect(getByText('Something went wrong')).toBeTruthy();

      // Click Try Again - state is cleared but children still throw
      await fireEvent.press(getByText('Try Again'));

      // Error should be caught again and state maintained
      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Console Logging', () => {
    it('logs error to console when caught', async () => {
      await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Test error message" />
        </ErrorBoundary>,
      );

      expect(consoleErrorSpy).toHaveBeenCalled();

      // Check that console.error was called with error boundary message
      const calls = consoleErrorSpy.mock.calls;
      const hasErrorBoundaryLog = calls.some(call =>
        call.some(arg =>
          typeof arg === 'string' && arg.includes('Error Boundary caught an error'),
        ),
      );
      expect(hasErrorBoundaryLog).toBe(true);
    });

    it('logs error details including error info', async () => {
      await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Console.error should be called for componentDidCatch
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles errors with null message', async () => {
      const ThrowNullError = () => {
        throw new Error(null);
      };

      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowNullError />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles errors with undefined message', async () => {
      const ThrowUndefinedError = () => {
        throw new Error(undefined);
      };

      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowUndefinedError />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles errors thrown during render', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles errors from components that mount/unmount', async () => {
      const { getByText, rerender } = await render(
        <ErrorBoundary>
          <Text>Initial content</Text>
        </ErrorBoundary>,
      );

      // Replace with error-throwing component
      await rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles rapidly thrown errors', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="First error" />
        </ErrorBoundary>,
      );

      // Should handle the error
      expect(getByText('Something went wrong')).toBeTruthy();

      // Reset
      await fireEvent.press(getByText('Try Again'));

      // Should handle subsequent error
      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Multiple Error Boundaries', () => {
    it('allows nested error boundaries', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <Text>Outer content</Text>
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>,
      );

      // Inner error boundary should catch the error
      expect(getByText('Something went wrong')).toBeTruthy();
      expect(getByText('Outer content')).toBeTruthy();
    });

    it('isolates errors to specific boundaries', async () => {
      const { getByText, getAllByText } = await render(
        <ErrorBoundary>
          <ErrorBoundary>
            <Text>Safe content 1</Text>
          </ErrorBoundary>
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
          <ErrorBoundary>
            <Text>Safe content 2</Text>
          </ErrorBoundary>
        </ErrorBoundary>,
      );

      // Only the second boundary should show error UI
      expect(getAllByText('Something went wrong')).toHaveLength(1);
      expect(getByText('Safe content 1')).toBeTruthy();
      expect(getByText('Safe content 2')).toBeTruthy();
    });
  });

  describe('Error Propagation', () => {
    it('does not propagate error to parent if caught', async () => {
      const { getByText, queryAllByText } = await render(
        <ErrorBoundary>
          <Text>Parent content</Text>
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>,
      );

      // Only inner boundary shows error UI
      expect(queryAllByText('Something went wrong')).toHaveLength(1);
      expect(getByText('Parent content')).toBeTruthy();
    });

    it('catches errors from any descendant component', async () => {
      const DeepNested = () => (
        <Text>
          <Text>
            <ThrowError shouldThrow={true} />
          </Text>
        </Text>
      );

      const { getByText } = await render(
        <ErrorBoundary>
          <DeepNested />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('provides accessible error message', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const errorMessage = getByText(
        "We're sorry for the inconvenience. Please try restarting the app.",
      );
      expect(errorMessage).toBeTruthy();
    });

    it('provides accessible Try Again button', async () => {
      const { getByText } = await render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const button = getByText('Try Again');
      expect(button).toBeTruthy();
    });
  });
});
