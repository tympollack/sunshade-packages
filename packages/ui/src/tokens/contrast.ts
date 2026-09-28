/**
 * @digitalcanopy/ui Design System - Accessible Contrast Tokens
 * Strict color contract decoupling status accent hues from typography to prevent low-contrast text drift.
 */

export type SelectableTileVariant = 'amber' | 'sky' | 'purple' | 'stone' | 'slate' | 'indigo';

export interface VariantContrastToken {
  name: SelectableTileVariant;
  accent: string;
  accentRgb: [number, number, number];
  surfaceTintClass: string;
  surfaceTintColor: string;
  /** Opaque precomposited dark surface hex (#1A1A1A + 10% tint) guaranteeing contrast on any parent */
  effectiveSurfaceHex: string;
  effectiveSurfaceRgb: [number, number, number];
  borderStrokeClass: string;
  borderStrokeColor: string;
  hoverBorderClass: string;
  hoverBorderColor: string;
  activeRingClass: string;
  iconBgClass: string;
  iconTextClass: string;
}

export const CONTRAST_TYPOGRAPHY = {
  /** High-contrast primary title: minimum 7:1 contrast ratio against dark surfaces */
  title: {
    color: '#F9F9F9',
    className: 'text-stone-100',
    minContrastRatio: 7.0,
  },
  /** Accessible secondary body: minimum 4.5:1 WCAG AA contrast ratio against dark surfaces */
  description: {
    color: '#A8A29E',
    className: 'text-stone-400',
    minContrastRatio: 4.5,
  },
  /** Base surface reference for contrast computations */
  baseSurface: '#1A1A1A',
} as const;

export const VARIANT_CONTRAST_TOKENS: Record<SelectableTileVariant, VariantContrastToken> = {
  amber: {
    name: 'amber',
    accent: '#F59E0B',
    accentRgb: [245, 158, 11],
    surfaceTintClass: 'bg-amber-500/10',
    surfaceTintColor: 'rgba(245, 158, 11, 0.10)',
    effectiveSurfaceHex: '#302719',
    effectiveSurfaceRgb: [48, 39, 25],
    borderStrokeClass: 'border-amber-500/30',
    borderStrokeColor: 'rgba(245, 158, 11, 0.30)',
    hoverBorderClass: 'hover:border-amber-400/60',
    hoverBorderColor: 'rgba(251, 191, 36, 0.60)',
    activeRingClass: 'ring-2 ring-amber-400/80 border-amber-400',
    iconBgClass: 'bg-amber-500/20',
    iconTextClass: 'text-amber-400',
  },
  sky: {
    name: 'sky',
    accent: '#0EA5E9',
    accentRgb: [14, 165, 233],
    surfaceTintClass: 'bg-sky-500/10',
    surfaceTintColor: 'rgba(14, 165, 233, 0.10)',
    effectiveSurfaceHex: '#19282F',
    effectiveSurfaceRgb: [25, 40, 47],
    borderStrokeClass: 'border-sky-500/30',
    borderStrokeColor: 'rgba(14, 165, 233, 0.30)',
    hoverBorderClass: 'hover:border-sky-400/60',
    hoverBorderColor: 'rgba(56, 189, 248, 0.60)',
    activeRingClass: 'ring-2 ring-sky-400/80 border-sky-400',
    iconBgClass: 'bg-sky-500/20',
    iconTextClass: 'text-sky-400',
  },
  purple: {
    name: 'purple',
    accent: '#A855F7',
    accentRgb: [168, 85, 247],
    surfaceTintClass: 'bg-purple-500/10',
    surfaceTintColor: 'rgba(168, 85, 247, 0.10)',
    effectiveSurfaceHex: '#282030',
    effectiveSurfaceRgb: [40, 32, 48],
    borderStrokeClass: 'border-purple-500/30',
    borderStrokeColor: 'rgba(168, 85, 247, 0.30)',
    hoverBorderClass: 'hover:border-purple-400/60',
    hoverBorderColor: 'rgba(192, 132, 252, 0.60)',
    activeRingClass: 'ring-2 ring-purple-400/80 border-purple-400',
    iconBgClass: 'bg-purple-500/20',
    iconTextClass: 'text-purple-400',
  },
  stone: {
    name: 'stone',
    accent: '#78716C',
    accentRgb: [120, 113, 108],
    surfaceTintClass: 'bg-stone-500/10',
    surfaceTintColor: 'rgba(120, 113, 108, 0.10)',
    effectiveSurfaceHex: '#232322',
    effectiveSurfaceRgb: [35, 35, 34],
    borderStrokeClass: 'border-stone-500/30',
    borderStrokeColor: 'rgba(120, 113, 108, 0.30)',
    hoverBorderClass: 'hover:border-stone-400/60',
    hoverBorderColor: 'rgba(168, 162, 158, 0.60)',
    activeRingClass: 'ring-2 ring-stone-400/80 border-stone-400',
    iconBgClass: 'bg-stone-500/20',
    iconTextClass: 'text-stone-400',
  },
  slate: {
    name: 'slate',
    accent: '#64748B',
    accentRgb: [100, 116, 139],
    surfaceTintClass: 'bg-slate-500/10',
    surfaceTintColor: 'rgba(100, 116, 139, 0.10)',
    effectiveSurfaceHex: '#212325',
    effectiveSurfaceRgb: [33, 35, 37],
    borderStrokeClass: 'border-slate-500/30',
    borderStrokeColor: 'rgba(100, 116, 139, 0.30)',
    hoverBorderClass: 'hover:border-slate-400/60',
    hoverBorderColor: 'rgba(148, 163, 184, 0.60)',
    activeRingClass: 'ring-2 ring-slate-400/80 border-slate-400',
    iconBgClass: 'bg-slate-500/20',
    iconTextClass: 'text-slate-400',
  },
  indigo: {
    name: 'indigo',
    accent: '#6366F1',
    accentRgb: [99, 102, 241],
    surfaceTintClass: 'bg-indigo-500/10',
    surfaceTintColor: 'rgba(99, 102, 241, 0.10)',
    effectiveSurfaceHex: '#212230',
    effectiveSurfaceRgb: [33, 34, 48],
    borderStrokeClass: 'border-indigo-500/30',
    borderStrokeColor: 'rgba(99, 102, 241, 0.30)',
    hoverBorderClass: 'hover:border-indigo-400/60',
    hoverBorderColor: 'rgba(129, 140, 248, 0.60)',
    activeRingClass: 'ring-2 ring-indigo-400/80 border-indigo-400',
    iconBgClass: 'bg-indigo-500/20',
    iconTextClass: 'text-indigo-400',
  },
};

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB component.
 */
function channelLuminance(channel: number): number {
  const norm = channel / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

/**
 * Calculates WCAG relative luminance from an [R, G, B] tuple.
 */
export function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Parses a hex color string (#RGB or #RRGGBB) to [R, G, B].
 */
export function parseHexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Converts an [R, G, B] tuple to a hex string (#RRGGBB).
 */
export function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

/**
 * Blends a foreground color with alpha over an opaque background color.
 */
export function compositeColor(
  fgRgb: [number, number, number],
  alpha: number,
  bgRgb: [number, number, number]
): [number, number, number] {
  return [
    Math.round(alpha * fgRgb[0] + (1 - alpha) * bgRgb[0]),
    Math.round(alpha * fgRgb[1] + (1 - alpha) * bgRgb[1]),
    Math.round(alpha * fgRgb[2] + (1 - alpha) * bgRgb[2]),
  ];
}

/**
 * Computes the WCAG contrast ratio between two [R, G, B] colors.
 * Returns ratio as a float (e.g. 7.2 for 7.2:1).
 */
export function calculateContrastRatio(
  color1: [number, number, number],
  color2: [number, number, number]
): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculates the effective surface color for a SelectableTile variant
 * by compositing the 10% tint over the base dark surface (#1A1A1A).
 */
export function getVariantEffectiveSurface(
  variant: SelectableTileVariant,
  baseSurfaceHex: string = CONTRAST_TYPOGRAPHY.baseSurface
): [number, number, number] {
  const token = VARIANT_CONTRAST_TOKENS[variant];
  const baseRgb = parseHexToRgb(baseSurfaceHex);
  return compositeColor(token.accentRgb, 0.10, baseRgb);
}
