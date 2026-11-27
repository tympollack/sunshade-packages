import React from 'react';
import { cn } from '../../utils/cn';
import {
  type AnyContrastVariant,
  type ContrastThemeMode,
  CONTRAST_TYPOGRAPHY,
  PAIRED_TYPOGRAPHY,
  resolveContrastToken,
} from '../../tokens/contrast';

export interface SelectableTileProps {
  /** Whether the tile is in an active/selected state */
  selected: boolean;
  /** Accent variant color for border, surface tint, and icon badge */
  variant: AnyContrastVariant;
  /** Color mode for paired high-contrast foreground tokens (default 'dark') */
  theme?: ContrastThemeMode;
  /** Icon or emoji element rendered in the leading badge */
  icon: React.ReactNode;
  /** High-contrast primary title (#F9F9F9 / text-stone-100) */
  title: string;
  /** Accessible secondary body text (#A8A29E / text-stone-400) */
  description: string;
  /** Click handler triggered upon selection */
  onClick?: () => void;
  /** Optional press handler for cross-platform / Solito compatibility */
  onPress?: () => void;
  /** Disables click interaction and lowers opacity */
  disabled?: boolean;
  /** Semantic container element (defaults to 'button') */
  as?: 'button' | 'div';
  /** Optional container class name extensions */
  className?: string;
  /** Inline style overrides for outer container */
  style?: React.CSSProperties;
  /** Optional badge or extra trailing content */
  trailing?: React.ReactNode;
  /** Testing identifier */
  testID?: string;
}

/**
 * SelectableTile - Accessible status card primitive for web enforcing WCAG AA contrast.
 * Decouples status accent hues strictly to container surface tints and borders,
 * hardcoding primary and secondary typography to high-contrast white and stone-400.
 * Guarantees an opaque dark base (#1A1A1A) so text never washes out on light parent surfaces.
 */
export function SelectableTile({
  selected,
  variant = 'stone',
  theme = 'dark',
  icon,
  title,
  description,
  onClick,
  onPress,
  disabled = false,
  as = 'button',
  className,
  style,
  trailing,
  testID,
}: SelectableTileProps) {
  const token = resolveContrastToken(variant);
  const typography = theme === 'light' ? PAIRED_TYPOGRAPHY.light : CONTRAST_TYPOGRAPHY;
  const effectiveSurfaceHex =
    theme === 'light' ? token.effectiveLightSurfaceHex : token.effectiveSurfaceHex;

  const handleClick = () => {
    if (disabled) return;
    if (onClick) {
      onClick();
    } else if (onPress) {
      onPress();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const containerClasses = cn(
    // Base layout & opaque surface ensuring contrast on any parent theme
    'w-full flex items-center gap-3.5 p-4 rounded-2xl border text-left',
    'transition-all duration-150 select-none relative overflow-hidden',
    theme === 'light' ? 'bg-[#F9F9F9]' : 'bg-[#1A1A1A]',
    token.surfaceTintClass,
    // Tactile & focus states
    'active:scale-[0.98]',
    token.hoverBorderClass,
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
    // Selection state
    selected
      ? token.activeRingClass
      : cn(token.borderStrokeClass, 'hover:border-opacity-60'),
    // Disabled state
    disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
    className
  );

  const containerProps = {
    'data-testid': testID,
    className: containerClasses,
    style: {
      backgroundColor: effectiveSurfaceHex,
      ...style,
    },
    onClick: handleClick,
    'aria-pressed': as === 'button' ? selected : undefined,
    'aria-disabled': disabled,
    tabIndex: disabled ? -1 : 0,
    role: as === 'div' ? 'button' : undefined,
  };

  const content = (
    <>
      {/* Icon Badge with status accent background */}
      <div
        className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm text-xl',
          theme === 'light' ? 'border-black/10' : 'border-white/10',
          token.iconBgClass,
          theme === 'light' ? token.lightIconTextClass : token.iconTextClass
        )}
        aria-hidden="true"
      >
        {icon}
      </div>

      {/* Typography container: strict contrast contract */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'font-semibold text-sm sm:text-base leading-snug tracking-tight',
              typography.title.className
            )}
            style={{ color: typography.title.color }}
          >
            {title}
          </span>
          {trailing}
        </div>
        <p
          className={cn(
            'text-xs leading-relaxed mt-0.5 line-clamp-2',
            typography.description.className
          )}
          style={{ color: typography.description.color }}
        >
          {description}
        </p>
      </div>
    </>
  );

  if (as === 'div') {
    return (
      <div {...containerProps} onKeyDown={handleKeyDown}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      {...containerProps}
      onKeyDown={handleKeyDown}
    >
      {content}
    </button>
  );
}

export default SelectableTile;
