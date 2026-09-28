import React from 'react';
import { cn } from '../../utils/cn';
import {
  type SelectableTileVariant,
  VARIANT_CONTRAST_TOKENS,
  CONTRAST_TYPOGRAPHY,
} from '../../tokens/contrast';

export interface SelectableTileProps {
  /** Whether the tile is in an active/selected state */
  selected: boolean;
  /** Accent variant color for border, surface tint, and icon badge */
  variant: SelectableTileVariant;
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
 * SelectableTile - Accessible status card primitive enforcing WCAG AA contrast.
 * Decouples status accent hues strictly to container surface tints and borders,
 * hardcoding primary and secondary typography to high-contrast white and stone-400.
 */
export function SelectableTile({
  selected,
  variant = 'stone',
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
  const token = VARIANT_CONTRAST_TOKENS[variant] || VARIANT_CONTRAST_TOKENS.stone;

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
    // Base layout & surface
    'w-full flex items-center gap-3.5 p-4 rounded-2xl border text-left',
    'transition-all duration-150 select-none relative overflow-hidden',
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
      backgroundColor: token.surfaceTintColor,
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
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/10 shadow-sm text-xl',
          token.iconBgClass,
          token.iconTextClass
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
              CONTRAST_TYPOGRAPHY.title.className
            )}
            style={{ color: CONTRAST_TYPOGRAPHY.title.color }}
          >
            {title}
          </span>
          {trailing}
        </div>
        <p
          className={cn(
            'text-xs leading-relaxed mt-0.5 line-clamp-2',
            CONTRAST_TYPOGRAPHY.description.className
          )}
          style={{ color: CONTRAST_TYPOGRAPHY.description.color }}
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
