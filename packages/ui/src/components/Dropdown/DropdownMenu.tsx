import React, { useState, useRef, useEffect, useCallback, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import {
  type Placement,
  calculateFloatingPosition,
} from '../../utils/floatingAnchor';

export interface DropdownMenuItem {
  /** Unique item identifier */
  id?: string;
  /** Primary label text or element */
  label: React.ReactNode;
  /** Leading icon */
  icon?: React.ReactNode;
  /** Keyboard shortcut hint string (e.g. '⌘K') */
  shortcut?: string;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Applies destructive red styling */
  danger?: boolean;
  /** Click handler triggered upon selection */
  onClick?: () => void;
}

export interface DropdownMenuProps {
  /** Menu items list */
  items: DropdownMenuItem[];
  /** Trigger element that opens dropdown */
  trigger: React.ReactElement<any>;
  /** Controlled open state */
  isOpen?: boolean;
  /** Open change callback */
  onOpenChange?: (open: boolean) => void;
  /** Placement direction (default 'bottom-start') */
  placement?: Placement;
  /** Distance from trigger (default 6) */
  offset?: number;
  /** Additional styling on dropdown container */
  className?: string;
  /** Test identifier */
  testID?: string;
}

/**
 * DropdownMenu - Portal-anchored floating dropdown menu primitive for @digitalcanopy/ui.
 * Mounts in a React Portal, positions relative to trigger with collision flip/shift,
 * and provides full keyboard arrow navigation (ArrowDown, ArrowUp, Home, End, Enter, Escape).
 */
export function DropdownMenu({
  items,
  trigger,
  isOpen: controlledIsOpen,
  onOpenChange,
  placement = 'bottom-start',
  offset = 6,
  className,
  testID = 'canopy-dropdown',
}: DropdownMenuProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : internalIsOpen;

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const triggerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalIsOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        setActiveIndex(-1);
      }
    },
    [isControlled, onOpenChange]
  );

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = {
      width: menuRef.current.offsetWidth || 200,
      height: menuRef.current.offsetHeight || items.length * 36 + 16,
    };

    const result = calculateFloatingPosition(triggerRect, menuRect, {
      placement,
      offset,
    });
    setCoords({ top: result.top, left: result.left });
  }, [placement, offset, items.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, updatePosition]);

  // Outside click & Escape handlers
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
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, setOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      const enabledIndices = items
        .map((it, idx) => (!it.disabled ? idx : -1))
        .filter((idx) => idx !== -1);

      if (enabledIndices.length === 0) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setActiveIndex((prev) => {
            const currentPos = enabledIndices.indexOf(prev);
            const nextPos = (currentPos + 1) % enabledIndices.length;
            return enabledIndices[nextPos];
          });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setActiveIndex((prev) => {
            const currentPos = enabledIndices.indexOf(prev);
            const nextPos = currentPos <= 0 ? enabledIndices.length - 1 : currentPos - 1;
            return enabledIndices[nextPos];
          });
          break;
        }
        case 'Home': {
          e.preventDefault();
          setActiveIndex(enabledIndices[0]);
          break;
        }
        case 'End': {
          e.preventDefault();
          setActiveIndex(enabledIndices[enabledIndices.length - 1]);
          break;
        }
        case 'Enter':
        case ' ': {
          if (activeIndex >= 0 && activeIndex < items.length) {
            e.preventDefault();
            const item = items[activeIndex];
            if (!item.disabled) {
              item.onClick?.();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }
          break;
        }
      }
    },
    [open, items, activeIndex, setOpen]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, handleKeyDown]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  const triggerElement = trigger as React.ReactElement<any>;
  const clonedTrigger = cloneElement(triggerElement, {
    ref: (node: HTMLElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
      const { ref: originalRef } = triggerElement as unknown as { ref?: React.Ref<HTMLElement> };
      if (typeof originalRef === 'function') {
        originalRef(node);
      } else if (originalRef && 'current' in originalRef) {
        (originalRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onClick: (e: React.MouseEvent) => {
      triggerElement.props?.onClick?.(e);
      handleTriggerClick(e);
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
  } as any);

  return (
    <>
      {clonedTrigger}
      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            data-testid={testID}
            style={{
              position: 'absolute',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
            }}
            className={cn(
              'min-w-[180px] p-1.5 outline-none',
              'bg-stone-900/95 backdrop-blur-md border border-stone-800 shadow-xl rounded-lg text-stone-100',
              'animate-in fade-in zoom-in-95 duration-100',
              className
            )}
          >
            {items.map((item, idx) => {
              const isActive = activeIndex === idx;
              return (
                <button
                  key={item.id || idx}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  data-testid={`${testID}-item-${idx}`}
                  data-active={isActive ? 'true' : undefined}
                  onFocus={() => {
                    if (!item.disabled) {
                      setActiveIndex(idx);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!item.disabled) {
                      item.onClick?.();
                      setOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md font-medium text-left transition-colors',
                    item.disabled && 'opacity-40 cursor-not-allowed text-stone-500',
                    !item.disabled && !item.danger && (isActive ? 'bg-stone-800 text-stone-100' : 'text-stone-300 hover:bg-stone-800/70 hover:text-stone-100'),
                    !item.disabled && item.danger && (isActive ? 'bg-red-950/60 text-red-300' : 'text-red-400 hover:bg-red-950/40 hover:text-red-300')
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.icon && <span className="shrink-0 text-stone-400">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <span className="text-[10px] text-stone-500 font-mono tracking-wider ml-3 shrink-0">
                      {item.shortcut}
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

export default DropdownMenu;
