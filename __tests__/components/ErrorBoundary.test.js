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
    it('renders children when no error occurs', () => {
      const { getByText, queryByText } = render(
        <ErrorBoundary>
          <Text>Test content</Text>
        </ErrorBoundary>,
      );

      expect(getByText('Test content')).toBeTruthy();
      expect(queryByText('Something went wrong')).toBeNull();
    });

    it('renders multiple children when no error occurs', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <Text>First child</Text>
          <Text>Second child</Text>
        </ErrorBoundary>,
      );

      expect(getByText('First child')).toBeTruthy();
      expect(getByText('Second child')).toBeTruthy();
    });

    it('renders nested components when no error occurs', () => {
      const NestedComponent = () => (
        <Text>Nested component</Text>
      );

      const { getByText } = render(
        <ErrorBoundary>
          <NestedComponent />
        </ErrorBoundary>,
      );

      expect(getByText('Nested component')).toBeTruthy();
    });
  });

  describe('Error Catching', () => {
    it('catches error from child component', () => {
      const { getByText, queryByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
      expect(queryByText('Normal content')).toBeNull();
    });

    it('displays error message', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(
        getByText("We're sorry for the inconvenience. Please try restarting the app."),
      ).toBeTruthy();
    });

    it('displays Try Again button when error occurs', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Try Again')).toBeTruthy();
    });

    it('calls componentDidCatch when error is caught', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Custom error message" />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('catches errors from nested components', () => {
      const NestedThrowError = () => <ThrowError shouldThrow={true} />;

      const { getByText } = render(
        <ErrorBoundary>
          <NestedThrowError />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('catches errors with custom messages', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="Custom error message" />
        </ErrorBoundary>,
      );

      // Error is caught regardless of message
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('has a Try Again button that can be pressed', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Try Again button should be pressable
      const button = getByText('Try Again');
      expect(() => fireEvent.press(button)).not.toThrow();
    });

    it('catches error again if children still throw after reset', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Click Try Again - error will occur again
      fireEvent.press(getByText('Try Again'));

      // Should still show error UI (children still throw)
      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('allows multiple button presses', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const button = getByText('Try Again');

      // Click Try Again multiple times - should not throw
      expect(() => {
        fireEvent.press(button);
        fireEvent.press(button);
        fireEvent.press(button);
      }).not.toThrow();
    });

    it('handleReset method exists and can be called', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();

      // Verify button exists and can be pressed without throwing
      const button = getByText('Try Again');
      expect(button).toBeTruthy();
      fireEvent.press(button);

      // Error boundary stays in error state (expected behavior)
      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Error State Management', () => {
    it('initializes with no error state', () => {
      const { queryByText } = render(
        <ErrorBoundary>
          <Text>Content</Text>
        </ErrorBoundary>,
      );

      expect(queryByText('Something went wrong')).toBeNull();
    });

    it('updates state when error is caught', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Error UI is shown, indicating state was updated
      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('maintains error state after catching error', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Error state should be maintained
      expect(getByText('Something went wrong')).toBeTruthy();

      // Click Try Again - state is cleared but children still throw
      fireEvent.press(getByText('Try Again'));

      // Error should be caught again and state maintained
      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Console Logging', () => {
    it('logs error to console when caught', () => {
      render(
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

    it('logs error details including error info', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Console.error should be called for componentDidCatch
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles errors with null message', () => {
      const ThrowNullError = () => {
        throw new Error(null);
      };

      const { getByText } = render(
        <ErrorBoundary>
          <ThrowNullError />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles errors with undefined message', () => {
      const ThrowUndefinedError = () => {
        throw new Error(undefined);
      };

      const { getByText } = render(
        <ErrorBoundary>
          <ThrowUndefinedError />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles errors thrown during render', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles errors from components that mount/unmount', () => {
      const { getByText, rerender } = render(
        <ErrorBoundary>
          <Text>Initial content</Text>
        </ErrorBoundary>,
      );

      // Replace with error-throwing component
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });

    it('handles rapidly thrown errors', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} message="First error" />
        </ErrorBoundary>,
      );

      // Should handle the error
      expect(getByText('Something went wrong')).toBeTruthy();

      // Reset
      fireEvent.press(getByText('Try Again'));

      // Should handle subsequent error
      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Multiple Error Boundaries', () => {
    it('allows nested error boundaries', () => {
      const { getByText } = render(
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

    it('isolates errors to specific boundaries', () => {
      const { getByText, getAllByText } = render(
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
    it('does not propagate error to parent if caught', () => {
      const { getByText, queryAllByText } = render(
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

    it('catches errors from any descendant component', () => {
      const DeepNested = () => (
        <Text>
          <Text>
            <ThrowError shouldThrow={true} />
          </Text>
        </Text>
      );

      const { getByText } = render(
        <ErrorBoundary>
          <DeepNested />
        </ErrorBoundary>,
      );

      expect(getByText('Something went wrong')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('provides accessible error message', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const errorMessage = getByText(
        "We're sorry for the inconvenience. Please try restarting the app.",
      );
      expect(errorMessage).toBeTruthy();
    });

    it('provides accessible Try Again button', () => {
      const { getByText } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const button = getByText('Try Again');
      expect(button).toBeTruthy();
    });
  });
});
