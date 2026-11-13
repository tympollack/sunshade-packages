import React, { useMemo } from 'react';
import {
  ChapterEndCard,
  type ChapterEndCardProps,
} from '../components/ChapterEndCard';
import type { CadenceConfig } from '../core/types';
import {
  useCadenceSession,
  type UseCadenceSessionOptions,
  type UseCadenceSessionResult,
} from '../hooks/useCadenceSession';
import { getRandomWidget } from '../widgets/registry';

export const CADENCE_ECOSYSTEM_APPS = ['COZY', 'PATCHWORK', 'VOTARY'] as const;

export type CadenceEcosystemApp = (typeof CADENCE_ECOSYSTEM_APPS)[number];

export interface CadenceAppPreset {
  app: CadenceEcosystemApp;
  displayName: string;
  storageKeyPrefix: string;
  config: CadenceConfig;
  chapterHeadline: string;
  formatChapterSubtext: (unitsReviewed: number) => string;
}

export const CADENCE_APP_PRESETS: Readonly<
  Record<CadenceEcosystemApp, CadenceAppPreset>
> = {
  COZY: {
    app: 'COZY',
    displayName: 'Cozy Porch',
    storageKeyPrefix: 'sunshade:cadence:cozy',
    config: {
      unitLimit: 15,
      mode: 'soft_prompt',
      cooldownMinutes: 5,
      enabledCategories: ['vocab', 'poll', 'puzzle', 'eye'],
    },
    chapterHeadline: 'Chapter Complete · Your Space is Preserved',
    formatChapterSubtext: (unitsReviewed: number) =>
      `You have reviewed all ${unitsReviewed} active neighborhood updates. Your attention belongs to your life.`,
  },
  PATCHWORK: {
    app: 'PATCHWORK',
    displayName: 'PatchWork',
    storageKeyPrefix: 'sunshade:cadence:patchwork',
    config: {
      unitLimit: 12,
      mode: 'soft_prompt',
      cooldownMinutes: 5,
      enabledCategories: ['puzzle', 'eye', 'poll'],
    },
    chapterHeadline: 'Field Walk Chapter Complete · Grounded in Your Block',
    formatChapterSubtext: (unitsReviewed: number) =>
      `You have inspected ${unitsReviewed} local parcel and safety pins. Step away and enjoy your street.`,
  },
  VOTARY: {
    app: 'VOTARY',
    displayName: 'The Votary',
    storageKeyPrefix: 'sunshade:cadence:votary',
    config: {
      unitLimit: 10,
      mode: 'soft_prompt',
      cooldownMinutes: 10,
      enabledCategories: ['poll', 'vocab', 'eye'],
    },
    chapterHeadline: 'Deliberation Chapter Complete · Civic Focus Preserved',
    formatChapterSubtext: (unitsReviewed: number) =>
      `You have weighed in on ${unitsReviewed} civic proposals. Let your paired Advocate carry the heavy research.`,
  },
};

export function getCadenceAppPreset(app: CadenceEcosystemApp): CadenceAppPreset {
  const preset = CADENCE_APP_PRESETS[app];
  if (!preset) {
    throw new Error(`Unsupported Cadence ecosystem app: ${String(app)}`);
  }
  return {
    ...preset,
    config: {
      ...preset.config,
      enabledCategories: [...preset.config.enabledCategories],
    },
  };
}

export interface UseEcosystemCadenceSessionOptions extends UseCadenceSessionOptions {
  /** Optional callback invoked when the user clicks 'Close App & Step Away' on the chapter off-ramp. */
  onStepAway?: () => void;
  /** Optional deterministic RNG for selecting the chapter micro-widget. */
  rng?: () => number;
}

export interface UseEcosystemCadenceSessionResult extends UseCadenceSessionResult {
  preset: CadenceAppPreset;
  chapterHeadline: string;
  chapterSubtext: string;
  /** Pre-wired props for rendering `ChapterEndCard` at chapter boundaries in Cozy, PatchWork, or The Votary. */
  chapterCardProps: ChapterEndCardProps;
}

/**
 * Universal session bounding hook across Cozy (`COZY`), PatchWork (`PATCHWORK`),
 * and The Votary (`VOTARY`) (`STORY-ECO-CADENCE-GATES`).
 * Automatically namespaces browser storage per app so multi-app origins never collide.
 */
export function useEcosystemCadenceSession(
  app: CadenceEcosystemApp,
  overrides: UseEcosystemCadenceSessionOptions = {},
): UseEcosystemCadenceSessionResult {
  const preset = getCadenceAppPreset(app);

  const mergedConfig: Partial<CadenceConfig> = {
    ...preset.config,
    ...overrides.config,
    ...(overrides.unitLimit !== undefined ? { unitLimit: overrides.unitLimit } : {}),
    ...(overrides.mode !== undefined ? { mode: overrides.mode } : {}),
    ...(overrides.cooldownMinutes !== undefined
      ? { cooldownMinutes: overrides.cooldownMinutes }
      : {}),
  };

  const session = useCadenceSession({
    ...overrides,
    storageKeyPrefix: overrides.storageKeyPrefix ?? preset.storageKeyPrefix,
    config: mergedConfig,
  });

  const reviewedCount =
    session.metrics.unitsConsumed > 0
      ? session.metrics.unitsConsumed
      : session.config.unitLimit;

  const chapterHeadline = preset.chapterHeadline;
  const chapterSubtext = preset.formatChapterSubtext(reviewedCount);
  const chapterNumber = session.chapterIndex + 1;

  const widget = useMemo(
    () => getRandomWidget(session.config.enabledCategories, overrides.rng),
    [session.config.enabledCategories, overrides.rng, chapterNumber],
  );

  const chapterCardProps: ChapterEndCardProps = {
    chapterNumber,
    unitsReviewed: reviewedCount,
    headline: chapterHeadline,
    subtext: chapterSubtext,
    widget,
    cooldownRemainingSeconds: session.cooldownRemaining,
    onStepAway: overrides.onStepAway,
    onLoadNextChapter: () => {
      if (session.isChapterComplete && session.cooldownRemaining <= 0) {
        session.advanceChapter();
      }
    },
  };

  return {
    ...session,
    preset,
    chapterHeadline,
    chapterSubtext,
    chapterCardProps,
  };
}

export interface EcosystemChapterOffRampProps extends Partial<ChapterEndCardProps> {
  /** Session object returned by `useEcosystemCadenceSession`. */
  session: UseEcosystemCadenceSessionResult;
}

/**
 * Renders the standardized `ChapterEndCard` off-ramp for Cozy, PatchWork, or The Votary
 * whenever `session.isChapterComplete` is reached, wired directly to `session.chapterCardProps`.
 */
export function EcosystemChapterOffRamp({
  session,
  ...cardOverrides
}: EcosystemChapterOffRampProps): React.ReactElement | null {
  if (!session.isChapterComplete) {
    return null;
  }
  return React.createElement(ChapterEndCard, {
    ...session.chapterCardProps,
    ...cardOverrides,
  });
}
