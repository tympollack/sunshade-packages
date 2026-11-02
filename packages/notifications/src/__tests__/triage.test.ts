import { describe, expect, it } from 'vitest';
import { buildDigestRollup, createTriageState, triageReducer } from '../triage';
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
    s = triageReducer(s, { type: 'markRead', id: '1' });
    expect(buildDigestRollup(s.items).unread).toBe(1);
    s = triageReducer(s, { type: 'markAllRead' });
    expect(buildDigestRollup(s.items).unread).toBe(0);
    s = triageReducer(s, { type: 'dismiss', id: '2' });
    expect(s.items).toHaveLength(1);
  });
});
