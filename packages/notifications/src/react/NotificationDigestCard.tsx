import * as Collapsible from '@radix-ui/react-collapsible';
import { useCallback, useState, type ReactNode } from 'react';
import type { ActionableNotification, DigestRollup, UrgencyTier } from '../types';

export const TIER_STYLES: Record<UrgencyTier, { rail: string; glyph: string; label: string }> = {
  critical: { rail: 'border-l-4 border-l-rose-500', glyph: '!', label: 'Critical' },
  attention: { rail: 'border-l-4 border-l-amber-400', glyph: '•', label: 'Needs attention' },
  info: { rail: 'border-l-4 border-l-sky-500', glyph: 'i', label: 'Info' },
};

const DEFAULT_STORAGE_KEY = 'sunshade:notification-digest:open';

function readStoredOpen(key: string | null, fallback: boolean): boolean {
  if (!key || typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeStoredOpen(key: string | null, open: boolean): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, open ? '1' : '0');
  } catch {
    /* storage unavailable; state stays in-memory */
  }
}

export interface NotificationDigestCardProps {
  digest: DigestRollup;
  title?: string;
  defaultOpen?: boolean;
  /** localStorage key for persisted open state. Pass null to disable persistence. */
  storageKey?: string | null;
  className?: string;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onDismiss?: (id: string) => void;
  /** Override rendering of a single row. */
  renderItem?: (item: ActionableNotification) => ReactNode;
  emptyState?: ReactNode;
}

export function NotificationDigestCard({
  digest,
  title = 'Notifications',
  defaultOpen = false,
  storageKey = DEFAULT_STORAGE_KEY,
  className = '',
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  renderItem,
  emptyState = <p className="px-4 py-3 text-sm text-slate-500">You're all caught up.</p>,
}: NotificationDigestCardProps) {
  const [open, setOpen] = useState(() => readStoredOpen(storageKey, defaultOpen));
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      writeStoredOpen(storageKey, next);
    },
    [storageKey]
  );

  const tier = digest.topTier ?? 'info';
  const style = TIER_STYLES[tier];

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={handleOpenChange}
      data-testid="notification-digest-card"
      data-tier={tier}
      className={`rounded-md border border-slate-200 bg-white ${style.rail} ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <Collapsible.Trigger asChild>
          <button type="button" className="flex flex-1 items-center gap-2 text-left font-medium">
            <span aria-hidden="true">{style.glyph}</span>
            <span>{title}</span>
            {digest.unread > 0 && (
              <span
                data-testid="unread-badge"
                aria-label={`${digest.unread} unread`}
                className="animate-pulse rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white"
              >
                {digest.unread}
              </span>
            )}
          </button>
        </Collapsible.Trigger>
        {digest.unread > 0 && onMarkAllRead && (
          <button type="button" className="text-xs text-slate-500 underline" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>
      {digest.summary && <p className="px-4 pb-2 text-sm text-slate-600">{digest.summary}</p>}
      <Collapsible.Content>
        {digest.items.length === 0 ? (
          emptyState
        ) : (
          <ul className="divide-y divide-slate-100">
            {digest.items.map((item) =>
              renderItem ? (
                <li key={item.id}>{renderItem(item)}</li>
              ) : (
                <li
                  key={item.id}
                  data-tier={item.tier}
                  className={`${TIER_STYLES[item.tier].rail} flex items-start gap-2 px-4 py-2 ${
                    item.read ? 'opacity-60' : ''
                  }`}
                >
                  <span aria-hidden="true">{TIER_STYLES[item.tier].glyph}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.body && <p className="text-xs text-slate-600">{item.body}</p>}
                    {item.actionUrl && (
                      <a href={item.actionUrl} className="text-xs text-sky-600 underline">
                        {item.actionLabel ?? 'Open'}
                      </a>
                    )}
                  </div>
                  {!item.read && onMarkRead && (
                    <button type="button" className="text-xs" onClick={() => onMarkRead(item.id)}>
                      Mark read
                    </button>
                  )}
                  {onDismiss && (
                    <button
                      type="button"
                      aria-label={`Dismiss ${item.title}`}
                      className="text-xs"
                      onClick={() => onDismiss(item.id)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
