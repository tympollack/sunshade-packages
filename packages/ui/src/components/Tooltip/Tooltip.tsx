import React, { useState, useRef, useEffect, useCallback, cloneElement } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import {
  type Placement,
  calculateFloatingPosition,
} from '../../utils/floatingAnchor';

export interface TooltipProps {
  /** Tooltip copy or content to display */
  content: React.ReactNode;
  /** Trigger element */
  children: React.ReactElement<any>;
  /** Placement direction (default 'top') */
  placement?: Placement;
  /** Pixel distance from trigger (default 6) */
  offset?: number;
  /** Open delay in ms (default 150) */
  openDelay?: number;
  /** Close delay in ms (default 100) */
  closeDelay?: number;
  /** Custom class name on tooltip bubble */
  className?: string;
  /** Test identifier */
  testID?: string;
}

/**
 * Tooltip - Lightweight portal-anchored tooltip primitive for @digitalcanopy/ui.
 * Mounts in a React Portal targeting document.body, positions relative to trigger
 * with collision flip/shift, and responds to mouse hover and keyboard focus.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  offset = 6,
  openDelay = 150,
  closeDelay = 100,
  className,
  testID = 'canopy-tooltip',
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = {
      width: tooltipRef.current.offsetWidth || 120,
      height: tooltipRef.current.offsetHeight || 32,
    };

    const result = calculateFloatingPosition(triggerRect, tooltipRect, {
      placement,
      offset,
    });
    setCoords({ top: result.top, left: result.left });
  }, [placement, offset]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updatePosition]);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, openDelay);
  };

  const handleMouseLeave = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, closeDelay);
  };

  const handleFocus = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsOpen(true);
  };

  const handleBlur = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen]);

  const childElement = children as React.ReactElement<any>;
  const clonedTrigger = cloneElement(childElement, {
    ref: (node: HTMLElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
      const { ref: originalRef } = childElement as unknown as { ref?: React.Ref<HTMLElement> };
      if (typeof originalRef === 'function') {
        originalRef(node);
      } else if (originalRef && 'current' in originalRef) {
        (originalRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      childElement.props?.onMouseEnter?.(e);
      handleMouseEnter();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childElement.props?.onMouseLeave?.(e);
      handleMouseLeave();
    },
    onFocus: (e: React.FocusEvent) => {
      childElement.props?.onFocus?.(e);
      handleFocus();
    },
    onBlur: (e: React.FocusEvent) => {
      childElement.props?.onBlur?.(e);
      handleBlur();
    },
    'aria-describedby': isOpen ? testID : undefined,
  } as any);

  return (
    <>
      {clonedTrigger}
      {isOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            id={testID}
            role="tooltip"
            data-testid={testID}
            style={{
              position: 'absolute',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999,
              pointerEvents: 'none',
            }}
            className={cn(
              'px-2.5 py-1 text-xs font-medium text-stone-200 select-none pointer-events-none',
              'bg-stone-900/95 backdrop-blur-md border border-stone-800 shadow-xl rounded-md',
              'animate-in fade-in zoom-in-95 duration-100',
              className
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}

export default Tooltip;
