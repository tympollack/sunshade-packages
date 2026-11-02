import { describe, expect, it } from 'vitest';
import { buildDigestRollup, createTriageState, triageReducer } from '../triage';
import { isSafeActionUrl } from '../url';
import type { ActionableNotification } from '../types';

const n = (over: Partial<ActionableNotification>): ActionableNotification => ({
  id: 'a',
  tier: 'info',
  title: 't',
  source: 'tracker',
  createdAt: '2026-11-01T00:00:00Z',
  read: false,
  ...over,
});

describe('triage', () => {
  it('rolls up unread counts and top tier', () => {
    const r = buildDigestRollup([
      n({ id: '1', tier: 'info' }),
      n({ id: '2', tier: 'critical', read: true }),
      n({ id: '3', tier: 'attention' }),
    ]);
    expect(r.total).toBe(3);
    expect(r.unread).toBe(2);
    expect(r.topTier).toBe('attention');
    expect(r.items[0].id).toBe('2');
  });

  it('returns null topTier when empty', () => {
    expect(buildDigestRollup([]).topTier).toBeNull();
  });

  it('ingests without resurrecting read items, and dedupes', () => {
    let s = createTriageState([n({ id: '1', read: true })]);
    s = triageReducer(s, { type: 'ingest', notifications: [n({ id: '1' }), n({ id: '2' })] });
    expect(s.items).toHaveLength(2);
    expect(s.items.find((i) => i.id === '1')?.read).toBe(true);
  });

  it('marks read, marks all read, dismisses', () => {
    let s = createTriageState([n({ id: '1' }), n({ id: '2' })]);
    s = triageReducer(s, { type: 'markRead', key: 'tracker:1' });
    expect(buildDigestRollup(s.items).unread).toBe(1);
    s = triageReducer(s, { type: 'markAllRead' });
    expect(buildDigestRollup(s.items).unread).toBe(0);
    s = triageReducer(s, { type: 'dismiss', key: 'tracker:2' });
    expect(s.items).toHaveLength(1);
  });

  it('keeps same-id notifications from different sources distinct', () => {
    let s = createTriageState([n({ id: '1', source: 'tracker' }), n({ id: '1', source: 'cozy' })]);
    expect(s.items).toHaveLength(2);
    s = triageReducer(s, { type: 'markRead', key: 'cozy:1' });
    expect(s.items.find((i) => i.source === 'tracker')?.read).toBe(false);
    expect(s.items.find((i) => i.source === 'cozy')?.read).toBe(true);
  });

  it('does not resurrect dismissed notifications on re-ingest', () => {
    let s = createTriageState([n({ id: '1' })]);
    s = triageReducer(s, { type: 'dismiss', key: 'tracker:1' });
    s = triageReducer(s, { type: 'ingest', notifications: [n({ id: '1' })] });
    expect(s.items).toHaveLength(0);
  });
});

describe('isSafeActionUrl', () => {
  it('allows safe URLs and rejects script schemes', () => {
    for (const u of ['https://a.com', 'http://a.com', 'mailto:a@b.c', '/path', '#x', './x', 'foo/bar']) {
      expect(isSafeActionUrl(u)).toBe(true);
    }
    for (const u of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,x', '//evil.com', '', undefined]) {
      expect(isSafeActionUrl(u as string | undefined)).toBe(false);
    }
  });
});
