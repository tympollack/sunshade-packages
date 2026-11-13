import type { CadenceConfig } from '../core/types';
import {
  useCadenceSession,
  type UseCadenceSessionOptions,
  type UseCadenceSessionResult,
} from '../hooks/useCadenceSession';

export const CADENCE_ECOSYSTEM_APPS = ['COZY', 'PATCHWORK', 'VOTARY'] as const;

export type CadenceEcosystemApp = (typeof CADENCE_ECOSYSTEM_APPS)[number];

export interface CadenceAppPreset {
  app: CadenceEcosystemApp;
  displayName: string;
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

export interface UseEcosystemCadenceSessionResult extends UseCadenceSessionResult {
  preset: CadenceAppPreset;
  chapterHeadline: string;
  chapterSubtext: string;
}

/**
 * Universal session bounding hook across Cozy (`COZY`), PatchWork (`PATCHWORK`),
 * and The Votary (`VOTARY`) (`STORY-ECO-CADENCE-GATES`).
 */
export function useEcosystemCadenceSession(
  app: CadenceEcosystemApp,
  overrides: UseCadenceSessionOptions = {},
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
    config: mergedConfig,
  });

  const reviewedCount =
    session.metrics.unitsConsumed > 0
      ? session.metrics.unitsConsumed
      : session.config.unitLimit;

  return {
    ...session,
    preset,
    chapterHeadline: preset.chapterHeadline,
    chapterSubtext: preset.formatChapterSubtext(reviewedCount),
  };
}
