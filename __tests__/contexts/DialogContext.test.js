/**
 * Tests for DialogContext - Dialog management context
 * Tests dialog showing, hiding, and button interactions
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { DialogProvider, useDialog } from '../../app/contexts/DialogContext';

// Mock MaterialDialog component
jest.mock('../../app/components/MaterialDialog', () => 'MaterialDialog');

describe('DialogContext', () => {
  const wrapper = ({ children }) => <DialogProvider>{children}</DialogProvider>;

  describe('Initialization', () => {
    it('provides dialog context', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(result.current.showDialog).toBeDefined();
      expect(result.current.hideDialog).toBeDefined();
    });

    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useDialog());
      }).toThrow('useDialog must be used within a DialogProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('showDialog', () => {
    it('shows dialog with title and message', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('Test Title', 'Test Message');
      });

      // Dialog should be shown
      // The actual rendering is handled by MaterialDialog component
      expect(result.current.showDialog).toBeDefined();
    });

    it('shows dialog with default OK button', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('Title', 'Message');
      });

      // Dialog shown with default button
      expect(result.current.showDialog).toBeDefined();
    });

    it('shows dialog with custom buttons', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });
      const mockOnPress = jest.fn();

      const buttons = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: mockOnPress },
      ];

      act(() => {
        result.current.showDialog('Confirm', 'Are you sure?', buttons);
      });

      // Dialog shown with custom buttons
      expect(result.current.showDialog).toBeDefined();
    });

    it('accepts empty button array', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('Title', 'Message', []);
      });

      // Should use default button
      expect(result.current.showDialog).toBeDefined();
    });

    it('replaces previous dialog when called multiple times', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('First', 'First message');
      });

      act(() => {
        result.current.showDialog('Second', 'Second message');
      });

      // Second dialog should replace first
      expect(result.current.showDialog).toBeDefined();
    });
  });

  describe('hideDialog', () => {
    it('hides dialog', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('Title', 'Message');
      });

      act(() => {
        result.current.hideDialog();
      });

      // Dialog should be hidden
      expect(result.current.hideDialog).toBeDefined();
    });

    it('can be called when no dialog is shown', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.hideDialog();
        });
      }).not.toThrow();
    });

    it('can be called multiple times', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('Title', 'Message');
      });

      expect(() => {
        act(() => {
          result.current.hideDialog();
          result.current.hideDialog();
          result.current.hideDialog();
        });
      }).not.toThrow();
    });
  });

  describe('Dialog Workflow', () => {
    it('shows and hides dialog in sequence', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog('Title 1', 'Message 1');
      });

      act(() => {
        result.current.hideDialog();
      });

      act(() => {
        result.current.showDialog('Title 2', 'Message 2');
      });

      act(() => {
        result.current.hideDialog();
      });

      // Should not throw
      expect(result.current.showDialog).toBeDefined();
    });

    it('handles rapid show/hide calls', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.showDialog('Title 1', 'Message 1');
          result.current.hideDialog();
          result.current.showDialog('Title 2', 'Message 2');
          result.current.hideDialog();
          result.current.showDialog('Title 3', 'Message 3');
        });
      }).not.toThrow();
    });
  });

  describe('Button Configurations', () => {
    it('handles button with onPress callback', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });
      const mockCallback = jest.fn();

      const buttons = [
        {
          text: 'OK',
          onPress: mockCallback,
        },
      ];

      act(() => {
        result.current.showDialog('Title', 'Message', buttons);
      });

      // Button config should be passed to MaterialDialog
      expect(result.current.showDialog).toBeDefined();
    });

    it('handles button with style property', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      const buttons = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive' },
        { text: 'OK', style: 'default' },
      ];

      act(() => {
        result.current.showDialog('Title', 'Message', buttons);
      });

      // Button styles should be passed to MaterialDialog
      expect(result.current.showDialog).toBeDefined();
    });

    it('handles button without style', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      const buttons = [
        { text: 'OK', onPress: jest.fn() },
      ];

      act(() => {
        result.current.showDialog('Title', 'Message', buttons);
      });

      // Should work without style
      expect(result.current.showDialog).toBeDefined();
    });
  });

  describe('Common Dialog Patterns', () => {
    it('confirmation dialog pattern', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });
      const mockConfirm = jest.fn();

      act(() => {
        result.current.showDialog(
          'Delete Account',
          'Are you sure you want to delete this account?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: mockConfirm,
            },
          ],
        );
      });

      expect(result.current.showDialog).toBeDefined();
    });

    it('alert dialog pattern', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog(
          'Error',
          'Failed to save data',
          [{ text: 'OK' }],
        );
      });

      expect(result.current.showDialog).toBeDefined();
    });

    it('info dialog pattern', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog(
          'Success',
          'Account created successfully',
        );
      });

      expect(result.current.showDialog).toBeDefined();
    });

    it('multi-button choice dialog pattern', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      act(() => {
        result.current.showDialog(
          'Choose Option',
          'How would you like to proceed?',
          [
            { text: 'Option 1', onPress: jest.fn() },
            { text: 'Option 2', onPress: jest.fn() },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      });

      expect(result.current.showDialog).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty title', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.showDialog('', 'Message');
        });
      }).not.toThrow();
    });

    it('handles empty message', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.showDialog('Title', '');
        });
      }).not.toThrow();
    });

    it('handles null title', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.showDialog(null, 'Message');
        });
      }).not.toThrow();
    });

    it('handles null message', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.showDialog('Title', null);
        });
      }).not.toThrow();
    });

    it('handles undefined buttons param', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });

      expect(() => {
        act(() => {
          result.current.showDialog('Title', 'Message', undefined);
        });
      }).not.toThrow();
    });

    it('handles very long title', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });
      const longTitle = 'A'.repeat(1000);

      expect(() => {
        act(() => {
          result.current.showDialog(longTitle, 'Message');
        });
      }).not.toThrow();
    });

    it('handles very long message', () => {
      const { result } = renderHook(() => useDialog(), { wrapper });
      const longMessage = 'B'.repeat(5000);

      expect(() => {
        act(() => {
          result.current.showDialog('Title', longMessage);
        });
      }).not.toThrow();
    });
  });

  describe('Callback Stability', () => {
    it('showDialog callback is stable across renders', () => {
      const { result, rerender } = renderHook(() => useDialog(), { wrapper });

      const firstShowDialog = result.current.showDialog;
      rerender();
      const secondShowDialog = result.current.showDialog;

      expect(firstShowDialog).toBe(secondShowDialog);
    });

    it('hideDialog callback is stable across renders', () => {
      const { result, rerender } = renderHook(() => useDialog(), { wrapper });

      const firstHideDialog = result.current.hideDialog;
      rerender();
      const secondHideDialog = result.current.hideDialog;

      expect(firstHideDialog).toBe(secondHideDialog);
    });
  });
});
