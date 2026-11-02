import {
  URGENCY_TIERS,
  type ActionableNotification,
  type DigestRollup,
  type TriageAction,
  type TriageState,
  type UrgencyTier,
} from './types';

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
  return { items: dedupe(items) };
}

function dedupe(items: readonly ActionableNotification[]): ActionableNotification[] {
  const map = new Map<string, ActionableNotification>();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

export function triageReducer(state: TriageState, action: TriageAction): TriageState {
  switch (action.type) {
    case 'ingest': {
      const existing = new Map(state.items.map((i) => [i.id, i]));
      for (const incoming of action.notifications) {
        const prev = existing.get(incoming.id);
        // Never resurrect an already-read item as unread on re-ingest.
        existing.set(incoming.id, prev?.read ? { ...incoming, read: true } : incoming);
      }
      return { items: [...existing.values()] };
    }
    case 'markRead':
      return {
        items: state.items.map((i) => (i.id === action.id ? { ...i, read: true } : i)),
      };
    case 'markAllRead':
      return { items: state.items.map((i) => (i.read ? i : { ...i, read: true })) };
    case 'dismiss':
      return { items: state.items.filter((i) => i.id !== action.id) };
    case 'reset':
      return createTriageState(action.notifications ?? []);
    default:
      return state;
  }
}
