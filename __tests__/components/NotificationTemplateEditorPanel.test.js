/**
 * Tests for the parse-template editor.
 *
 * The interaction being tested is the whole feature: tap a field, tap the words
 * that hold it, and get a template that reads the notification. The assertions
 * deliberately go through the real engine rather than mocking it — the thing
 * worth protecting is that tapping words produces a template that *works*, and a
 * mocked engine can't tell you that.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationTemplateEditorPanel from '../../app/components/NotificationTemplateEditorPanel';
import * as customTemplates from '../../app/services/notifications/customTemplates';
import { matchTemplate } from '../../app/services/notifications/templateEngine';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff', surface: '#f5f5f5', primary: '#6200ee', text: '#000',
      mutedText: '#888', border: '#ddd', selected: '#eee', destructive: '#d9534f',
      income: '#4a8a4a', expense: '#5a3030', transfer: '#5575aa', warning: '#C77700',
    },
  }),
}));
jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: 'c1', name: 'Food', categoryType: 'expense', parentId: null },
      { id: 'c2', name: 'Salary', categoryType: 'income', parentId: null },
    ],
  }),
}));
jest.mock('../../app/services/notifications/customTemplates', () => ({
  saveCustomTemplate: jest.fn(async (template) => template),
}));

const NOTIFICATION = {
  title: 'МегаФон',
  text: 'Платеж на 1 000 ₽, счет RUB\nБаланс 39 000 ₽',
  packageName: 'com.example.tb',
};

// Token offsets in the body, so a test can say "tap the word at N".
const at = (needle) => NOTIFICATION.text.indexOf(needle);

// The render result is held in a module-level `screen` rather than returned:
// spreading RNTL's result object drops its query methods, and this file's tests
// each render exactly once.
let screen;
let onDone;

const renderEditor = async (props = {}) => {
  onDone = jest.fn();
  // `render` resolves asynchronously in this project's jest setup, so it has to
  // be awaited before the queries exist.
  screen = await render(
    <NotificationTemplateEditorPanel
      notification={NOTIFICATION}
      onDone={onDone}
      {...props}
    />,
  );
};

/**
 * Mark a field by activating its chip and tapping the given body tokens.
 *
 * Every event is awaited: under React 19 `act` is asynchronous, so a press whose
 * result is asserted on the very next line has to be flushed first.
 */
const mark = async (field, offsets, source = 'text') => {
  await fireEvent.press(screen.getByTestId(`template-field-${field}`));
  for (const offset of offsets) {
    // Sequential on purpose — each tap extends the span the previous one set.
    await fireEvent.press(screen.getByTestId(`template-token-${source}-${offset}`));
  }
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('rendering the sample', () => {
  it('renders the title and the body as tappable words', async () => {
    await renderEditor();
    expect(screen.getByTestId('template-token-title-0')).toBeTruthy();
    expect(screen.getByTestId(`template-token-text-${at('Платеж')}`)).toBeTruthy();
    expect(screen.getByTestId(`template-token-text-${at('Баланс')}`)).toBeTruthy();
  });

  it('offers a chip for every markable field', async () => {
    await renderEditor();
    ['amount', 'merchant', 'currency', 'card', 'date', 'time', 'trigger'].forEach((field) => {
      expect(screen.getByTestId(`template-field-${field}`)).toBeTruthy();
    });
  });

  it('cannot be saved before anything is marked', async () => {
    await renderEditor();
    expect(screen.getByTestId('template-save').props.accessibilityState.disabled).toBe(true);
  });
});

describe('marking fields', () => {
  it('builds a template that reads the notification it was marked on', async () => {
    await renderEditor();

    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await mark('merchant', [0], 'title');
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');

    await fireEvent.press(screen.getByTestId('template-save'));

    await waitFor(() => expect(customTemplates.saveCustomTemplate).toHaveBeenCalled());
    const saved = customTemplates.saveCustomTemplate.mock.calls[0][0];
    expect(saved).toMatchObject({
      name: 'TB payment', type: 'expense', packageName: 'com.example.tb',
    });
    expect(matchTemplate({ ...saved, enabled: true }, NOTIFICATION)).toMatchObject({
      amount: '1000', currency: 'RUB', merchant: 'МегаФон',
    });
  });

  it('produces a template that generalizes to the next notification', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await mark('merchant', [0], 'title');
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    await fireEvent.press(screen.getByTestId('template-save'));

    await waitFor(() => expect(customTemplates.saveCustomTemplate).toHaveBeenCalled());
    const saved = customTemplates.saveCustomTemplate.mock.calls[0][0];
    expect(matchTemplate({ ...saved, enabled: true }, {
      title: 'Пятёрочка',
      text: 'Платеж на 2 349,90 ₽, счет RUB\nБаланс 12 000 ₽',
      packageName: 'com.example.tb',
    })).toMatchObject({ amount: '2349.90', currency: 'RUB', merchant: 'Пятёрочка' });
  });

  it('never lets the marked amount resolve to the balance', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    await fireEvent.press(screen.getByTestId('template-save'));

    await waitFor(() => expect(customTemplates.saveCustomTemplate).toHaveBeenCalled());
    const saved = customTemplates.saveCustomTemplate.mock.calls[0][0];
    expect(matchTemplate({ ...saved, enabled: true }, NOTIFICATION).amount).toBe('1000');
  });

  it('clears a field when its marked word is tapped again', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    expect(screen.getByTestId('template-save').props.accessibilityState.disabled).toBe(false);

    // Tapping a marked word again — with that field active — unmarks it, and the
    // amount is required.
    await mark('amount', [at('1 000')]);
    expect(screen.getByTestId('template-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('template_error_amount_required')).toBeTruthy();
  });

  it('marks a trigger word without touching the field rules', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await mark('trigger', [at('Платеж')]);
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    await fireEvent.press(screen.getByTestId('template-save'));

    await waitFor(() => expect(customTemplates.saveCustomTemplate).toHaveBeenCalled());
    const saved = customTemplates.saveCustomTemplate.mock.calls[0][0];
    expect(saved.triggers).toEqual(['Платеж']);
    // …and the trigger now gates the match.
    expect(matchTemplate({ ...saved, enabled: true }, {
      text: 'Пополнение на 500 ₽, счет RUB', packageName: 'com.example.tb',
    })).toBeNull();
  });
});

describe('the type and currency controls', () => {
  it('switches the template between expense and income', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await fireEvent.press(screen.getByTestId('template-type-income'));
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'Top-up');
    await fireEvent.press(screen.getByTestId('template-save'));

    await waitFor(() => expect(customTemplates.saveCustomTemplate).toHaveBeenCalled());
    expect(customTemplates.saveCustomTemplate.mock.calls[0][0].type).toBe('income');
  });

  it('blocks the save when no currency is marked and none is fixed', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    // Amount alone is not enough — the currency has to come from somewhere.
    expect(screen.getByTestId('template-save').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('template_error_currency_required')).toBeTruthy();
  });

  it('hides the date-order control until a date is marked', async () => {
    await renderEditor();
    expect(screen.queryByTestId('template-date-order-dmy')).toBeNull();
  });
});

describe('validation feedback', () => {
  it('warns when no payee is marked', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    expect(screen.getByText('template_warning_no_merchant')).toBeTruthy();
  });

  it('warns when no trigger word is marked', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    expect(screen.getByText('template_warning_no_trigger')).toBeTruthy();
  });

  it('shows an error when the template has no name yet', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    expect(screen.getByText('template_error_name_required')).toBeTruthy();
  });
});

describe('saving', () => {
  it('reports success to the host', async () => {
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    await fireEvent.press(screen.getByTestId('template-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });

  it('keeps the editor open and shows an error when the save fails', async () => {
    customTemplates.saveCustomTemplate.mockRejectedValueOnce(new Error('disk full'));
    await renderEditor();
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'TB payment');
    await fireEvent.press(screen.getByTestId('template-save'));

    await waitFor(() => expect(screen.getByText('notification_template_save_failed')).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('reports a cancel to the host without saving', async () => {
    await renderEditor();
    await fireEvent.press(screen.getByTestId('template-cancel'));
    expect(onDone).toHaveBeenCalledWith(false);
    expect(customTemplates.saveCustomTemplate).not.toHaveBeenCalled();
  });
});

describe('editing an existing template', () => {
  const EXISTING = {
    id: 'tpl-1',
    name: 'Existing',
    packageName: 'com.example.tb',
    type: 'expense',
    enabled: true,
    currency: null,
    dateOrder: 'dmy',
    categoryId: null,
    triggers: ['Платеж'],
    sample: { title: NOTIFICATION.title, text: NOTIFICATION.text },
    fields: {
      amount: { source: 'text', kind: 'amount', before: 'на ', after: ' ', value: '1 000', occurrence: 0 },
      currency: { source: 'text', kind: 'currency', before: '000 ', after: ',', value: '₽', occurrence: 0 },
    },
  };

  it('reopens with the stored name and marks in place', async () => {
    await renderEditor({ notification: null, template: EXISTING });
    expect(screen.getByTestId('template-name-input').props.value).toBe('Existing');
    expect(screen.getByTestId('template-save').props.accessibilityState.disabled).toBe(false);
  });

  it('saves back under the same id rather than creating a second template', async () => {
    await renderEditor({ notification: null, template: EXISTING });
    await fireEvent.changeText(screen.getByTestId('template-name-input'), 'Renamed');
    await fireEvent.press(screen.getByTestId('template-save'));
    await waitFor(() => expect(customTemplates.saveCustomTemplate).toHaveBeenCalled());
    expect(customTemplates.saveCustomTemplate.mock.calls[0][0]).toMatchObject({
      id: 'tpl-1', name: 'Renamed',
    });
  });
});

describe('match-rate readout', () => {
  it('counts the app’s other captured notifications a draft also reads', async () => {
    await renderEditor({
      recentNotifications: [
        NOTIFICATION,
        { text: 'Платеж на 250 ₽, счет RUB', packageName: 'com.example.tb' },
        { text: 'Ваш баланс обновлён', packageName: 'com.example.tb' },
      ],
    });
    await mark('amount', [at('1 000'), at('000 ₽')]);
    await mark('currency', [at('₽')]);
    // The readout is one Text node: "<label> 1/2 <suffix>".
    expect(screen.getByText(/notification_template_coverage/)).toBeTruthy();
    expect(screen.getByText(/1\/2/)).toBeTruthy();
  });
});
