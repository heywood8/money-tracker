/**
 * Tests for the templates list — the panel that answers "what can Penny read?"
 * and lets a misfiring template be switched off rather than lost.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationTemplatesContentPanel from '../../app/components/NotificationTemplatesContentPanel';
import * as customTemplates from '../../app/services/notifications/customTemplates';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff', surface: '#f5f5f5', primary: '#6200ee', text: '#000',
      mutedText: '#888', border: '#ddd', destructive: '#d9534f',
      income: '#4a8a4a', expense: '#5a3030',
    },
  }),
}));
jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [{ id: 'c1', name: 'Food', categoryType: 'expense', parentId: null }],
  }),
}));

// The panel reads through the parser's cache, so loading it also re-syncs the
// cache — mocking that one call covers both.
jest.mock('../../app/services/notifications/customTemplates', () => ({
  deleteCustomTemplate: jest.fn(async () => {}),
  setCustomTemplateEnabled: jest.fn(async () => {}),
  reloadCustomTemplates: jest.fn(async () => []),
}));

const TEMPLATE = {
  id: 'tpl-1',
  name: 'ACBA purchase',
  packageName: 'com.acba.mobile',
  type: 'expense',
  enabled: true,
  priority: 0,
  categoryId: 'c1',
  currency: 'AMD',
  dateOrder: 'dmy',
  triggers: ['PURCHASE'],
  sample: { title: '', text: 'PURCHASE 500 AMD' },
  fields: {
    amount: { source: 'text', kind: 'amount', before: 'PURCHASE ', after: ' ', value: '500', occurrence: 0 },
    merchant: { source: 'text', kind: 'merchant', before: 'AMD ', after: '', value: 'SHOP', occurrence: 0 },
  },
};

let screen;

const renderPanel = async (props = {}) => {
  screen = await render(<NotificationTemplatesContentPanel {...props} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  customTemplates.reloadCustomTemplates.mockResolvedValue([TEMPLATE]);
});

describe('the list', () => {
  it('shows each custom template with its app and extracted fields', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByText('ACBA purchase')).toBeTruthy());
    expect(screen.getByText('com.acba.mobile')).toBeTruthy();
    expect(screen.getByText(/notification_template_field_amount/)).toBeTruthy();
    // "PURCHASE" is both this template's trigger badge and a built-in Ameria
    // kind further down the list, so both are expected.
    expect(screen.getAllByText('PURCHASE').length).toBeGreaterThanOrEqual(1);
  });

  it('lists the built-in parsers so the panel answers "is my bank supported?"', async () => {
    customTemplates.reloadCustomTemplates.mockResolvedValue([]);
    await renderPanel();
    await waitFor(() => expect(screen.getByText('Ameriabank')).toBeTruthy());
    expect(screen.getByText('Tinkoff / T-Bank')).toBeTruthy();
    // …with the kinds each one recognizes.
    expect(screen.getByText('ATM CASH')).toBeTruthy();
    expect(screen.getByText('ПОКУПКА')).toBeTruthy();
  });

  it('invites the user to build one when they have none', async () => {
    customTemplates.reloadCustomTemplates.mockResolvedValue([]);
    await renderPanel();
    await waitFor(() => expect(screen.getByText('notification_templates_empty')).toBeTruthy());
  });

  it('survives a failed load rather than showing nothing at all', async () => {
    customTemplates.reloadCustomTemplates.mockRejectedValue(new Error('db down'));
    await renderPanel();
    await waitFor(() => expect(screen.getByText('Ameriabank')).toBeTruthy());
  });
});

describe('switching a template off', () => {
  it('disables it without deleting the marking work', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByText('ACBA purchase')).toBeTruthy());

    await fireEvent(screen.getByTestId('template-toggle-tpl-1'), 'valueChange', false);
    await waitFor(() => expect(customTemplates.setCustomTemplateEnabled)
      .toHaveBeenCalledWith('tpl-1', false));
    expect(customTemplates.deleteCustomTemplate).not.toHaveBeenCalled();
  });
});

describe('deleting a template', () => {
  it('takes two taps', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByText('ACBA purchase')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('template-delete-tpl-1'));
    expect(customTemplates.deleteCustomTemplate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('template-delete-confirm-tpl-1'));
    await waitFor(() => expect(customTemplates.deleteCustomTemplate).toHaveBeenCalledWith('tpl-1'));
  });

  it('can be backed out of', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByText('ACBA purchase')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('template-delete-tpl-1'));
    await fireEvent.press(screen.getByLabelText('cancel'));
    expect(screen.getByTestId('template-delete-tpl-1')).toBeTruthy();
    expect(customTemplates.deleteCustomTemplate).not.toHaveBeenCalled();
  });
});

describe('editing', () => {
  it('hands the template back to the host', async () => {
    const onEdit = jest.fn();
    await renderPanel({ onEdit });
    await waitFor(() => expect(screen.getByText('ACBA purchase')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('template-edit-tpl-1'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }));
  });

  it('offers no edit button for a template whose sample is gone', async () => {
    // A template restored from a backup taken before samples were stored has
    // nothing to re-mark against, so it can only be deleted.
    customTemplates.reloadCustomTemplates.mockResolvedValue([
      { ...TEMPLATE, sample: { title: '', text: '' } },
    ]);
    await renderPanel({ onEdit: jest.fn() });
    await waitFor(() => expect(screen.getByText('ACBA purchase')).toBeTruthy());
    expect(screen.queryByTestId('template-edit-tpl-1')).toBeNull();
    expect(screen.getByTestId('template-delete-tpl-1')).toBeTruthy();
  });
});
