import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationDigestCard, useNotificationDigest } from '../react';
import { buildDigestRollup } from '../triage';
import type { ActionableNotification } from '../types';

const n = (over: Partial<ActionableNotification>): ActionableNotification => ({
  id: 'a',
  tier: 'info',
  title: 'Hello',
  source: 'tracker',
  createdAt: '2026-11-01T00:00:00Z',
  read: false,
  ...over,
});

beforeEach(() => window.localStorage.clear());

describe('useNotificationDigest', () => {
  it('clears isSummarizing when unread items are cleared mid-flight', async () => {
    const summarizer = () => new Promise<string>(() => {});
    const { result } = renderHook(() =>
      useNotificationDigest({ initial: [n({ id: '1' })], summarizer })
    );
    await waitFor(() => expect(result.current.isSummarizing).toBe(true));
    act(() => result.current.markAllRead());
    await waitFor(() => expect(result.current.isSummarizing).toBe(false));
  });

  it('drops a stale summary when notification content changes', async () => {
    const summarizer = async (items: readonly ActionableNotification[]) => items[0].title;
    const { result } = renderHook(() =>
      useNotificationDigest({ initial: [n({ id: '1', title: 'arriving' })], summarizer })
    );
    await waitFor(() => expect(result.current.digest.summary).toBe('arriving'));
    act(() => result.current.ingest([n({ id: '1', title: 'canceled' })]));
    expect(result.current.digest.summary).not.toBe('arriving');
    await waitFor(() => expect(result.current.digest.summary).toBe('canceled'));
  });

  it('manages state through actions', () => {
    const { result } = renderHook(() => useNotificationDigest({ initial: [n({ id: '1' })] }));
    expect(result.current.digest.unread).toBe(1);
    act(() => result.current.ingest([n({ id: '2', tier: 'critical' })]));
    expect(result.current.digest.topTier).toBe('critical');
    act(() => result.current.markAllRead());
    expect(result.current.digest.unread).toBe(0);
  });
});

describe('NotificationDigestCard', () => {
  it('does not render unsafe action links', () => {
    const digest = buildDigestRollup([
      n({ id: '1', title: 'Bad', actionUrl: 'javascript:alert(1)', actionLabel: 'BadLink' }),
      n({ id: '2', title: 'Good', actionUrl: 'https://example.com', actionLabel: 'GoodLink' }),
    ]);
    render(<NotificationDigestCard digest={digest} defaultOpen storageKey={null} />);
    expect(screen.queryByText('BadLink')).toBeNull();
    expect(screen.getByText('GoodLink')).toBeTruthy();
  });

  it('shows badge, tier accent, and persists open state', () => {
    const digest = buildDigestRollup([n({ id: '1', tier: 'critical', title: 'Blocked' })]);
    const { unmount } = render(<NotificationDigestCard digest={digest} />);
    expect(screen.getByTestId('unread-badge').textContent).toBe('1');
    expect(screen.getByTestId('notification-digest-card').className).toContain('border-l-rose-500');
    expect(screen.queryByText('Blocked')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByText('Blocked')).toBeTruthy();
    unmount();
    render(<NotificationDigestCard digest={digest} />);
    expect(screen.getByText('Blocked')).toBeTruthy();
  });

  it('renders empty state when open with no items', () => {
    render(<NotificationDigestCard digest={buildDigestRollup([])} defaultOpen storageKey={null} />);
    expect(screen.getByText(/all caught up/)).toBeTruthy();
  });
});
