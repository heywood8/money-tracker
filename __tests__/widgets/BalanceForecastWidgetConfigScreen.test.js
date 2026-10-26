import React from 'react';
import { BackHandler } from 'react-native';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';
import BalanceForecastWidgetConfigScreen from '../../app/widgets/BalanceForecastWidgetConfigScreen';
import { getAllAccounts } from '../../app/services/AccountsDB';
import { resolveLanguage } from '../../app/services/notifications/notificationStrings';
import { getWidgetConfig, setWidgetConfig } from '../../app/widgets/balanceForecastWidgetStore';
import { renderBalanceForecastWidget, refreshBalanceForecastWidgets } from '../../app/widgets/balanceForecastWidgetRender';

const mockDisplay = { hideBalances: false };

jest.mock('../../app/services/AccountsDB', () => ({ getAllAccounts: jest.fn() }));
jest.mock('../../app/services/notifications/notificationStrings', () => ({
  ...jest.requireActual('../../app/services/notifications/notificationStrings'),
  resolveLanguage: jest.fn(),
}));
jest.mock('../../app/widgets/balanceForecastWidgetStore', () => ({
  ...jest.requireActual('../../app/widgets/balanceForecastWidgetStore'),
  getWidgetConfig: jest.fn(),
  setWidgetConfig: jest.fn(),
}));
jest.mock('../../app/widgets/balanceForecastWidgetRender', () => ({
  renderBalanceForecastWidget: jest.fn(),
  refreshBalanceForecastWidgets: jest.fn(),
}));
// The real provider reads preferences from the database; the screen only needs
// it to be there for the account grid's hide-balances read.
jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  DisplaySettingsProvider: ({ children }) => children,
  useDisplaySettings: () => mockDisplay,
}));

const CARD = { id: 1, name: 'Card', currency: 'USD', balance: '100', hidden: 0 };
const CASH = { id: 2, name: 'Cash', currency: 'USD', balance: '50', hidden: 0 };
const OLD = { id: 3, name: 'Old account', currency: 'USD', balance: '0', hidden: 1 };
const ALL_COLUMNS = ['balance', 'daily', 'forecast'];
const widgetInfo = { widgetName: 'BalanceForecast', widgetId: 7, width: 300, height: 180 };
const RENDERED = { light: 'l', dark: 'd' };

const setup = async () => {
  const props = { widgetInfo, renderWidget: jest.fn(), setResult: jest.fn() };
  await render(<BalanceForecastWidgetConfigScreen {...props} />);
  return props;
};

const checked = (id) => screen.getByTestId(`widget-forecast-account-${id}`).props.accessibilityState.checked;

describe('BalanceForecastWidgetConfigScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisplay.hideBalances = false;
    getAllAccounts.mockResolvedValue([CARD, CASH, OLD]);
    resolveLanguage.mockResolvedValue('en');
    getWidgetConfig.mockResolvedValue({ accountIds: null, columns: ALL_COLUMNS });
    setWidgetConfig.mockResolvedValue(undefined);
    renderBalanceForecastWidget.mockResolvedValue(RENDERED);
  });

  it('offers the active accounts, all picked for a new widget', async () => {
    await setup();

    await waitFor(() => expect(screen.getByTestId('widget-forecast-account-1')).toBeTruthy());
    expect(screen.getByText('What should the widget show?')).toBeTruthy();
    expect(screen.queryByText('Old account')).toBeNull();
    expect(checked(1)).toBe(true);
    expect(checked(2)).toBe(true);
  });

  it('marks the accounts a configured widget shows', async () => {
    getWidgetConfig.mockResolvedValue({ accountIds: ['2'], columns: ALL_COLUMNS });
    await setup();

    await waitFor(() => expect(screen.getByTestId('widget-forecast-account-2')).toBeTruthy());
    expect(checked(1)).toBe(false);
    expect(checked(2)).toBe(true);
  });

  it('saves the picked accounts, draws the widget and finishes', async () => {
    const { renderWidget, setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-account-1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-account-1'));
    expect(checked(1)).toBe(false);
    await fireEvent.press(screen.getByTestId('widget-forecast-done'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(setWidgetConfig).toHaveBeenCalledWith(7, { accountIds: ['2'], columns: ALL_COLUMNS });
    expect(renderBalanceForecastWidget).toHaveBeenCalledWith(widgetInfo);
    expect(renderWidget).toHaveBeenCalledWith(RENDERED);
  });

  it('saves every account picked as every account, so ones opened later join', async () => {
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-done')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-done'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(setWidgetConfig).toHaveBeenCalledWith(7, { accountIds: null, columns: ALL_COLUMNS });
  });

  describe('columns', () => {
    const columnChecked = (column) => screen.getByTestId(`widget-forecast-column-${column}`)
      .props.accessibilityState.checked;

    it('offers the three columns, all picked for a new widget', async () => {
      await setup();
      await waitFor(() => expect(screen.getByTestId('widget-forecast-column-balance')).toBeTruthy());

      expect(screen.getByText('Columns')).toBeTruthy();
      expect(screen.getByText('Balance now')).toBeTruthy();
      expect(screen.getByText('Spending per day')).toBeTruthy();
      expect(screen.getByText('Balance forecast')).toBeTruthy();
      ALL_COLUMNS.forEach((column) => expect(columnChecked(column)).toBe(true));
    });

    it('marks the columns a configured widget shows', async () => {
      getWidgetConfig.mockResolvedValue({ accountIds: null, columns: ['forecast'] });
      await setup();
      await waitFor(() => expect(screen.getByTestId('widget-forecast-column-forecast')).toBeTruthy());

      expect(columnChecked('balance')).toBe(false);
      expect(columnChecked('daily')).toBe(false);
      expect(columnChecked('forecast')).toBe(true);
    });

    it('saves the columns picked, in the table’s order', async () => {
      getWidgetConfig.mockResolvedValue({ accountIds: null, columns: ['forecast'] });
      const { setResult } = await setup();
      await waitFor(() => expect(screen.getByTestId('widget-forecast-column-balance')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('widget-forecast-column-daily'));
      await fireEvent.press(screen.getByTestId('widget-forecast-column-balance'));
      await fireEvent.press(screen.getByTestId('widget-forecast-done'));

      await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
      expect(setWidgetConfig).toHaveBeenCalledWith(7, { accountIds: null, columns: ALL_COLUMNS });
    });

    it('drops a column on a second tap, but never the last one', async () => {
      const { setResult } = await setup();
      await waitFor(() => expect(screen.getByTestId('widget-forecast-column-balance')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('widget-forecast-column-balance'));
      await fireEvent.press(screen.getByTestId('widget-forecast-column-daily'));
      await fireEvent.press(screen.getByTestId('widget-forecast-column-forecast'));
      expect(columnChecked('forecast')).toBe(true);

      await fireEvent.press(screen.getByTestId('widget-forecast-done'));
      await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
      expect(setWidgetConfig).toHaveBeenCalledWith(7, { accountIds: null, columns: ['forecast'] });
    });
  });

  it('will not finish with nothing picked', async () => {
    getWidgetConfig.mockResolvedValue({ accountIds: ['1'], columns: ALL_COLUMNS });
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-account-1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-account-1'));

    expect(screen.getByTestId('widget-forecast-done').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('widget-forecast-done'));
    expect(setResult).not.toHaveBeenCalled();
  });

  it('still finishes when drawing fails, leaving the draw to a background refresh', async () => {
    renderBalanceForecastWidget.mockRejectedValue(new Error('db'));
    const { renderWidget, setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-done')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-done'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    expect(renderWidget).not.toHaveBeenCalled();
    expect(refreshBalanceForecastWidgets).toHaveBeenCalled();
  });

  it('still finishes when the picks cannot be saved', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    setWidgetConfig.mockRejectedValue(new Error('io'));
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-done')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-done'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    console.warn.mockRestore();
  });

  it('answers the launcher once, however often Done is tapped', async () => {
    let finishDraw;
    renderBalanceForecastWidget.mockReturnValue(new Promise((resolve) => { finishDraw = resolve; }));
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-done')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-done'));
    await fireEvent.press(screen.getByTestId('widget-forecast-cancel'));
    await act(async () => { finishDraw(RENDERED); });

    await waitFor(() => expect(setResult).toHaveBeenCalledTimes(1));
    expect(setResult).toHaveBeenCalledWith('ok');
  });

  it('places a widget with no accounts to pick when asked to', async () => {
    getAllAccounts.mockResolvedValue([OLD]);
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-add-anyway')).toBeTruthy());
    expect(screen.getByText('No accounts yet.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('widget-forecast-add-anyway'));

    await waitFor(() => expect(setResult).toHaveBeenCalledWith('ok'));
    // Every account: the first one opened shows up on it.
    expect(setWidgetConfig).toHaveBeenCalledWith(7, { accountIds: null, columns: ALL_COLUMNS });
  });

  it('treats unreadable accounts as none', async () => {
    getAllAccounts.mockRejectedValue(new Error('db'));
    await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-add-anyway')).toBeTruthy());
  });

  it('cancels from the button', async () => {
    const { setResult } = await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-cancel')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('widget-forecast-cancel'));

    expect(setResult).toHaveBeenCalledWith('cancel');
    expect(setWidgetConfig).not.toHaveBeenCalled();
  });

  it('cancels on hardware back, swallowing the key', async () => {
    let backHandler;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
      backHandler = handler;
      return { remove: jest.fn() };
    });
    const { setResult } = await setup();

    expect(backHandler()).toBe(true);
    expect(setResult).toHaveBeenCalledWith('cancel');
    BackHandler.addEventListener.mockRestore();
  });

  it('speaks the app’s language', async () => {
    resolveLanguage.mockResolvedValue('ru');
    await setup();

    await waitFor(() => expect(screen.getByText('Что показывать в виджете?')).toBeTruthy());
    expect(screen.getByText('Отмена')).toBeTruthy();
  });

  it('hides balances in the picker when the app does', async () => {
    mockDisplay.hideBalances = true;
    await setup();
    await waitFor(() => expect(screen.getByTestId('widget-forecast-account-1')).toBeTruthy());
    expect(screen.getAllByText('••••')).toHaveLength(2);
  });
});
