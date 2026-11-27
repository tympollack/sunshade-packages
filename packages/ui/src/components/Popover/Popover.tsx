import React, { useState, useRef, useEffect, useCallback, useId, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import {
  type Placement,
  calculateFloatingPosition,
} from '../../utils/floatingAnchor';
import {
  registerFloatingOverlay,
  unregisterFloatingOverlay,
} from '../Modal/modalManager';

export interface PopoverProps {
  /** Controlled open state */
  isOpen?: boolean;
  /** Callback triggered when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Element acting as trigger anchor */
  trigger: React.ReactElement<any>;
  /** Popover body content */
  children: React.ReactNode;
  /** Preferred placement */
  placement?: Placement;
  /** Pixel distance from trigger (default 8) */
  offset?: number;
  /** Viewport edge collision padding in px (default 12) */
  viewportPadding?: number;
  /** Class name on floating container */
  className?: string;
  /** Whether clicking outside dismisses popover (default true) */
  closeOnOutsideClick?: boolean;
  /** Whether Escape key dismisses popover (default true) */
  closeOnEscape?: boolean;
  /** Testing identifier */
  testID?: string;
}

/**
 * Popover - Portal-anchored floating panel primitive for @digitalcanopy/ui.
 * Mounts in a React Portal targeting document.body (z-[100]) to prevent clipping in overflow-hidden containers,
 * calculates collision flip/shift, and dismisses on outside clicks and Escape.
 */
export function Popover({
  isOpen: controlledIsOpen,
  onOpenChange,
  trigger,
  children,
  placement = 'bottom-start',
  offset = 8,
  viewportPadding = 12,
  className,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  testID = 'canopy-popover',
}: PopoverProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : internalIsOpen;

  const overlayId = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    registerFloatingOverlay(overlayId);
    return () => unregisterFloatingOverlay(overlayId);
  }, [open, overlayId]);

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalIsOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = {
      width: popoverRef.current.offsetWidth || 240,
      height: popoverRef.current.offsetHeight || 120,
    };

    const result = calculateFloatingPosition(triggerRect, popoverRect, {
      placement,
      offset,
      viewportPadding,
    });
    setCoords({ top: result.top, left: result.left });
  }, [placement, offset, viewportPadding]);

  // Update position on open, scroll, or resize
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

  // Outside click & Escape dismissals
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!closeOnOutsideClick) return;
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closeOnOutsideClick, closeOnEscape, setOpen]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
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
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
  } as any);

  return (
    <>
      {clonedTrigger}
      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            data-testid={testID}
            style={{
              position: 'absolute',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 100,
            }}
            className={cn(
              'z-[100] min-w-[200px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain p-4 outline-none select-text',
              'bg-stone-900/95 backdrop-blur-md border border-stone-800 shadow-xl rounded-lg text-stone-100',
              'animate-in fade-in zoom-in-95 duration-150',
              className
            )}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

export default Popover;
