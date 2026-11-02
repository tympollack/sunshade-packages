import {
  URGENCY_TIERS,
  type ActionableNotification,
  type DigestRollup,
  type TriageAction,
  type TriageState,
  type UrgencyTier,
} from './types';

/** Notifications are unique per (source, id), not by id alone. */
export function notificationKey(n: Pick<ActionableNotification, 'source' | 'id'>): string {
  return `${n.source}:${n.id}`;
}

export function tierRank(tier: UrgencyTier): number {
  return URGENCY_TIERS.indexOf(tier);
}

export function compareNotifications(a: ActionableNotification, b: ActionableNotification): number {
  return (
    tierRank(a.tier) - tierRank(b.tier) ||
    Number(a.read) - Number(b.read) ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export function sortNotifications(items: readonly ActionableNotification[]): ActionableNotification[] {
  return [...items].sort(compareNotifications);
}

export function buildDigestRollup(
  items: readonly ActionableNotification[],
  summary?: string
): DigestRollup {
  const unreadByTier: Record<UrgencyTier, number> = { critical: 0, attention: 0, info: 0 };
  for (const item of items) {
    if (!item.read) unreadByTier[item.tier] += 1;
  }
  const unread = unreadByTier.critical + unreadByTier.attention + unreadByTier.info;
  const topTier = URGENCY_TIERS.find((t) => unreadByTier[t] > 0) ?? null;
  return {
    total: items.length,
    unread,
    unreadByTier,
    topTier,
    items: sortNotifications(items),
    ...(summary !== undefined ? { summary } : {}),
  };
}

export function createTriageState(items: ActionableNotification[] = []): TriageState {
  return { items: dedupe(items), dismissed: [] };
}

function dedupe(items: readonly ActionableNotification[]): ActionableNotification[] {
  const map = new Map<string, ActionableNotification>();
  for (const item of items) map.set(notificationKey(item), item);
  return [...map.values()];
}

export function triageReducer(state: TriageState, action: TriageAction): TriageState {
  switch (action.type) {
    case 'ingest': {
      const dismissed = new Set(state.dismissed);
      const existing = new Map(state.items.map((i) => [notificationKey(i), i]));
      for (const incoming of action.notifications) {
        const key = notificationKey(incoming);
        if (dismissed.has(key)) continue;
        const prev = existing.get(key);
        // Never resurrect an already-read item as unread on re-ingest.
        existing.set(key, prev?.read ? { ...incoming, read: true } : incoming);
      }
      return { ...state, items: [...existing.values()] };
    }
    case 'markRead':
      return {
        ...state,
        items: state.items.map((i) => (notificationKey(i) === action.key ? { ...i, read: true } : i)),
      };
    case 'markAllRead':
      return { ...state, items: state.items.map((i) => (i.read ? i : { ...i, read: true })) };
    case 'dismiss':
      return {
        items: state.items.filter((i) => notificationKey(i) !== action.key),
        dismissed: state.dismissed.includes(action.key)
          ? state.dismissed
          : [...state.dismissed, action.key],
      };
    case 'reset':
      return createTriageState(action.notifications ?? []);
    default:
      return state;
  }
}
