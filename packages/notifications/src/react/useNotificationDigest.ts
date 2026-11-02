import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildDigestRollup, createTriageState, triageReducer } from '../triage';
import type { ActionableNotification, DigestRollup, DigestSummarizer } from '../types';

export interface UseNotificationDigestOptions {
  initial?: ActionableNotification[];
  /** Optional AI summarizer; only invoked when there are unread items. */
  summarizer?: DigestSummarizer;
}

export interface UseNotificationDigestResult {
  digest: DigestRollup;
  ingest: (notifications: ActionableNotification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  reset: (notifications?: ActionableNotification[]) => void;
  isSummarizing: boolean;
  summaryError: Error | null;
}

export function useNotificationDigest(
  options: UseNotificationDigestOptions = {}
): UseNotificationDigestResult {
  const { initial, summarizer } = options;
  const [state, dispatch] = useReducer(triageReducer, initial, (i) => createTriageState(i));
  const [summary, setSummary] = useState<string | undefined>();
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<Error | null>(null);
  const summarizerRef = useRef(summarizer);
  summarizerRef.current = summarizer;

  const unreadItems = useMemo(() => state.items.filter((i) => !i.read), [state.items]);
  const unreadKey = unreadItems.map((i) => i.id).sort().join('|');

  useEffect(() => {
    const run = summarizerRef.current;
    if (!run || unreadItems.length === 0) {
      setSummary(undefined);
      return;
    }
    const controller = new AbortController();
    setIsSummarizing(true);
    setSummaryError(null);
    run(unreadItems, controller.signal)
      .then((text) => {
        if (!controller.signal.aborted) setSummary(text);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setSummaryError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSummarizing(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  const digest = useMemo(() => buildDigestRollup(state.items, summary), [state.items, summary]);

  return {
    digest,
    ingest: useCallback((notifications) => dispatch({ type: 'ingest', notifications }), []),
    markRead: useCallback((id) => dispatch({ type: 'markRead', id }), []),
    markAllRead: useCallback(() => dispatch({ type: 'markAllRead' }), []),
    dismiss: useCallback((id) => dispatch({ type: 'dismiss', id }), []),
    reset: useCallback((notifications) => dispatch({ type: 'reset', notifications }), []),
    isSummarizing,
    summaryError,
  };
}
