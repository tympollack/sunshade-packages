import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { type Placement, calculateFloatingPosition } from '../../utils/floatingAnchor';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  placement?: Placement;
  offset?: number;
  viewportPadding?: number;
  className?: string;
  menuClassName?: string;
  ariaLabel?: string;
  testID?: string;
}

/**
 * Select - Portaled accessible select primitive for @digitalcanopy/ui.
 * Renders options in document.body (z-[100]) with viewport collision padding
 * so parent overflow-hidden containers never clip the listbox.
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  placement = 'bottom-start',
  offset = 6,
  viewportPadding = 12,
  className,
  menuClassName,
  ariaLabel = 'Select option',
  testID = 'canopy-select',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number }>({
    top: 0,
    left: 0,
    minWidth: 180,
  });

  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = {
      width: Math.max(menuRef.current.offsetWidth || 0, triggerRect.width || 180),
      height: menuRef.current.offsetHeight || Math.min(options.length * 36 + 12, 280),
    };

    const result = calculateFloatingPosition(triggerRect, menuRect, {
      placement,
      offset,
      viewportPadding,
    });

    setCoords({
      top: result.top,
      left: result.left,
      minWidth: Math.max(triggerRect.width, 180),
    });
  }, [placement, offset, viewportPadding, options.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const enabledIndices = options
      .map((opt, idx) => (!opt.disabled ? idx : -1))
      .filter((idx) => idx !== -1);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (enabledIndices.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => {
          const pos = enabledIndices.indexOf(prev);
          return enabledIndices[(pos + 1) % enabledIndices.length];
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => {
          const pos = enabledIndices.indexOf(prev);
          return enabledIndices[pos <= 0 ? enabledIndices.length - 1 : pos - 1];
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(enabledIndices[0]);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(enabledIndices[enabledIndices.length - 1]);
      } else if ((e.key === 'Enter' || e.key === ' ') && activeIndex >= 0) {
        e.preventDefault();
        const opt = options[activeIndex];
        if (opt && !opt.disabled) {
          onChange?.(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, options, activeIndex, onChange]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        data-testid={testID}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((prev) => !prev);
        }}
        className={cn(
          'min-h-[40px] px-3 py-2 rounded-lg border border-stone-800 bg-stone-900/90 text-stone-100',
          'inline-flex items-center justify-between gap-2 text-sm font-medium',
          'hover:border-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-stone-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span aria-hidden="true" className="text-stone-400 text-xs shrink-0">
          ▾
        </span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            data-testid={`${testID}-menu`}
            style={{
              position: 'absolute',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.minWidth}px`,
              zIndex: 100,
            }}
            className={cn(
              'z-[100] max-w-[calc(100vw-24px)] max-h-[min(280px,calc(100dvh-24px))] overflow-y-auto overscroll-contain p-1.5',
              'bg-stone-900/95 backdrop-blur-md border border-stone-800 shadow-xl rounded-lg text-stone-100',
              menuClassName
            )}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = activeIndex === idx;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  data-testid={`${testID}-option-${opt.value}`}
                  data-active={isActive ? 'true' : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!opt.disabled) {
                      onChange?.(opt.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md text-left transition-colors',
                    opt.disabled && 'opacity-40 cursor-not-allowed text-stone-500',
                    !opt.disabled &&
                      (isSelected || isActive
                        ? 'bg-stone-800 text-stone-100 font-semibold'
                        : 'text-stone-300 hover:bg-stone-800/70 hover:text-stone-100')
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <span aria-hidden="true" className="text-amber-400 ml-2 shrink-0">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

export default Select;
