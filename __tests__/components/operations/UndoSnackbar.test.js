import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import UndoSnackbar from '../../../app/components/operations/UndoSnackbar';

const mockColors = {
  surface: '#1e1e1e',
  altRow: '#242424',
  border: '#333',
  primary: '#4C9EFF',
  text: '#ffffff',
};

const flush = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('UndoSnackbar', () => {
  const baseProps = {
    operationId: 'op-123',
    message: 'Operation added',
    actionLabel: 'Undo',
    duration: 5000,
    colors: mockColors,
    onUndo: jest.fn(),
    onClosed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Resolve the entry/exit slide animations synchronously so the close
    // callbacks fire deterministically and no animation frames leak between
    // tests. The auto-dismiss window itself is a real setTimeout.
    jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (cb) => { if (cb) cb({ finished: true }); },
    }));
  });

  afterEach(() => {
    Animated.timing.mockRestore();
  });

  it('renders the message and action label', async () => {
    const { getByText } = await render(<UndoSnackbar {...baseProps} />);
    expect(getByText('Operation added')).toBeTruthy();
    expect(getByText('Undo')).toBeTruthy();
  });

  it('is fully opaque on mount even when animations never run', async () => {
    // Regression: the entry fade used to start the container at opacity 0 and
    // rely on a native-driver animation to reveal it. Inside an already-mounted
    // virtualized list cell that animation can fail to attach, leaving the bar
    // permanently invisible. Animated.timing is mocked to a no-op here, so this
    // asserts visibility without any animation running.
    const { getByTestId } = await render(<UndoSnackbar {...baseProps} />);
    const style = StyleSheet.flatten(getByTestId('undo-snackbar').props.style);
    expect(style.opacity).toBe(1);
  });

  it('calls onUndo with the operation id when Undo is pressed', async () => {
    const onUndo = jest.fn();
    const { getByLabelText } = await render(
      <UndoSnackbar {...baseProps} onUndo={onUndo} />,
    );
    await fireEvent.press(getByLabelText('Undo'));
    expect(onUndo).toHaveBeenCalledWith('op-123');
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('notifies the parent to close after Undo is pressed', async () => {
    const onClosed = jest.fn();
    const { getByLabelText } = await render(
      <UndoSnackbar {...baseProps} onClosed={onClosed} />,
    );
    await fireEvent.press(getByLabelText('Undo'));
    expect(onClosed).toHaveBeenCalledTimes(1);
    // The id lets the parent ignore a stale close from a previous bar.
    expect(onClosed).toHaveBeenCalledWith('op-123');
  });

  it('does not undo twice when Undo is pressed repeatedly', async () => {
    const onUndo = jest.fn();
    const { getByLabelText } = await render(
      <UndoSnackbar {...baseProps} onUndo={onUndo} />,
    );
    const button = getByLabelText('Undo');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after the duration and calls onClosed without undoing', async () => {
    const onUndo = jest.fn();
    const onClosed = jest.fn();
    await render(
      <UndoSnackbar {...baseProps} duration={40} onUndo={onUndo} onClosed={onClosed} />,
    );

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('does not auto-dismiss before the duration elapses', async () => {
    const onClosed = jest.fn();
    await render(
      <UndoSnackbar {...baseProps} duration={10000} onClosed={onClosed} />,
    );

    // Well within the 10s window — the dismiss timer has not fired.
    await flush(50);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('clears its auto-dismiss timer on unmount', async () => {
    const onClosed = jest.fn();
    const { unmount } = await render(
      <UndoSnackbar {...baseProps} duration={40} onClosed={onClosed} />,
    );

    unmount();
    // Past the (short) duration — had the timer survived, it would have fired.
    await flush(80);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
