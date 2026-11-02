/** Urgency tiers, ordered from most to least urgent. */
export type UrgencyTier = 'critical' | 'attention' | 'info';

export const URGENCY_TIERS: readonly UrgencyTier[] = ['critical', 'attention', 'info'];

export interface ActionableNotification {
  id: string;
  tier: UrgencyTier;
  title: string;
  body?: string;
  /** Originating app/feature, e.g. "tracker", "cozy", "hub". */
  source: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  /** Optional grouping key (e.g. peer care drops from the same sender). */
  groupKey?: string;
}

export interface DigestRollup {
  total: number;
  unread: number;
  unreadByTier: Record<UrgencyTier, number>;
  /** Highest tier among unread items, or null when everything is read. */
  topTier: UrgencyTier | null;
  /** Items sorted by tier, then unread first, then newest first. */
  items: ActionableNotification[];
  /** Optional AI-generated summary of the digest. */
  summary?: string;
}

/** AI summarization contract: implemented by consuming apps. */
export type DigestSummarizer = (
  items: readonly ActionableNotification[],
  signal?: AbortSignal
) => Promise<string>;

export interface TriageState {
  items: ActionableNotification[];
}

export type TriageAction =
  | { type: 'ingest'; notifications: ActionableNotification[] }
  | { type: 'markRead'; id: string }
  | { type: 'markAllRead' }
  | { type: 'dismiss'; id: string }
  | { type: 'reset'; notifications?: ActionableNotification[] };
