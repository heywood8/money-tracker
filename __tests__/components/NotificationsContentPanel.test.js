import React from 'react';
import { render } from '@testing-library/react-native';
import NotificationsContentPanel from '../../app/components/NotificationsContentPanel';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff',
      surface: '#f5f5f5',
      primary: '#6200ee',
      text: '#000',
      mutedText: '#888',
      border: '#ddd',
    },
  }),
}));

jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
  SPACING: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  BORDER_RADIUS: { md: 8, lg: 16 },
}));

const baseProps = {
  isLoading: false,
  notifications: [],
  onRefresh: jest.fn(),
  bottomInset: 0,
};

describe('NotificationsContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state while fetching', async () => {
    const { getByText } = await render(
      <NotificationsContentPanel {...baseProps} isLoading />,
    );
    expect(getByText('notifications_loading')).toBeTruthy();
  });

  it('shows an empty state when there are no notifications', async () => {
    const { getByText } = await render(<NotificationsContentPanel {...baseProps} />);
    expect(getByText('notifications_empty')).toBeTruthy();
  });

  it('renders one card per recent notification', async () => {
    const notifications = [
      { title: 'Bank', text: 'You spent $5', packageName: 'com.bank', postTime: 1718000000000 },
      { title: 'Chat', text: 'New message', packageName: 'com.chat', postTime: 1718000100000 },
    ];
    const { getByText } = await render(
      <NotificationsContentPanel {...baseProps} notifications={notifications} />,
    );
    expect(getByText('notifications_recent')).toBeTruthy();
    expect(getByText('Bank')).toBeTruthy();
    expect(getByText('You spent $5')).toBeTruthy();
    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('New message')).toBeTruthy();
    expect(getByText('com.bank')).toBeTruthy();
  });

  it('falls back to a "no text" label when a notification has neither title nor text', async () => {
    const notifications = [
      { title: '', text: '', packageName: 'com.empty', postTime: 1718000000000 },
    ];
    const { getByText } = await render(
      <NotificationsContentPanel {...baseProps} notifications={notifications} />,
    );
    expect(getByText('notification_no_text')).toBeTruthy();
  });
});
